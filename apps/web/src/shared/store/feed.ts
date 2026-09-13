import type { ClientView, Event, TeamId } from '@gambit/protocol';

export interface FeedItem {
  seq: number;
  kind: 'info' | 'clue' | 'reveal' | 'card' | 'turn' | 'system' | 'result';
  team?: TeamId;
  text: string;
}

const teamName = (t: TeamId) => (t === 'ember' ? 'Ember' : 'Tide');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Turns a server event into one plain feed sentence, or null for events not worth showing. */
export const formatFeedItem = (event: Event, view: ClientView | null): Omit<FeedItem, 'seq'> | null => {
  const nick = (id: string | null) => (id ? view?.public.players.find((p) => p.id === id)?.nickname ?? 'Someone' : 'The board');
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
      return { kind: 'turn', team: event.startingTeam, text: `The game begins. ${teamName(event.startingTeam)} goes first.` };
    case 'TURN_STARTED':
      return {
        kind: 'turn',
        team: event.team,
        text: `${teamName(event.team)}'s turn.${event.bankedGuesses > 0 ? ` They start with ${event.bankedGuesses} extra guess${event.bankedGuesses > 1 ? 'es' : ''}.` : ''}`,
      };
    case 'CLUE_GIVEN':
      return { kind: 'clue', team: event.team, text: `${teamName(event.team)}'s clue: ${event.word} ${event.count}.` };
    case 'CARD_DRAWN':
      if (event.reason === 'opening') return null;
      return { kind: 'card', team: event.team, text: `${teamName(event.team)} drew a card.` };
    case 'CARD_PLAYED': {
      const target = event.target?.tiles?.length ? ` on ${event.target.tiles.map(word).join(' and ')}` : '';
      return { kind: 'card', team: event.team, text: `${nick(event.by)} played ${cardName(event.cardDefId)}${target}.` };
    }
    case 'EFFECT_APPLIED':
      if (event.kind === 'none') return { kind: 'card', team: event.team, text: `${cardName(event.cardDefId)} had nothing to affect.` };
      if (event.kind === 'guesses' && event.delta !== undefined)
        return { kind: 'card', team: event.team, text: `${teamName(event.team)} ${event.delta > 0 ? 'gained' : 'lost'} ${Math.abs(event.delta)} guess${Math.abs(event.delta) === 1 ? '' : 'es'}.` };
      if (event.kind === 'swap' && event.tiles?.length === 2)
        return { kind: 'card', team: event.team, text: `${word(event.tiles[0]!)} and ${word(event.tiles[1]!)} swapped places.` };
      return null;
    case 'INFO_REVEALED':
      return { kind: 'info', text: `${cardName(event.cardDefId)} says: ${describeInfo(event.cardDefId, event.result, event.tiles.map(word))}` };
    case 'WORD_REVEALED': {
      const who = event.by ? nick(event.by) : `${cardName('dredge') === 'dredge' ? 'A card' : 'A card'}`;
      const owner =
        event.owner === 'assassin'
          ? 'the Assassin'
          : event.owner === 'neutral'
            ? 'a bystander'
            : `${cap(event.owner)}'s agent`;
      return { kind: 'reveal', team: event.team, text: `${who} revealed ${event.word}. It was ${owner}.` };
    }
    case 'TURN_ENDED': {
      const why =
        event.reason === 'wrong_guess'
          ? 'after a wrong guess'
          : event.reason === 'exhausted'
            ? 'out of guesses'
            : event.reason === 'voluntary'
              ? 'by choice'
              : event.reason === 'card'
                ? 'by a card'
                : 'after a timeout';
      return { kind: 'turn', team: event.team, text: `${teamName(event.team)}'s turn ended ${why}.` };
    }
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
      return result === 'yes' ? `${words[0]} is yours.` : `${words[0]} is not yours.`;
    case 'hazard_sense':
      return result === 'safe' ? `${words[0]} is safe.` : `${words[0]} is dangerous.`;
    case 'triangulate':
      return result === 'none' ? 'none of those are yours.' : 'one of the three is marked as yours.';
    case 'sonar':
      return `${result} of ${words[0]}'s neighbours are yours.`;
    case 'parity':
      return `that row holds an ${result} number of your words.`;
    case 'cartographer':
      return `${result} of those four are yours.`;
    default:
      return result;
  }
};
