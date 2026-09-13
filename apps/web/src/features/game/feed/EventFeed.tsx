import { createElement, useEffect, useRef } from 'react';
import { Eye, Skull } from '@phosphor-icons/react';
import type { Owner, TeamId } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import type { FeedActor, FeedItem } from '@/shared/store/feed';
import { glyphFor } from '@/shared/ui/glyphs';
import { cn } from '@/shared/lib/cn';

/**
 * Compact game log in the Codenames-online style: each entry is a token (clue pill, word chip,
 * card chip) with the acting player's badge, so the eye can scan colours instead of sentences.
 * The full sentence stays in the title attribute and for screen readers.
 */
export const EventFeed = ({ className }: { className?: string }) => {
  const feed = useGameStore((s) => s.feed);
  const catalog = useGameStore((s) => s.view?.public.cardCatalog ?? {});
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  return (
    <section className={cn('flex min-h-0 flex-col rounded-[var(--radius-panel-inner)] bg-panel ring-1 ring-hairline', className)} aria-label="Game log">
      <h2 className="px-3 pt-3 text-[11px] uppercase tracking-[0.16em] text-ink-faint">Game log</h2>
      <ol ref={ref} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
        {feed.length === 0 ? <li className="text-[13px] text-ink-faint">Nothing has happened yet.</li> : null}
        {feed.map((item) => (
          <li key={item.seq} title={item.text} className="flex items-center gap-2">
            <span className="sr-only">{item.text}</span>
            <Entry item={item} glyphName={item.cardDefId ? catalog[item.cardDefId]?.presentation.glyph : undefined} />
          </li>
        ))}
      </ol>
    </section>
  );
};

const ownerChip: Record<Owner, string> = {
  ember: 'bg-ember text-ember-ink',
  tide: 'bg-tide text-tide-ink',
  neutral: 'bg-bystander text-bystander-ink',
  assassin: 'bg-assassin text-assassin-ink ring-1 ring-assassin-ink/40',
};

const Avatar = ({ actor }: { actor: FeedActor | undefined }) => (
  <span
    className={cn(
      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold uppercase ring-2 ring-panel',
      actor?.team === 'ember' ? 'bg-ember text-ember-ink' : actor?.team === 'tide' ? 'bg-tide text-tide-ink' : 'bg-raised text-ink-muted',
    )}
    aria-hidden
  >
    {actor?.nickname.charAt(0) ?? '?'}
  </span>
);

const Entry = ({ item, glyphName }: { item: FeedItem; glyphName: string | undefined }) => {
  switch (item.kind) {
    case 'turn':
      return (
        <span className="flex w-full items-center gap-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em]" aria-hidden>
          <span className={cn('h-px flex-1', item.team === 'ember' ? 'bg-ember/40' : 'bg-tide/40')} />
          <span className={item.team === 'ember' ? 'text-ember' : 'text-tide'}>{item.text.replace(/\.$/, '')}</span>
          <span className={cn('h-px flex-1', item.team === 'ember' ? 'bg-ember/40' : 'bg-tide/40')} />
        </span>
      );
    case 'clue':
      return (
        <>
          <Avatar actor={item.actor} />
          <span className="inline-flex h-7 items-center overflow-hidden rounded-full bg-paper pl-3 text-[13px] font-bold uppercase tracking-wide text-paper-ink ring-1 ring-black/10" aria-hidden>
            <span className="font-display">{item.word}</span>
            <span className={cn('tabular ml-2 inline-flex h-7 min-w-7 items-center justify-center px-2 text-[13px]', item.team === 'ember' ? 'bg-ember text-ember-ink' : 'bg-tide text-tide-ink')}>{item.count}</span>
          </span>
        </>
      );
    case 'reveal':
      return (
        <>
          {item.actor ? <Avatar actor={item.actor} /> : <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted ring-2 ring-panel" aria-hidden>{glyphName ? <GlyphIcon name={glyphName} /> : <Eye size={13} />}</span>}
          <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 font-display text-[12px] font-bold uppercase tracking-wide shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]', item.owner ? ownerChip[item.owner] : 'bg-raised')} aria-hidden>
            {item.owner === 'assassin' ? <Skull size={13} weight="fill" /> : null}
            {item.word}
          </span>
        </>
      );
    case 'card': {
      return (
        <>
          <Avatar actor={item.actor} />
          <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-[#0f1116] pl-1.5 pr-3 text-[12px] font-semibold text-[#ecebe6] ring-1 ring-white/12" aria-hidden>
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-accent">{glyphName ? <GlyphIcon name={glyphName} /> : null}</span>
            <span className="truncate">{item.cardName}</span>
            {item.target ? <span className="truncate text-[11px] font-normal text-white/60">{item.target}</span> : null}
          </span>
        </>
      );
    }
    case 'info':
      return (
        <>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent ring-2 ring-panel" aria-hidden>
            {glyphName ? <GlyphIcon name={glyphName} /> : <Eye size={13} />}
          </span>
          <span className="inline-flex h-7 items-center rounded-full bg-accent/12 px-3 text-[12px] font-medium text-accent ring-1 ring-accent/30" aria-hidden>
            {item.result}
          </span>
        </>
      );
    case 'result':
      return (
        <span className={cn('w-full rounded-[8px] px-3 py-2 font-display text-[14px] font-bold', item.team === 'ember' ? 'bg-ember-soft text-ember' : 'bg-tide-soft text-tide')} aria-hidden>
          {item.text}
        </span>
      );
    case 'system':
    default:
      return (
        <span className="text-[12px] text-ink-faint" aria-hidden>
          {item.text}
        </span>
      );
  }
};

/** Renders a Phosphor glyph looked up by name without creating a component during render. */
const GlyphIcon = ({ name }: { name: string }) => createElement(glyphFor(name), { size: 13, weight: 'duotone' });

export type { TeamId };
