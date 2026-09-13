import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Skull } from '@phosphor-icons/react';
import type { Owner } from '@gambit/protocol';
import { Z } from '@/shared/tokens/z-index';
import { cn } from '@/shared/lib/cn';
import { easeTabletop, springCard } from '@/shared/motion';
import { playSfx } from '@/shared/sfx/useSfx';

export interface StageItem {
  key: number;
  tileId: number;
  word: string;
  owner: Owner;
}

/** Timeline in ms. Lift, hang with suspense, flip, settle. Sum must match REVEAL_STAGE_MS. */
const T = { flip: 1450, settle: 2450, done: 2950 } as const;

const ownerFace: Record<Owner, string> = {
  ember: 'bg-ember text-ember-ink',
  tide: 'bg-tide text-tide-ink',
  neutral: 'bg-bystander text-bystander-ink',
  assassin: 'bg-assassin text-assassin-ink',
};

/**
 * The reveal moment: the chosen card lifts out of the grid over a dimmed table, hangs while a
 * rising tone builds, flips to its identity with the outcome sound, then settles back into place.
 * Positioned over the real tile using its screen rectangle.
 */
export const RevealStage = ({ item, rect, team, onDone }: { item: StageItem; rect: DOMRect; team: 'ember' | 'tide'; onDone: () => void }) => {
  const [phase, setPhase] = useState<'lift' | 'flip' | 'settle'>('lift');

  useEffect(() => {
    playSfx('suspense');
    const a = window.setTimeout(() => {
      setPhase('flip');
      playSfx(item.owner === 'assassin' ? 'assassin' : item.owner === team ? 'reveal_good' : 'reveal_bad');
    }, T.flip);
    const b = window.setTimeout(() => setPhase('settle'), T.settle);
    const c = window.setTimeout(onDone, T.done);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      window.clearTimeout(c);
    };
  }, [item, team, onDone]);

  // Enlarge in place, nudged so the bigger card stays inside the viewport.
  const scale = Math.min(1.75, Math.max(1.3, 260 / rect.width));
  const grow = { w: (rect.width * (scale - 1)) / 2, h: (rect.height * (scale - 1)) / 2 };
  const margin = 16;
  const dx = Math.max(margin - (rect.left - grow.w), 0) + Math.min(window.innerWidth - margin - (rect.right + grow.w), 0);
  const dy = Math.max(margin - (rect.top - grow.h), 0) + Math.min(window.innerHeight - margin - (rect.bottom + grow.h), 0);
  const lifted = phase !== 'settle';

  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: Z.overlay }} aria-hidden>
      <motion.div className="absolute inset-0 bg-black" initial={{ opacity: 0 }} animate={{ opacity: lifted ? 0.5 : 0 }} transition={{ duration: 0.35 }} />
      {item.owner === 'assassin' && phase !== 'lift' ? (
        <motion.div className="absolute inset-0 flex items-end justify-center bg-assassin/80 pb-24" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
          <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ duration: 0.5, ease: easeTabletop }} className="flex items-center gap-3 text-assassin-ink">
            <Skull size={40} weight="fill" />
            <p className="font-display text-[30px] font-extrabold tracking-tight">The Assassin</p>
          </motion.div>
        </motion.div>
      ) : null}
      <motion.div
        className="absolute [perspective:1100px]"
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        initial={{ scale: 1, x: 0, y: 0 }}
        animate={lifted ? { scale, x: dx, y: dy - 10 } : { scale: 1, x: 0, y: 0 }}
        transition={springCard}
      >
        <motion.div
          className="relative h-full w-full [transform-style:preserve-3d]"
          initial={{ rotateY: 0 }}
          animate={{ rotateY: phase === 'lift' ? 0 : 180 }}
          transition={{ duration: 0.65, ease: easeTabletop }}
        >
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-[var(--radius-tile)] bg-paper px-2 text-paper-ink [backface-visibility:hidden]',
              'ring-1 ring-black/10',
              lifted && 'shadow-[0_0_0_3px_var(--accent),0_40px_70px_-20px_rgb(0_0_0/0.85)]',
            )}
          >
            <span className="font-display text-center text-[13px] font-bold uppercase leading-none tracking-wide sm:text-[15px]">{item.word}</span>
            {phase === 'lift' ? (
              <motion.span
                className="absolute inset-0 rounded-[var(--radius-tile)] bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.55)_50%,transparent_65%)]"
                initial={{ x: '-120%' }}
                animate={{ x: '120%' }}
                transition={{ duration: 1.2, ease: 'linear', repeat: Infinity }}
              />
            ) : null}
          </div>
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-[var(--radius-tile)] px-2 [backface-visibility:hidden] [transform:rotateY(180deg)]',
              'shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_40px_70px_-20px_rgb(0_0_0/0.85)]',
              ownerFace[item.owner],
            )}
          >
            <span className="font-display text-center text-[13px] font-bold uppercase leading-none tracking-wide sm:text-[15px]">{item.word}</span>
            {item.owner === 'assassin' ? <Skull size={18} weight="fill" className="absolute right-2 top-2" /> : null}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
