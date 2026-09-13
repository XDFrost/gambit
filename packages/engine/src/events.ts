import type { Event, PlayerId, TeamId } from '@gambit/protocol';
import type { GameState } from './state';

export type EventScope =
  | { kind: 'public' }
  | { kind: 'team'; team: TeamId }
  | { kind: 'player'; playerId: PlayerId };

/**
 * An engine-level event: the protocol event, who may see it, and an optional redacted
 * variant for everyone else. `seq` is assigned when the event is appended to the state.
 */
export interface GameEvent {
  seq: number;
  turnIndex: number | null;
  scope: EventScope;
  event: Event;
  publicVariant?: Event;
}

/** Collects events during a single `apply` and stamps them with increasing seq numbers. */
export class EventSink {
  readonly events: GameEvent[] = [];
  constructor(private readonly state: GameState) {}

  private push(scope: EventScope, event: Event, publicVariant?: Event): void {
    this.state.eventSeq += 1;
    const e: GameEvent = {
      seq: this.state.eventSeq,
      turnIndex: this.state.turn?.index ?? null,
      scope,
      event,
    };
    if (publicVariant) e.publicVariant = publicVariant;
    this.events.push(e);
  }

  public(event: Event): void {
    this.push({ kind: 'public' }, event);
  }

  team(team: TeamId, event: Event, publicVariant?: Event): void {
    this.push({ kind: 'team', team }, event, publicVariant);
  }

  player(playerId: PlayerId, event: Event): void {
    this.push({ kind: 'player', playerId }, event);
  }
}
