import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'ember' | 'tide' | 'accent' | 'danger';
  children: ReactNode;
}

export const Chip = ({ tone = 'neutral', className, children, ...rest }: ChipProps) => (
  <span
    className={cn(
      'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium whitespace-nowrap',
      tone === 'neutral' && 'bg-raised text-ink-muted ring-1 ring-hairline',
      tone === 'ember' && 'bg-ember-soft text-ember ring-1 ring-ember/30',
      tone === 'tide' && 'bg-tide-soft text-tide ring-1 ring-tide/30',
      tone === 'accent' && 'bg-accent/15 text-accent ring-1 ring-accent/30',
      tone === 'danger' && 'bg-danger/15 text-danger ring-1 ring-danger/30',
      className,
    )}
    {...rest}
  >
    {children}
  </span>
);
