import type { Command, Owner, TeamId, TileId } from '@gambit/protocol';
import { otherTeam } from '@gambit/protocol';
import { assert, fail } from '../errors';
import type { Ctx } from '../game/apply';
import { MAX_EXTRA_GUESSES_PER_TURN, type Player, type Turn } from '../state';
import { drawCards } from '../cards/deck';
import { consumeDeferredEffects, expireEffects, findEffect, isLockedFor } from '../cards/effects';
import { tileById } from '../board/tiles';

type TurnCommand = Extract<Command, { type: 'GIVE_CLUE' | 'MARK_WORD' | 'SELECT_WORD' | 'END_TURN' }>;

export const requireInGame = (ctx: Ctx): Turn => {
  assert(ctx.state.status === 'in_game', 'WRONG_STATUS');
  if (!ctx.state.turn) return fail('WRONG_STATUS');
  return ctx.state.turn;
};

export const requireActorOnActiveTeam = (ctx: Ctx, turn: Turn): Player => {
  const p = ctx.actorId ? ctx.state.players[ctx.actorId] : undefined;
  if (!p) return fail('NOT_AUTHED');
  assert(p.team === turn.team, 'NOT_YOUR_TURN');
  return p;
};

export const requireOperative = (ctx: Ctx, turn: Turn): Player => {
  const p = requireActorOnActiveTeam(ctx, turn);
  assert(p.role === 'operative', 'WRONG_ROLE');
  assert(!p.keyTainted, 'KEY_TAINTED');
  return p;
};

export const requireTurnIndex = (turn: Turn, expected: number): void => {
  assert(turn.index === expected, 'STALE_STATE');
};

export const applyTurnCommand = (ctx: Ctx, cmd: TurnCommand): void => {
  const turn = requireInGame(ctx);
  requireTurnIndex(turn, cmd.expectedTurnIndex);
  switch (cmd.type) {
    case 'GIVE_CLUE': {
      const p = requireActorOnActiveTeam(ctx, turn);
      assert(p.role === 'spymaster', 'WRONG_ROLE');
      assert(turn.phase === 'clue', 'WRONG_PHASE');
      const word = validateClueWord(ctx, cmd.word);
      turn.clue = { word, count: cmd.count, givenBy: p.id };
      const banked = consumeDeferredEffects(ctx, turn.team, turn.index, 'banked_guesses');
      const penalty = consumeDeferredEffects(ctx, turn.team, turn.index, 'guess_penalty');
      if (cmd.count === 0) {
        turn.guessesAllowed = 'unlimited';
        turn.guessesRemaining = 'unlimited';
      } else {
        const extra = Math.min(MAX_EXTRA_GUESSES_PER_TURN, Math.max(0, banked));
        turn.extraGuessesGranted = extra;
        const allowed = Math.max(1, cmd.count + 1 + extra - penalty);
        turn.guessesAllowed = allowed;
        turn.guessesRemaining = allowed;
      }
      turn.phase = 'guess';
      ctx.sink.public({
        type: 'CLUE_GIVEN',
        team: turn.team,
        word,
        count: cmd.count,
        guessesAllowed: turn.guessesAllowed,
      });
      return;
    }
    case 'MARK_WORD': {
      const p = requireOperative(ctx, turn);
      assert(turn.phase === 'guess', 'WRONG_PHASE');
      const tile = tileById(ctx.state.tiles, cmd.tileId);
      assert(!tile.revealed, 'TILE_REVEALED');
      assert(!isLockedFor(ctx.state, tile.id, turn.team), 'TILE_LOCKED');
      const current = turn.marks[tile.id] ?? [];
      const marked = !current.includes(p.id);
      const next = marked ? [...current, p.id] : current.filter((id) => id !== p.id);
      if (next.length === 0) delete turn.marks[tile.id];
      else turn.marks[tile.id] = next;
      ctx.sink.public({ type: 'WORD_MARKED', tileId: tile.id, by: p.id, marked, marks: next });
      return;
    }
    case 'SELECT_WORD': {
      const p = requireOperative(ctx, turn);
      assert(turn.phase === 'guess', 'WRONG_PHASE');
      assert(turn.guessesRemaining === 'unlimited' || turn.guessesRemaining > 0, 'NO_GUESSES_LEFT');
      const tile = tileById(ctx.state.tiles, cmd.tileId);
      assert(!tile.revealed, 'TILE_REVEALED');
      assert(!isLockedFor(ctx.state, tile.id, turn.team), 'TILE_LOCKED');
      resolveGuess(ctx, tile.id, p.id, 'guess');
      return;
    }
    case 'END_TURN': {
      const p = requireActorOnActiveTeam(ctx, turn);
      assert(p.role !== 'spectator', 'WRONG_ROLE');
      assert(turn.phase === 'guess', 'WRONG_PHASE');
      endTurn(ctx, 'voluntary');
      return;
    }
  }
};

