import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useGameStore, type Flash } from '@/shared/store/gameStore';
import { Z } from '@/shared/tokens/z-index';
import { cn } from '@/shared/lib/cn';
import { useReduced, easeTabletop } from '@/shared/motion';
import { useSfx } from '@/shared/sfx/useSfx';

const teamName = (t: 'ember' | 'tide') => (t === 'ember' ? 'Ember' : 'Tide');

/**
 * Turn handoff band plus the non-reveal sound cues. Reveal sounds and the assassin wash live in
 * the board's RevealStage so they land exactly when the card flips.
 */
export const Overlays = () => {
  const flashes = useGameStore((s) => s.flashes);
  const view = useGameStore((s) => s.view);
  const reduced = useReduced();
  const play = useSfx();
  const seen = useRef<number>(0);
  const [handoff, setHandoff] = useState<{ id: number; team: 'ember' | 'tide' } | null>(null);
  const myTeam = view?.me.team ?? null;

  useEffect(() => {
    const fresh = flashes.filter((f) => f.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = flashes[flashes.length - 1]!.id;
    const hold = Math.max(0, useGameStore.getState().revealHoldUntil - Date.now());
    const react = (f: Flash) => {
      const e = f.event;
      switch (e.type) {
        case 'TURN_STARTED':
          // After a staged reveal, wait for the flip before announcing the handoff.
          window.setTimeout(() => {
            setHandoff({ id: f.id, team: e.team });
            play('turn');
          }, hold);
          break;
        case 'CLUE_GIVEN':
          play('clue');
          break;
        case 'CARD_DRAWN':
          if (e.card && e.reason !== 'opening') play('draw');
          break;
        case 'CARD_PLAYED':
          play('play');
          break;
        case 'WORD_REVEALED':
          if (reduced) play(e.owner === 'assassin' ? 'assassin' : e.owner === e.team ? 'reveal_good' : 'reveal_bad');
          break;
        case 'GAME_OVER':
          window.setTimeout(() => play(myTeam && e.result.winner === myTeam ? 'win' : 'lose'), hold);
          break;
        default:
          break;
      }
    };
    for (const f of fresh) react(f);
  }, [flashes, myTeam, play, reduced]);

  useEffect(() => {
    if (!handoff) return;
    const t = window.setTimeout(() => setHandoff(null), 1500);
    return () => window.clearTimeout(t);
  }, [handoff]);

  return (
    <AnimatePresence>
      {handoff ? (
        <motion.div
          key={handoff.id}
          className="pointer-events-none fixed inset-x-0 top-1/2 flex -translate-y-1/2 justify-center"
          style={{ zIndex: Z.overlay }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: -80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: 80 }}
          transition={{ duration: 0.45, ease: easeTabletop }}
          aria-hidden
        >
          <div className={cn('rounded-full px-8 py-4 font-display text-[28px] font-extrabold tracking-tight shadow-[var(--shadow-card)] sm:text-[36px]', handoff.team === 'ember' ? 'bg-ember text-ember-ink' : 'bg-tide text-tide-ink')}>
            {view?.me.team === handoff.team ? 'Your turn' : `${teamName(handoff.team)}'s turn`}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
