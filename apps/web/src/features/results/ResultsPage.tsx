import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowCounterClockwise, SignOut, Trophy } from '@phosphor-icons/react';
import type { TeamId } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { socket } from '@/shared/ws/socket';
import { clearSession } from '@/shared/ws/session';
import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/Panel';
import { TopBar } from '@/shared/ui/TopBar';
import { WordTileFace } from '@/shared/ui/WordTileFace';
import { AbilityCardFace } from '@/shared/ui/AbilityCardFace';
import { cn } from '@/shared/lib/cn';
import { useReduced, easeOutExpo } from '@/shared/motion';

const teamName = (t: TeamId) => (t === 'ember' ? 'Ember' : 'Tide');

export const ResultsPage = () => {
  const view = useGameStore((s) => s.view)!;
  const navigate = useNavigate();
  const reduced = useReduced();
  const result = view.public.result!;
  const won = view.me.team === result.winner;
  const tiles = [...view.public.tiles].sort((a, b) => a.position - b.position);

  const leave = () => {
    socket.send({ type: 'LEAVE' });
    clearSession(view.public.roomCode);
    navigate('/');
  };

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 pb-16 sm:px-6">
      <TopBar />
      <motion.section
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: easeOutExpo }}
        className={cn('mt-6 rounded-[var(--radius-panel)] p-6 ring-1 sm:p-10', result.winner === 'ember' ? 'bg-ember-soft ring-ember/30' : 'bg-tide-soft ring-tide/30')}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-ink-muted">
              <Trophy size={14} weight="fill" className={result.winner === 'ember' ? 'text-ember' : 'text-tide'} />
              {view.me.team ? (won ? 'Victory' : 'Defeat') : 'Game over'}
            </p>
            <h1 className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-tight text-ink sm:text-[56px]">{teamName(result.winner)} wins</h1>
            <p className="mt-3 max-w-[48ch] text-[16px] text-ink-muted">
              {result.reason === 'assassin' ? `${teamName(result.winner === 'ember' ? 'tide' : 'ember')} found the Assassin.` : `${teamName(result.winner)} uncovered every agent.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {view.me.isHost ? (
              <Button size="lg" onClick={() => socket.send({ type: 'REQUEST_REMATCH' })} trailing={<ArrowCounterClockwise size={16} />}>
                Rematch
              </Button>
            ) : (
              <p className="self-center text-[14px] text-ink-muted">Waiting for the host to start a rematch.</p>
            )}
            <Button size="lg" variant="ghost" onClick={leave} leading={<SignOut size={16} />}>
              Leave
            </Button>
          </div>
        </div>
      </motion.section>

      <section className="mt-8 grid gap-6 lg:grid-cols-12">
        <Panel className="lg:col-span-8" inner="p-4 sm:p-5">
          <h2 className="text-[12px] uppercase tracking-[0.18em] text-ink-faint">The key</h2>
          <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-3">
            {tiles.map((t) => (
              <WordTileFace key={t.id} word={t.word} revealed owner={result.key[t.id]} compact className={cn(!t.revealed && 'opacity-70')} />
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-faint">Faded cards were never revealed during play.</p>
        </Panel>

        <div className="flex flex-col gap-6 lg:col-span-4">
          {(['ember', 'tide'] as const).map((team) => {
            const t = view.public.teams[team];
            const played = t.discard.map((id) => view.public.cardCatalog[id]).filter(Boolean);
            return (
              <Panel key={team} inner="p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className={cn('font-display text-[20px] font-bold', team === 'ember' ? 'text-ember' : 'text-tide')}>{teamName(team)}</h3>
                  <span className="tabular text-[13px] text-ink-muted">
                    {t.wordsTotal - t.wordsRemaining} of {t.wordsTotal} agents
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-ink-faint">{played.length === 0 ? 'No cards played.' : `${played.length} card${played.length === 1 ? '' : 's'} played`}</p>
                {played.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {played.map((def, i) => (
                      <AbilityCardFace key={`${def!.id}-${i}`} def={def!} size="mini" tabIndex={-1} />
                    ))}
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      </section>
    </main>
  );
};