const CLUE_RE = /^[\p{L}][\p{L}'-]{0,23}$/u;

export const validateClueWord = (ctx: Ctx, raw: string): string => {
  const word = raw.trim().toUpperCase();
  assert(CLUE_RE.test(word), 'INVALID_CLUE');
  for (const t of ctx.state.tiles) {
    if (t.revealed) continue;
    const w = t.word.toUpperCase();
    assert(word !== w && !word.includes(w) && !w.includes(word), 'INVALID_CLUE', `"${word}" is too close to a word on the board.`);
  }
  return word;
};

export type GuessSource = 'guess' | 'card';

/**
 * Reveal a tile as a guess by the active team and apply the Codenames outcome rules.
 * Returns the outcome so card effects (Double or Nothing) can chain on it.
 */
export const resolveGuess = (
  ctx: Ctx,
  tileId: TileId,
  by: string | null,
  source: GuessSource,
): 'continue' | 'turn_end' | 'forgiven' | 'game_over' => {
  const { state } = ctx;
  const turn = state.turn!;
  const key = state.key!;
  const tile = tileById(state.tiles, tileId);
  const owner: Owner = key.owners[tile.id]!;
  const team = turn.team;
  const opp = otherTeam(team);

  tile.revealed = true;
  tile.revealedBy = team;
  tile.revealedAtTurn = turn.index;
  turn.lastRevealedTileId = tile.id;
  delete turn.marks[tile.id];
  turn.guessesMade += 1;
  if (turn.guessesRemaining !== 'unlimited') turn.guessesRemaining = Math.max(0, turn.guessesRemaining - 1);

  const emit = (outcome: 'continue' | 'turn_end' | 'forgiven' | 'game_over' | 'card') =>
    ctx.sink.public({ type: 'WORD_REVEALED', tileId: tile.id, word: tile.word, owner, by, team, outcome });

  if (owner === 'assassin') {
    emit('game_over');
    gameOver(ctx, opp, 'assassin');
    return 'game_over';
  }
  if (owner === team) {
    state.teams[team].wordsRemaining -= 1;
    if (state.teams[team].wordsRemaining === 0) {
      emit('game_over');
      gameOver(ctx, team, 'all_words');
      return 'game_over';
    }
    if (turn.guessesRemaining === 0) {
      emit('turn_end');
      endTurn(ctx, 'exhausted');
      return 'turn_end';
    }
    emit(source === 'card' ? 'card' : 'continue');
    return 'continue';
  }
  // Neutral or opponent word.
  if (owner === opp) {
    state.teams[opp].wordsRemaining -= 1;
    if (state.teams[opp].wordsRemaining === 0) {
      emit('game_over');
      gameOver(ctx, opp, 'all_words');
      return 'game_over';
    }
  }
  const forgive = findEffect(state, (e) => e.kind === 'forgive' && e.ownerTeam === team && e.expiresAtTurn === turn.index);
  if (forgive) {
    state.activeEffects = state.activeEffects.filter((e) => e.id !== forgive.id);
    if (turn.guessesRemaining === 0) {
      emit('turn_end');
      endTurn(ctx, 'exhausted');
      return 'turn_end';
    }
    emit('forgiven');
    return 'forgiven';
  }
  emit('turn_end');
  endTurn(ctx, 'wrong_guess');
  return 'turn_end';
};

export const gameOver = (ctx: Ctx, winner: TeamId, reason: 'all_words' | 'assassin' | 'forfeit'): void => {
  const { state } = ctx;
  state.status = 'game_over';
  state.result = { winner, reason };
  ctx.sink.public({ type: 'GAME_OVER', result: { winner, reason, key: [...state.key!.owners] } });
};

export const endTurn = (ctx: Ctx, reason: 'wrong_guess' | 'exhausted' | 'voluntary' | 'card' | 'timeout'): void => {
  const { state } = ctx;
  const turn = state.turn!;
  ctx.sink.public({ type: 'TURN_ENDED', turnIndex: turn.index, team: turn.team, reason });
  if (state.status !== 'in_game') return;
  startTurn(ctx, otherTeam(turn.team), turn.index + 1);
};

export const startTurn = (ctx: Ctx, team: TeamId, index: number): void => {
  const { state } = ctx;
  expireEffects(ctx, index);
  state.teams[team].playedThisTurn = false;
  state.turn = {
    index,
    team,
    phase: 'clue',
    clue: null,
    guessesAllowed: 0,
    guessesMade: 0,
    guessesRemaining: 0,
    extraGuessesGranted: 0,
    lastRevealedTileId: null,
    startedAt: ctx.now,
    marks: {},
  };
  const banked = state.activeEffects
    .filter((e) => e.kind === 'banked_guesses' && e.ownerTeam === team && e.expiresAtTurn === index)
    .reduce((n, e) => n + (e.value ?? 0), 0);
  ctx.sink.public({ type: 'TURN_STARTED', turnIndex: index, team, bankedGuesses: banked });
  const extraDraws = consumeDeferredEffects(ctx, team, index, 'extra_draw');
  drawCards(ctx, team, 1 + extraDraws, 'turn_start');
};
