import type { Command, PlayerId, TeamId } from '@gambit/protocol';
import { DEFAULT_SETTINGS, GameSettingsSchema, otherTeam } from '@gambit/protocol';
import { assert, fail } from '../errors';
import type { Ctx, InternalCommand } from '../game/apply';
import { emptyTeam, nextId } from '../game/create';
import { generateKey } from '../board/key';
import { WORDS_EN } from '../words/en';
import { BOARD_SIZE, MAX_PLAYERS, MIN_PLAYERS, type Player } from '../state';
import { buildDeck, drawCards } from '../cards/deck';
import { startTurn } from '../turn/reducer';
import { projectPlayer } from '../views/project';

type LobbyCommand =
  | Extract<
      Command,
      {
        type:
          | 'JOIN_GAME'
          | 'LEAVE'
          | 'SET_TEAM'
          | 'SET_ROLE'
          | 'TOGGLE_READY'
          | 'START_GAME'
          | 'PROMOTE_SPYMASTER'
          | 'REQUEST_REMATCH';
      }
    >
  | Extract<InternalCommand, { type: 'INTERNAL_SEAT' }>;

const requireActor = (ctx: Ctx): Player => {
  const p = ctx.actorId ? ctx.state.players[ctx.actorId] : undefined;
  if (!p) return fail('NOT_AUTHED');
  return p;
};

const emitPlayerUpdated = (ctx: Ctx, p: Player) =>
  ctx.sink.public({ type: 'PLAYER_UPDATED', player: projectPlayer(ctx.state, p) });

export const applyLobbyCommand = (ctx: Ctx, cmd: LobbyCommand): void => {
  const { state } = ctx;
  switch (cmd.type) {
    case 'JOIN_GAME': {
      const nick = cmd.nickname.trim();
      const players = Object.values(state.players);
      assert(players.filter((p) => p.seat.status !== 'left').length < MAX_PLAYERS, 'ROOM_FULL');
      assert(!players.some((p) => p.seat.status !== 'left' && p.nickname.toLowerCase() === nick.toLowerCase()), 'NAME_TAKEN');
      const id = nextId(state, 'p');
      const player: Player = {
        id,
        nickname: nick,
        team: null,
        role: 'spectator',
        ready: false,
        seat: { status: 'connected', lastSeenAt: ctx.now },
        joinedAt: ctx.now,
        joinedAtTurn: state.turn?.index ?? null,
        keyTainted: false,
      };
      state.players[id] = player;
      if (!state.hostId) state.hostId = id;
      ctx.sink.public({ type: 'PLAYER_JOINED', player: projectPlayer(state, player) });
      return;
    }
    case 'LEAVE': {
      const p = requireActor(ctx);
      if (state.status === 'lobby') {
        delete state.players[p.id];
      } else {
        p.seat = { status: 'left', lastSeenAt: ctx.now };
        p.ready = false;
      }
      if (state.hostId === p.id) state.hostId = pickNewHost(ctx, p.id);
      ctx.sink.public({ type: 'PLAYER_LEFT', playerId: p.id, nickname: p.nickname });
      if (state.status === 'in_game') checkSpymasterVacancy(ctx, p);
      return;
    }
    case 'INTERNAL_SEAT': {
      const p = state.players[cmd.playerId];
      if (!p) return fail('PLAYER_NOT_FOUND');
      const was = p.seat.status;
      p.seat = { status: cmd.status, lastSeenAt: ctx.now };
      if (cmd.status === 'connected' && was !== 'connected') {
        ctx.sink.public({ type: 'PLAYER_RECONNECTED', playerId: p.id });
      } else if (cmd.status !== 'connected' && was === 'connected') {
        ctx.sink.public({ type: 'PLAYER_DISCONNECTED', playerId: p.id });
        if (state.status === 'in_game') checkSpymasterVacancy(ctx, p);
      }
      if (state.hostId === p.id && cmd.status !== 'connected') {
        const newHost = pickNewHost(ctx, p.id);
        if (newHost) state.hostId = newHost;
      }
      return;
    }
    case 'SET_TEAM': {
      const p = requireActor(ctx);
      if (state.status === 'lobby') {
        if (cmd.team === null) {
          p.team = null;
          p.role = 'spectator';
        } else {
          p.team = cmd.team;
          const smTaken = p.role === 'spymaster' && spymasterOf(ctx, cmd.team, p.id) !== undefined;
          if (p.role === 'spectator' || smTaken) p.role = 'operative';
        }
        p.ready = false;
      } else if (state.status === 'in_game') {
        // Late joiners may pick a team as operative (never spymaster) once.
        assert(p.team === null, 'WRONG_STATUS', 'You already have a team.');
        assert(cmd.team !== null, 'BAD_PAYLOAD');
        p.team = cmd.team;
        p.role = 'operative';
      } else {
        return fail('WRONG_STATUS');
      }
      emitPlayerUpdated(ctx, p);
      return;
    }
    case 'SET_ROLE': {
      const p = requireActor(ctx);
      assert(state.status === 'lobby', 'WRONG_STATUS');
      if (cmd.role === 'spectator') {
        p.team = null;
        p.role = 'spectator';
      } else {
        const team = p.team;
        if (team === null) return fail('WRONG_STATUS', 'Join a team first.');
        if (cmd.role === 'spymaster') assert(!spymasterOf(ctx, team, p.id), 'SPYMASTER_TAKEN');
        p.role = cmd.role;
      }
      p.ready = false;
      emitPlayerUpdated(ctx, p);
      return;
    }
    case 'TOGGLE_READY': {
      const p = requireActor(ctx);
      assert(state.status === 'lobby', 'WRONG_STATUS');
      assert(p.team !== null, 'WRONG_STATUS', 'Join a team first.');
      p.ready = !p.ready;
      emitPlayerUpdated(ctx, p);
      return;
    }
    case 'START_GAME': {
      const p = requireActor(ctx);
      assert(state.hostId === p.id, 'NOT_HOST');
      assert(state.status === 'lobby', 'WRONG_STATUS');
      const settings = GameSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...state.settings, ...(cmd.settings ?? {}) });
      validateComposition(ctx);
      state.settings = settings;
      startGame(ctx);
      return;
    }
    case 'PROMOTE_SPYMASTER': {
      const actor = requireActor(ctx);
      assert(state.status === 'in_game', 'WRONG_STATUS');
      const target = state.players[cmd.playerId];
      if (!target || target.team === null) return fail('PLAYER_NOT_FOUND');
      const team = target.team;
      assert(actor.id === state.hostId || actor.team === team, 'WRONG_ROLE');
      const current = Object.values(state.players).find((q) => q.team === team && q.role === 'spymaster');
      assert(!current || current.seat.status !== 'connected', 'SPYMASTER_PRESENT');
      assert(!target.keyTainted || target.role === 'spymaster', 'KEY_TAINTED');
      assert(target.role === 'operative', 'WRONG_ROLE', 'Only an operative can be promoted.');
      if (current) {
        current.role = 'operative';
        current.keyTainted = true;
        emitPlayerUpdated(ctx, current);
      }
      target.role = 'spymaster';
      target.keyTainted = true;
      emitPlayerUpdated(ctx, target);
      return;
    }
    case 'REQUEST_REMATCH': {
      const p = requireActor(ctx);
      assert(state.hostId === p.id, 'NOT_HOST');
      assert(state.status === 'game_over', 'WRONG_STATUS');
      resetToLobby(ctx);
      return;
    }
  }
};

