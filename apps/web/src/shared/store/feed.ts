import type { ClientView, Event, Owner, TeamId } from '@gambit/protocol';

export interface FeedActor {
  id: string;
  nickname: string;
  team: TeamId | null;
}

/**
 * One log entry. `text` is the full sentence (used for screen readers and tooltips);
 * the structured fields drive the compact chip rendering.
 */
export interface FeedItem {
  seq: number;
  kind: 'clue' | 'reveal' | 'card' | 'info' | 'turn' | 'system' | 'result';
  team?: TeamId | undefined;
  actor?: FeedActor | undefined;
  text: string;
  word?: string | undefined;
  owner?: Owner | undefined;
  count?: number | undefined;
  cardDefId?: string | undefined;
  cardName?: string | undefined;
  target?: string | undefined;
  result?: string | undefined;
}

const teamName = (t: TeamId) => (t === 'ember' ? 'Ember' : 'Tide');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Turns a server event into one feed entry, or null for events not worth showing. */
export const formatFeedItem = (event: Event, view: ClientView | null): Omit<FeedItem, 'seq'> | null => {
  const actor = (id: string | null): FeedActor | undefined => {
    if (!id) return undefined;
    const p = view?.public.players.find((x) => x.id === id);
    return { id, nickname: p?.nickname ?? 'Someone', team: p?.team ?? null };
  };
  const nick = (id: string | null) => actor(id)?.nickname ?? 'Someone';
  const cardName = (defId: string) => view?.public.cardCatalog[defId]?.name ?? defId;
  const word = (tileId: number) => view?.public.tiles.find((t) => t.id === tileId)?.word ?? 'a word';

  switch (event.type) {
    case 'PLAYER_JOINED':
      return { kind: 'system', text: `${event.player.nickname} joined the room.` };
    case 'PLAYER_LEFT':
      return { kind: 'system', text: `${event.nickname} left.` };
    case 'PLAYER_DISCONNECTED':
      return { kind: 'system', text: `${nick(event.playerId)} lost connection.` };
    case 'PLAYER_RECONNECTED':
      return { kind: 'system', text: `${nick(event.playerId)} is back.` };
    case 'GAME_STARTED':
      return { kind: 'turn', team: event.startingTeam, text: `${teamName(event.startingTeam)} goes first.` };
    case 'TURN_STARTED':
      return {
        kind: 'turn',
        team: event.team,
        text: `${teamName(event.team)}'s turn${event.bankedGuesses > 0 ? `, +${event.bankedGuesses} banked` : ''}`,
      };
    case 'CLUE_GIVEN': {
      const spy = view?.public.players.find((p) => p.team === event.team && p.role === 'spymaster');
      return {
        kind: 'clue',
        team: event.team,
        actor: spy ? { id: spy.id, nickname: spy.nickname, team: spy.team } : undefined,
        word: event.word,
        count: event.count,
        text: `${spy?.nickname ?? teamName(event.team)} gave the clue ${event.word} ${event.count}.`,
      };
    }
    case 'CARD_DRAWN':
      return null;
    case 'CARD_PLAYED': {
      const target = event.target?.tiles?.length ? event.target.tiles.map(word).join(' + ') : undefined;
      return {
        kind: 'card',
        team: event.team,
        actor: actor(event.by),
        cardDefId: event.cardDefId,
        cardName: cardName(event.cardDefId),
        ...(target ? { target } : {}),
        text: `${nick(event.by)} played ${cardName(event.cardDefId)}${target ? ` on ${target}` : ''}.`,
      };
    }
    case 'EFFECT_APPLIED':
      if (event.kind === 'none') return { kind: 'system', team: event.team, text: `${cardName(event.cardDefId)} had nothing to affect.` };
      if (event.kind === 'swap' && event.tiles?.length === 2)
        return { kind: 'system', team: event.team, text: `${word(event.tiles[0]!)} and ${word(event.tiles[1]!)} swapped places.` };
      return null;
    case 'INFO_REVEALED':
      return {
        kind: 'info',
        cardDefId: event.cardDefId,
        cardName: cardName(event.cardDefId),
        result: describeInfo(event.cardDefId, event.result, event.tiles.map(word)),
        text: `${cardName(event.cardDefId)}: ${describeInfo(event.cardDefId, event.result, event.tiles.map(word))}`,
      };
    case 'WORD_REVEALED': {
      const owner =
        event.owner === 'assassin' ? 'the Assassin' : event.owner === 'neutral' ? 'a bystander' : `${cap(event.owner)}'s agent`;
      return {
        kind: 'reveal',
        team: event.team,
        actor: actor(event.by),
        word: event.word,
        owner: event.owner,
        ...(event.by ? {} : { cardName: 'Card' }),
        text: `${event.by ? nick(event.by) : 'A card'} revealed ${event.word}. It was ${owner}.`,
      };
    }
    case 'TURN_ENDED':
      return null;
    case 'GAME_OVER':
      return {
        kind: 'result',
        team: event.result.winner,
        text:
          event.result.reason === 'assassin'
            ? `${teamName(event.result.winner)} wins. The other team found the Assassin.`
            : `${teamName(event.result.winner)} wins with every agent found.`,
      };
    case 'SPYMASTER_VACANT':
      return { kind: 'system', team: event.team, text: `${teamName(event.team)}'s spymaster is away. A teammate can be promoted.` };
    case 'GAME_RESET':
      return { kind: 'system', text: 'Back to the lobby for a rematch.' };
    default:
      return null;
  }
};

export const describeInfo = (defId: string, result: string, words: string[]): string => {
  switch (defId) {
    case 'litmus':
      return result === 'yes' ? `${words[0]} is yours` : `${words[0]} is not yours`;
    case 'hazard_sense':
      return result === 'safe' ? `${words[0]} is safe` : `${words[0]} is dangerous`;
    case 'triangulate':
      return result === 'none' ? 'none of those are yours' : 'one of the three is yours';
    case 'sonar':
      return `${result} neighbours of ${words[0]} are yours`;
    case 'parity':
      return `that row holds an ${result} number of yours`;
    case 'cartographer':
      return `${result} of those four are yours`;
    default:
      return result;
  }
};
