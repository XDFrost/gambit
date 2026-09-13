import { AnimatePresence, motion } from 'motion/react';
import { Feather } from '@phosphor-icons/react';
import { useGameStore } from '@/shared/store/gameStore';
import { cn } from '@/shared/lib/cn';
import { useReduced, springSnappy } from '@/shared/motion';

/** CLUE / word / number, plus guess pips. Announces the clue with a short scale-in. */
export const ClueBanner = () => {
  const view = useGameStore((s) => s.view)!;
  const reduced = useReduced();
  const turn = view.public.turn;
  if (!turn) return null;
  const clue = turn.clue;
  const total = turn.guessesAllowed;
  const remaining = turn.guessesRemaining;
  const team = turn.team;

  return (
    <div className="flex min-h-[72px] items-center justify-between gap-4 rounded-[var(--radius-panel-inner)] bg-panel px-4 py-3 ring-1 ring-hairline sm:px-5">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">Clue</p>
        <AnimatePresence mode="wait" initial={false}>
          {clue ? (
            <motion.p
              key={`${turn.index}-${clue.word}`}
              initial={reduced ? false : { opacity: 0, scale: 0.92, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
              transition={springSnappy}
              className="truncate font-display text-[30px] font-extrabold leading-none tracking-tight text-ink sm:text-[36px]"
            >
              {clue.word} <span className={cn('tabular', team === 'ember' ? 'text-ember' : 'text-tide')}>{clue.count}</span>
            </motion.p>
          ) : (
            <motion.p key="waiting" initial={false} className="font-display text-[20px] font-bold text-ink-faint">
              Waiting for the clue
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      {clue ? (
        <div className="flex shrink-0 items-center gap-3">
          {turn.forgiveAvailable ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[12px] text-accent ring-1 ring-accent/30" title="Second Chance: one wrong guess is forgiven">
              <Feather size={13} weight="fill" /> Forgiven once
            </span>
          ) : null}
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-faint">Guesses</p>
            {total === 'unlimited' ? (
              <p className="font-display text-[18px] font-bold text-ink">Unlimited</p>
            ) : (
              <div className="mt-1 flex items-center justify-end gap-1" aria-label={`${remaining} of ${total} guesses left`}>
                {Array.from({ length: total }, (_, i) => {
                  const used = typeof remaining === 'number' && i >= remaining;
                  return <span key={i} className={cn('h-2.5 w-2.5 rounded-full transition-colors', used ? 'bg-hairline-strong' : team === 'ember' ? 'bg-ember' : 'bg-tide')} />;
                })}
                <span className="tabular ml-2 text-[14px] text-ink">{remaining}</span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
