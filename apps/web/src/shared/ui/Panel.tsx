import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Padding of the inner core. */
  inner?: string;
  tone?: 'default' | 'sunken';
}

/**
 * Double-bezel container: an outer shell with a hairline ring and a concentric inner core,
 * so surfaces read as machined objects rather than flat boxes.
 */
export const Panel = ({ children, className, inner = 'p-4', tone = 'default', ...rest }: PanelProps) => (
  <div
    className={cn(
      'rounded-[var(--radius-panel)] p-1.5 ring-1 ring-hairline',
      tone === 'sunken' ? 'bg-sunken/60' : 'bg-white/[0.03] dark:bg-white/[0.03]',
      'shadow-[var(--shadow-panel)]',
      className,
    )}
    {...rest}
  >
    <div
      className={cn(
        'h-full rounded-[var(--radius-panel-inner)] bg-panel ring-1 ring-hairline',
        'shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]',
        inner,
      )}
    >
      {children}
    </div>
  </div>
);
