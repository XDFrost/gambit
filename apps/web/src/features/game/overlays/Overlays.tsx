import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Skull } from '@phosphor-icons/react';
import { useGameStore, type Flash } from '@/shared/store/gameStore';
import { Z } from '@/shared/tokens/z-index';
import { cn } from '@/shared/lib/cn';
import { useReduced, easeTabletop } from '@/shared/motion';
import { useSfx } from '@/shared/sfx/useSfx';

const teamName = (t: 'ember' | 'tide') => (t === 'ember' ? 'Ember' : 'Tide');

/**
 * Turn handoff band and assassin reveal. Both are driven by recent events ("flashes"), so they
 * communicate a state change and then get out of the way. Sound cues are triggered here too.
 */
export const Overlays = () => {
  const flashes = useGameStore((s) => s.flashes);
  const view = useGameStore((s) => s.view);
  const reduced = useReduced();
  const play = useSfx();
  const seen = useRef<number>(0);
  const [handoff, setHandoff] = useState<{ id: number; team: 'ember' | 'tide' } | null>(null);
  const [assassin, setAssassin] = useState<number | null>(null);

  const myTeam = view?.me.team ?? null;

  useEffect(() => {
    const fresh = flashes.filter((f) => f.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = flashes[flashes.length - 1]!.id;
    const react = (f: Flash) => {
      const e = f.event;
      switch (e.type) {
        case 'TURN_STARTED':
          setHandoff({ id: f.id, team: e.team });
          play('turn');
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
          if (e.owner === 'assassin') {
            setAssassin(f.id);
            play('assassin');
          } else if (e.owner === e.team) play('reveal_good');
          else play('reveal_bad');
          break;
        case 'GAME_OVER':
          play(myTeam && e.result.winner === myTeam ? 'win' : 'lose');
          break;
        default:
          break;
      }
    };
    for (const f of fresh) react(f);
  }, [flashes, myTeam, play]);

  useEffect(() => {
    if (!handoff) return;
    const t = window.setTimeout(() => setHandoff(null), 1500);
    return () => window.clearTimeout(t);
  }, [handoff]);
  useEffect(() => {
    if (assassin === null) return;
    const t = window.setTimeout(() => setAssassin(null), 1400);
    return () => window.clearTimeout(t);
  }, [assassin]);

  return (
    <>
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
      <AnimatePresence>
        {assassin !== null ? (
          <motion.div
            key={assassin}
            className="pointer-events-none fixed inset-0 flex items-center justify-center bg-assassin/80"
            style={{ zIndex: Z.overlay }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.3 }}
            aria-hidden
          >
            <motion.div initial={reduced ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 0.5, ease: easeTabletop }} className="flex flex-col items-center gap-3 text-assassin-ink">
              <Skull size={72} weight="fill" />
              <p className="font-display text-[34px] font-extrabold tracking-tight">The Assassin</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
};
