import { useState } from 'react';
import { Cards, ChatCircleText, Eye, Users } from '@phosphor-icons/react';
import { useGameStore } from '@/shared/store/gameStore';
import { cn } from '@/shared/lib/cn';
import { TurnIndicator } from './turn/TurnIndicator';
import { ClueBanner } from './clue/ClueBanner';
import { ClueComposer } from './clue/ClueComposer';
import { Board } from './board/Board';
import { PlayerRail } from './players/PlayerRail';
import { EventFeed } from './feed/EventFeed';
import { Hand } from './hand/Hand';
import { Overlays } from './overlays/Overlays';

/**
 * Desktop: player rail | clue + board | table talk, with the hand docked underneath.
 * Mobile: single column with the board first; players, log and hand live behind tabs.
 */
export const GamePage = () => {
  const view = useGameStore((s) => s.view)!;
  const me = view.me;
  const turn = view.public.turn;
  const isSpymaster = me.role === 'spymaster';
  const composing = isSpymaster && turn?.phase === 'clue' && turn.team === me.team;
  const isOperative = me.role === 'operative' && me.team !== null;
  const [tab, setTab] = useState<'hand' | 'players' | 'log'>('hand');

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TurnIndicator />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 pb-6 pt-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
          <PlayerRail className="hidden lg:flex" />

          <section className="flex min-w-0 flex-col gap-4">
            {isSpymaster ? (
              <p className="inline-flex items-center gap-2 self-start rounded-full bg-raised px-3 py-1.5 text-[12px] text-ink-muted ring-1 ring-hairline">
                <Eye size={14} weight="fill" className={me.team === 'ember' ? 'text-ember' : 'text-tide'} />
                You are the spymaster. Keep this screen to yourself.
              </p>
            ) : null}
            <ClueBanner />
            <Board />
            {composing ? <ClueComposer /> : null}
          </section>

          <EventFeed className="hidden max-h-[calc(100dvh-8rem)] lg:flex" />
        </div>

        {/* Desktop hand */}
        {isOperative ? <Hand className="mt-6 hidden lg:block" /> : null}

        {/* Mobile tabs */}
        <div className="mt-6 lg:hidden">
          <div role="tablist" className="flex gap-2">
            {(
              [
                ['hand', 'Cards', Cards],
                ['players', 'Players', Users],
                ['log', 'Log', ChatCircleText],
              ] as const
            )
              .filter(([k]) => k !== 'hand' || isOperative)
              .map(([k, label, Icon]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn('inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] ring-1', tab === k ? 'bg-accent text-accent-ink ring-accent' : 'bg-panel text-ink-muted ring-hairline')}>
                  <Icon size={16} /> {label}
                  {k === 'hand' && view.team ? <span className="tabular">{view.team.hand.length}</span> : null}
                </button>
              ))}
          </div>
          <div className="mt-4">
            {tab === 'hand' && isOperative ? <Hand /> : null}
            {tab === 'players' ? <PlayerRail /> : null}
            {tab === 'log' ? <EventFeed className="h-[320px]" /> : null}
          </div>
        </div>
      </main>
      <Overlays />
    </div>
  );
};
