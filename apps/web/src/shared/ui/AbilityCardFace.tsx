import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { CardCategory, CardDefinitionView } from '@gambit/protocol';
import { cn } from '@/shared/lib/cn';
import { glyphFor } from './glyphs';

export interface AbilityCardFaceProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  def: CardDefinitionView;
  size?: 'hand' | 'inspect' | 'mini';
  selected?: boolean;
  faded?: boolean;
  disabledReason?: string | undefined;
}

const family: Record<CardCategory, { face: string; ink: string; glyph: string; label: string }> = {
  information: { face: 'from-[#1c2a35] to-[#101a22]', ink: 'text-[#dbe8f0]', glyph: 'text-[#7cc4e8]', label: 'Information' },
  board: { face: 'from-[#2c2415] to-[#171208]', ink: 'text-[#f0e6d2]', glyph: 'text-[#e0a84a]', label: 'Board' },
  turn: { face: 'from-[#2a2818] to-[#16150c]', ink: 'text-[#f4efdc]', glyph: 'text-[#e6cf7a]', label: 'Turn' },
  gamble: { face: 'from-[#301a2a] to-[#180d15]', ink: 'text-[#f3e2ee]', glyph: 'text-[#e37bb6]', label: 'Gamble' },
  team: { face: 'from-[#1a2c22] to-[#0d1712]', ink: 'text-[#dff0e6]', glyph: 'text-[#7fd1a2]', label: 'Team' },
};

const rarityTicks: Record<CardDefinitionView['rarity'], number> = { common: 1, uncommon: 2, rare: 3 };

const costText = (def: CardDefinitionView): string | null => {
  const parts: string[] = [];
  if (def.cost.guesses) parts.push(`${def.cost.guesses} guess`);
  if (def.cost.discard) parts.push(`discard ${def.cost.discard}`);
  if (def.cost.endsTurn) parts.push('ends turn');
  return parts.length ? parts.join(', ') : null;
};

/**
 * Original card frame: graphite shell, tinted face by category, glyph top-left, cost chip
 * top-right, name in display type, rules in body type, rarity as hairline ticks.
 */
export const AbilityCardFace = forwardRef<HTMLButtonElement, AbilityCardFaceProps>(function AbilityCardFace(
  { def, size = 'hand', selected, faded, disabledReason, className, ...rest },
  ref,
) {
  const f = family[def.category];
  const Glyph = glyphFor(def.presentation.glyph);
  const cost = costText(def);
  const inspect = size === 'inspect';
  const mini = size === 'mini';

  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${def.name}. ${def.description}${disabledReason ? `. ${disabledReason}` : ''}`}
      className={cn(
        'group relative shrink-0 rounded-[var(--radius-card)] bg-[#0f1116] p-[5px] text-left ring-1 ring-white/10 shadow-[var(--shadow-card)]',
        'transition-[transform,box-shadow] duration-300 ease-[var(--ease-tabletop)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        selected && 'ring-2 ring-accent',
        faded && 'opacity-50 saturate-50',
        mini ? 'w-[120px]' : inspect ? 'w-[300px]' : 'w-[150px] sm:w-[164px]',
        className,
      )}
      {...rest}
    >
      <div
        className={cn(
          'flex h-full flex-col rounded-[var(--radius-card-inner)] bg-gradient-to-b ring-1 ring-white/8',
          'shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]',
          f.face,
          f.ink,
          mini ? 'aspect-[5/7] p-2.5' : inspect ? 'aspect-[5/7] p-5' : 'aspect-[5/7] p-3',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className={cn('inline-flex items-center justify-center rounded-full bg-white/8 ring-1 ring-white/10', mini ? 'h-8 w-8' : inspect ? 'h-14 w-14' : 'h-10 w-10', f.glyph)}>
            <Glyph size={mini ? 16 : inspect ? 30 : 22} weight="duotone" />
          </span>
          {cost ? (
            <span className={cn('rounded-full bg-black/35 px-2 py-0.5 font-medium ring-1 ring-white/10 tabular', mini ? 'text-[9px]' : inspect ? 'text-[12px]' : 'text-[10px]')}>
              {cost}
            </span>
          ) : null}
        </div>
        <div className={cn('mt-auto', mini ? 'space-y-0.5' : 'space-y-1.5')}>
          <div className="flex items-center gap-1" aria-label={`${def.rarity}`}>
            {Array.from({ length: rarityTicks[def.rarity] }, (_, i) => (
              <span key={i} className="h-[2px] w-3 rounded-full bg-white/45" />
            ))}
          </div>
          <h3 className={cn('font-display font-bold leading-[1.05] tracking-tight', mini ? 'text-[13px]' : inspect ? 'text-[26px]' : 'text-[16px]')}>{def.name}</h3>
          {!mini ? <p className={cn('leading-snug opacity-85', inspect ? 'text-[16px]' : 'text-[11.5px]')}>{def.description}</p> : null}
          <p className={cn('uppercase tracking-[0.14em] opacity-60', mini ? 'text-[8px]' : inspect ? 'text-[11px]' : 'text-[9px]')}>{f.label}</p>
        </div>
      </div>
    </button>
  );
});
