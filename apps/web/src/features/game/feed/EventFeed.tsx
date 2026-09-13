import { useEffect, useRef } from 'react';
import { useGameStore } from '@/shared/store/gameStore';
import { cn } from '@/shared/lib/cn';

/** Plain sentences, newest at the bottom, auto-scrolled. Only events worth a glance. */
export const EventFeed = ({ className }: { className?: string }) => {
  const feed = useGameStore((s) => s.feed);
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [feed.length]);

  return (
    <section className={cn('flex min-h-0 flex-col rounded-[var(--radius-panel-inner)] bg-panel ring-1 ring-hairline', className)} aria-label="Game log">
      <h2 className="px-3 pt-3 text-[11px] uppercase tracking-[0.16em] text-ink-faint">Table talk</h2>
      <ol ref={ref} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3 text-[13px] leading-snug" aria-live="polite">
        {feed.length === 0 ? <li className="text-ink-faint">Nothing has happened yet.</li> : null}
        {feed.map((item) => (
          <li key={item.seq} className={cn('flex gap-2', item.kind === 'system' ? 'text-ink-faint' : 'text-ink-muted', item.kind === 'result' && 'font-medium text-ink')}>
            <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', item.team === 'ember' ? 'bg-ember' : item.team === 'tide' ? 'bg-tide' : 'bg-hairline-strong')} aria-hidden />
            <span>{item.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};
