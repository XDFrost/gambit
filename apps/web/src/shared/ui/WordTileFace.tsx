import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { Eye, HandTap, Lock, ShieldCheck, Skull } from '@phosphor-icons/react';
import type { Owner, TeamId } from '@gambit/protocol';
import { cn } from '@/shared/lib/cn';
import { useReduced, easeTabletop } from '@/shared/motion';

export interface TileMark {
  playerId: string;
  nickname: string;
  team: TeamId | null;
}

export interface WordTileFaceProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  word: string;
  revealed: boolean;
  owner?: Owner | undefined;
  /** Spymaster only: colour rim showing the hidden owner. */
  keyOwner?: Owner | undefined;
  /** Owner learned through a card (team-private mark). */
  knownOwner?: Owner | undefined;
  lockedFor?: TeamId | undefined;
  shieldedBy?: TeamId | undefined;
  hiddenText?: boolean;
  selectable?: boolean;
  pending?: boolean;
  targetMode?: 'valid' | 'invalid' | 'picked' | null;
  dimmed?: boolean;
  compact?: boolean;
  /** Players currently marking this word (shared, two-step selection). */
  marks?: TileMark[];
  /** Whether the viewer has marked this word. */
  markedByMe?: boolean;
  /** When set, a reveal control appears at the top-right corner. */
  onReveal?: (() => void) | undefined;
}

const ownerBg: Record<Owner, string> = {
  ember: 'bg-ember text-ember-ink',
  tide: 'bg-tide text-tide-ink',
  neutral: 'bg-bystander text-bystander-ink',
  assassin: 'bg-assassin text-assassin-ink',
};
/** Spymaster key styling: a strong rim plus a colour wash over the paper so teams read at a glance. */
const ownerRim: Record<Owner, string> = {
  ember: 'ring-[3px] ring-ember bg-[color-mix(in_srgb,var(--paper),var(--ember)_48%)]',
  tide: 'ring-[3px] ring-tide bg-[color-mix(in_srgb,var(--paper),var(--tide)_52%)]',
  neutral: 'ring-[3px] ring-bystander bg-[color-mix(in_srgb,var(--paper),var(--bystander)_55%)]',
  assassin: 'ring-[3px] ring-assassin bg-[color-mix(in_srgb,var(--paper),var(--assassin)_40%)]',
};

/**
 * A word card on the table. Hidden = paper; revealed = flipped to its owner's colour.
 * The flip is a real 3D rotation so the state change reads as a physical card turning.
 * Marks (who is considering the word) sit along the bottom; the reveal control is a separate
 * sibling button so the card itself stays a single button.
 */
