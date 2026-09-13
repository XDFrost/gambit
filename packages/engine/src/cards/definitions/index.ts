import type { CardDefinition } from '../types';
import { INFORMATION_CARDS } from './information';
import { BOARD_CARDS } from './board';
import { TURN_CARDS } from './turn';
import { GAMBLE_CARDS } from './gamble';
import { TEAM_CARDS } from './team';

export const ALL_CARDS: readonly CardDefinition[] = [
  ...INFORMATION_CARDS,
  ...BOARD_CARDS,
  ...TURN_CARDS,
  ...GAMBLE_CARDS,
  ...TEAM_CARDS,
];
