import type { Owner, TeamId } from '@gambit/protocol';
import { otherTeam } from '@gambit/protocol';
import type { Rng } from '../rng';
import type { KeyCard } from '../state';
import { BOARD_SIZE } from '../state';

export const STARTING_TEAM_WORDS = 9;
export const SECOND_TEAM_WORDS = 8;
export const NEUTRAL_WORDS = 7;
export const ASSASSIN_WORDS = 1;

/** 9 starting-team words, 8 for the other team, 7 neutral, 1 assassin, shuffled. */
export const generateKey = (rng: Rng, startingTeam?: TeamId): KeyCard => {
  const start: TeamId = startingTeam ?? (rng.int(2) === 0 ? 'ember' : 'tide');
  const second = otherTeam(start);
  const owners: Owner[] = [
    ...Array<Owner>(STARTING_TEAM_WORDS).fill(start),
    ...Array<Owner>(SECOND_TEAM_WORDS).fill(second),
    ...Array<Owner>(NEUTRAL_WORDS).fill('neutral'),
    ...Array<Owner>(ASSASSIN_WORDS).fill('assassin'),
  ];
  if (owners.length !== BOARD_SIZE) throw new Error('Key size mismatch');
  return { owners: rng.shuffle(owners), startingTeam: start };
};