export const WordTileFace = forwardRef<HTMLButtonElement, WordTileFaceProps>(function WordTileFace(
  {
    word,
    revealed,
    owner,
    keyOwner,
    knownOwner,
    lockedFor,
    shieldedBy,
    hiddenText,
    selectable,
    pending,
    targetMode,
    dimmed,
    compact,
    marks = [],
    markedByMe,
    onReveal,
    className,
    disabled,
    ...rest
  },
  ref,
) {
  const reduced = useReduced();
  const interactive = (selectable || targetMode === 'valid' || targetMode === 'picked') && !disabled;
  const rim = !revealed && keyOwner ? ownerRim[keyOwner] : '';
  const mark = !revealed && !keyOwner && knownOwner ? knownOwner : undefined;
  const showMarks = !revealed && marks.length > 0;

  return (
    <div className={cn('relative', dimmed && 'opacity-40', className)}>
      <button
        ref={ref}
        type="button"
        disabled={!interactive}
        aria-pressed={targetMode === 'picked' || markedByMe ? true : undefined}
        aria-label={
          revealed
            ? `${word}, revealed as ${owner === 'neutral' ? 'bystander' : owner}`
            : hiddenText
              ? 'Hidden word'
              : `${word}${lockedFor ? ', locked' : ''}${shieldedBy ? ', shielded' : ''}${showMarks ? `, marked by ${marks.map((m) => m.nickname).join(', ')}` : ''}`
        }
        className={cn('group relative aspect-[5/3] w-full select-none [perspective:900px] focus-visible:outline-none', !interactive && 'cursor-default')}
        {...rest}
      >
        <motion.div
          className="relative h-full w-full [transform-style:preserve-3d]"
          animate={{ rotateY: revealed ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.6, ease: easeTabletop }}
          initial={false}
        >
          {/* Front: paper */}
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-[var(--radius-tile)] px-2 text-paper-ink [backface-visibility:hidden]',
              !rim && 'bg-paper',
              'shadow-[var(--shadow-tile)] ring-1 ring-black/10 transition-[transform,box-shadow] duration-200 ease-[var(--ease-tabletop)]',
              interactive && 'group-hover:-translate-y-0.5 group-hover:shadow-[0_1px_0_rgb(255_255_255/0.4)_inset,0_12px_22px_-10px_var(--paper-shadow)]',
              interactive && 'group-focus-visible:ring-2 group-focus-visible:ring-accent',
              rim,
              showMarks && 'ring-2 ring-accent',
              markedByMe && 'ring-[3px] ring-accent',
              targetMode === 'valid' && 'outline-2 outline-dashed outline-accent outline-offset-2',
              targetMode === 'picked' && 'outline-[3px] outline-solid outline-accent outline-offset-2 -translate-y-0.5',
              targetMode === 'invalid' && 'opacity-45',
              pending && 'animate-pulse ring-2 ring-accent',
            )}
          >
            <span
              className={cn(
                'font-display text-center font-bold uppercase leading-none tracking-wide',
                compact ? 'text-[11px] sm:text-[12px]' : 'text-[12px] sm:text-[14px] md:text-[15px]',
                hiddenText && 'text-transparent',
                showMarks && '-translate-y-1.5',
              )}
            >
              {hiddenText ? '████' : word}
            </span>
            {hiddenText ? (
              <span className="absolute inset-1 rounded-[9px] bg-[repeating-linear-gradient(135deg,rgb(0_0_0/0.75)_0_6px,rgb(0_0_0/0.55)_6px_12px)]" aria-hidden />
            ) : null}
            {mark ? (
              <span
                className={cn('absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full', mark === 'ember' ? 'bg-ember' : mark === 'tide' ? 'bg-tide' : 'bg-bystander')}
                aria-label={`Known: ${mark}`}
              />
            ) : null}
            <span className="absolute right-1.5 top-1.5 flex gap-1 text-paper-ink/70">
              {lockedFor ? <Lock size={12} weight="fill" aria-hidden /> : null}
              {shieldedBy ? <ShieldCheck size={12} weight="fill" aria-hidden className={shieldedBy === 'ember' ? 'text-ember' : 'text-tide'} /> : null}
            </span>
            {keyOwner === 'assassin' ? <Skull size={22} weight="fill" className="absolute bottom-1.5 right-1.5 text-paper-ink/85" aria-hidden /> : null}
            {keyOwner && keyOwner !== 'assassin' ? (
              <span className={cn('absolute bottom-1.5 left-1.5', keyOwner === 'ember' ? 'text-ember' : keyOwner === 'tide' ? 'text-tide' : 'text-paper-ink/60')} aria-hidden>
                <Eye size={18} weight="fill" />
              </span>
            ) : null}
            {showMarks ? (
              <span className="absolute inset-x-1 bottom-1 flex justify-center gap-1 overflow-hidden" aria-hidden>
                {marks.slice(0, 3).map((m) => (
                  <span
                    key={m.playerId}
                    className={cn(
                      'inline-flex h-[18px] max-w-[46%] items-center gap-1 truncate rounded-full px-1.5 text-[10px] font-semibold leading-none',
                      m.team === 'ember' ? 'bg-ember text-ember-ink' : m.team === 'tide' ? 'bg-tide text-tide-ink' : 'bg-paper-ink/80 text-paper',
                    )}
                  >
                    <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-white/25 text-[8px] uppercase">{m.nickname.charAt(0)}</span>
                    <span className="truncate">{m.nickname}</span>
                  </span>
                ))}
                {marks.length > 3 ? <span className="rounded-full bg-paper-ink/80 px-1.5 text-[10px] font-semibold leading-[18px] text-paper">+{marks.length - 3}</span> : null}
              </span>
            ) : null}
          </div>
          {/* Back: revealed owner */}
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-[var(--radius-tile)] px-2 [backface-visibility:hidden] [transform:rotateY(180deg)]',
              'shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]',
              owner ? ownerBg[owner] : 'bg-raised',
            )}
          >
            <span className={cn('font-display text-center font-bold uppercase leading-none tracking-wide', compact ? 'text-[11px]' : 'text-[12px] sm:text-[14px] md:text-[15px]')}>
              {word}
            </span>
            {owner === 'assassin' ? <Skull size={16} weight="fill" className="absolute right-2 top-2" aria-hidden /> : null}
          </div>
        </motion.div>
      </button>

      {onReveal && !revealed ? (
        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReveal();
          }}
          aria-label={`Reveal ${word}`}
          title="Reveal this word"
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          className={cn(
            'absolute -right-2 -top-2 z-[1] inline-flex items-center justify-center rounded-full',
            'bg-[#4caf50] text-white shadow-[0_6px_14px_-4px_rgb(0_0_0/0.5),inset_0_1px_0_rgb(255_255_255/0.35)] ring-2 ring-[#2e7d32]/70',
            'transition-transform duration-200 ease-[var(--ease-tabletop)] hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            compact ? 'h-7 w-7' : 'h-9 w-9 sm:h-10 sm:w-10',
          )}
        >
          <HandTap size={compact ? 14 : 20} weight="fill" />
        </motion.button>
      ) : null}
    </div>
  );
});