const spymasterOf = (ctx: Ctx, team: TeamId, except?: PlayerId): Player | undefined =>
  Object.values(ctx.state.players).find(
    (p) => p.team === team && p.role === 'spymaster' && p.id !== except && p.seat.status !== 'left',
  );

const pickNewHost = (ctx: Ctx, leaving: PlayerId): PlayerId | null => {
  const candidates = Object.values(ctx.state.players)
    .filter((p) => p.id !== leaving && p.seat.status === 'connected')
    .sort((a, b) => a.joinedAt - b.joinedAt);
  return candidates[0]?.id ?? null;
};

const checkSpymasterVacancy = (ctx: Ctx, p: Player): void => {
  if (p.role === 'spymaster' && p.team) ctx.sink.team(p.team, { type: 'SPYMASTER_VACANT', team: p.team });
};

export const validateComposition = (ctx: Ctx): void => {
  const players = Object.values(ctx.state.players).filter((p) => p.seat.status !== 'left');
  assert(players.length >= MIN_PLAYERS, 'INVALID_COMPOSITION', `At least ${MIN_PLAYERS} players are needed.`);
  for (const team of ['ember', 'tide'] as const) {
    const members = players.filter((p) => p.team === team);
    const sm = members.filter((p) => p.role === 'spymaster');
    const ops = members.filter((p) => p.role === 'operative');
    assert(sm.length === 1, 'INVALID_COMPOSITION', `${cap(team)} needs exactly one spymaster.`);
    assert(ops.length >= 1, 'INVALID_COMPOSITION', `${cap(team)} needs at least one operative.`);
  }
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const startGame = (ctx: Ctx): void => {
  const { state, rng } = ctx;
  const words = rng.shuffle(WORDS_EN).slice(0, BOARD_SIZE);
  state.tiles = words.map((word, i) => ({ id: i, word, position: i, revealed: false }));
  state.key = generateKey(rng);
  const starting = state.key.startingTeam;
  const second = otherTeam(starting);
  for (const team of ['ember', 'tide'] as const) {
    const t = emptyTeam(team);
    const count = state.key.owners.filter((o) => o === team).length;
    t.wordsTotal = count;
    t.wordsRemaining = count;
    t.deck = buildDeck(ctx, team);
    state.teams[team] = t;
  }
  state.activeEffects = [];
  state.result = null;
  state.status = 'in_game';
  for (const p of Object.values(state.players)) {
    p.ready = false;
    if (p.role === 'spymaster') p.keyTainted = true;
  }
  ctx.sink.public({ type: 'GAME_STARTED', startingTeam: starting });
  for (const team of [starting, second]) drawCards(ctx, team, state.settings.openingHand, 'opening');
  startTurn(ctx, starting, 0);
};

const resetToLobby = (ctx: Ctx): void => {
  const { state } = ctx;
  state.status = 'lobby';
  state.tiles = [];
  state.key = null;
  state.turn = null;
  state.activeEffects = [];
  state.result = null;
  state.teams = { ember: emptyTeam('ember'), tide: emptyTeam('tide') };
  // Fresh randomness for the next game, derived deterministically from the old seed.
  state.seed = `${state.seed}:${state.eventSeq}`;
  state.rngState = ctx.rng.state;
  for (const id of Object.keys(state.players)) {
    const p = state.players[id]!;
    if (p.seat.status === 'left') {
      delete state.players[id];
      continue;
    }
    p.ready = false;
    p.keyTainted = false;
    p.joinedAtTurn = null;
    if (p.team && p.role === 'spectator') p.role = 'operative';
  }
  if (!state.hostId || !state.players[state.hostId]) state.hostId = pickNewHost(ctx, '');
  ctx.sink.public({ type: 'GAME_RESET' });
};
