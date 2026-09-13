import type {
  ClientView,
  Owner,
  Playability,
  PlayerId,
  PublicEffect,
  PublicPlayer,
  PublicTeam,
  PublicTile,
  PublicView,
  SpymasterView,
  TeamId,
  TeamView,
  TileId,
} from '@gambit/protocol';
import type { GameState, Player, Team } from '../state';
import { hiddenTextForOf, lockedForOf, shieldedByOf } from '../cards/effects';
import { catalogFor, getCard, hasCard } from '../cards/registry';
import { checkPlayable } from '../cards/conditions';
import { validTilesFor } from '../cards/targeting';

/**
 * THE ONLY EXIT for game state. Everything a client receives goes through here.
 * Never add a field that could carry the key for anyone but a spymaster.
 */
export const projectFor = (state: GameState, playerId: PlayerId): ClientView => {
  const me = state.players[playerId];
  if (!me) throw new Error('projectFor: unknown player');
  return {
    public: projectPublic(state),
    me: { playerId: me.id, role: me.role, team: me.team, isHost: state.hostId === me.id },
    team: me.team && me.role !== 'spymaster' ? projectTeam(state, me.team) : null,
    spymaster: me.role === 'spymaster' && state.key ? projectSpymaster(state) : null,
  };
};

export const projectPlayer = (state: GameState, p: Player): PublicPlayer => ({
  id: p.id,
  nickname: p.nickname,
  team: p.team,
  role: p.role,
  ready: p.ready,
  seat: p.seat.status,
  keyTainted: p.keyTainted,
  isHost: state.hostId === p.id,
});

const projectTeamPublic = (t: Team): PublicTeam => ({
  id: t.id,
  wordsTotal: t.wordsTotal,
  wordsRemaining: t.wordsRemaining,
  deckCount: t.deck.length,
  handCount: t.hand.length,
  discard: t.discard.map((c) => c.defId),
  playedThisTurn: t.playedThisTurn,
});

const projectTile = (state: GameState, id: TileId): PublicTile => {
  const t = state.tiles[id]!;
  const out: PublicTile = { id: t.id, word: t.word, position: t.position, revealed: t.revealed };
  if (t.revealed && state.key) {
    out.owner = state.key.owners[t.id]!;
    if (t.revealedBy) out.revealedBy = t.revealedBy;
  }
  const locked = lockedForOf(state, t.id);
  if (locked) out.lockedFor = locked;
  const shielded = shieldedByOf(state, t.id);
  if (shielded) out.shieldedBy = shielded;
  const hidden = hiddenTextForOf(state, t.id);
  if (hidden) out.hiddenTextFor = hidden;
  return out;
};

const projectEffect = (e: GameState['activeEffects'][number]): PublicEffect => ({
  id: e.id,
  kind: e.kind,
  sourceCardDefId: e.sourceCardDefId,
  ownerTeam: e.ownerTeam,
  ...(e.tileId !== undefined ? { tileId: e.tileId } : {}),
  ...(e.forTeam && e.forTeam !== 'both' ? { forTeam: e.forTeam } : {}),
  ...(e.value !== undefined ? { value: e.value } : {}),
  expiresAtTurn: e.expiresAtTurn,
});

export const projectPublic = (state: GameState): PublicView => ({
  roomCode: state.roomCode,
  status: state.status,
  settings: state.settings,
  hostId: state.hostId,
  players: Object.values(state.players)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => projectPlayer(state, p)),
  teams: { ember: projectTeamPublic(state.teams.ember), tide: projectTeamPublic(state.teams.tide) },
  tiles: state.tiles.map((t) => projectTile(state, t.id)),
  startingTeam: state.key?.startingTeam ?? null,
  turn: state.turn
    ? {
        index: state.turn.index,
        team: state.turn.team,
        phase: state.turn.phase,
        clue: state.turn.clue ? { ...state.turn.clue } : null,
        guessesAllowed: state.turn.guessesAllowed,
        guessesMade: state.turn.guessesMade,
        guessesRemaining: state.turn.guessesRemaining,
        forgiveAvailable: state.activeEffects.some(
          (e) => e.kind === 'forgive' && e.ownerTeam === state.turn!.team && e.expiresAtTurn === state.turn!.index,
        ),
        startedAt: state.turn.startedAt,
        marks: Object.fromEntries(
          Object.entries(state.turn.marks)
            .filter(([, ids]) => ids && ids.length > 0)
            .map(([tile, ids]) => [tile, [...(ids as string[])]]),
        ),
      }
    : null,
  effects: state.activeEffects.filter((e) => e.visibility === 'public').map(projectEffect),
  result: state.result && state.key ? { ...state.result, key: [...state.key.owners] } : null,
  cardCatalog: catalogFor(state.settings.cardPool),
  seq: state.eventSeq,
});

export const projectTeam = (state: GameState, team: TeamId): TeamView => {
  const t = state.teams[team];
  const playability: Record<string, Playability> = {};
  for (const card of t.hand) {
    if (!hasCard(card.defId)) continue;
    const def = getCard(card.defId);
    const failure = checkPlayable(state, team, def);
    if (failure) {
      playability[card.id] = { playable: false, reason: failure.reason };
      continue;
    }
    const spec = def.targeting;
    if (spec.kind === 'tile' || spec.kind === 'two_tiles') {
      const validTiles = validTilesFor(state, team, spec.filter);
      const need = spec.kind === 'tile' ? 1 : 2;
      playability[card.id] =
        validTiles.length >= need ? { playable: true, validTiles } : { playable: false, reason: 'No valid words to target.' };
    } else {
      playability[card.id] = { playable: true };
    }
  }
  const knownOwners: Record<string, Owner> = {};
  for (const [k, v] of Object.entries(t.knownOwners)) if (v) knownOwners[k] = v;
  return {
    team,
    hand: t.hand.map((c) => ({ id: c.id, defId: c.defId })),
    playability,
    knownOwners,
    infoResults: t.infoResults.map((r) => ({ ...r, tiles: [...r.tiles] })),
  };
};

export const projectSpymaster = (state: GameState): SpymasterView => ({ key: [...state.key!.owners] });
