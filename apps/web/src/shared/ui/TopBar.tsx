import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Moon, Sun, Monitor } from '@phosphor-icons/react';
import { useTheme } from './theme';
import { cn } from '@/shared/lib/cn';

/** Compact header: wordmark left, page-specific slot, theme control right. Single line, 64px. */
export const TopBar = ({ children, className }: { children?: ReactNode; className?: string }) => {
  const { theme, setTheme } = useTheme();
  const next = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
  const Icon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;
  return (
    <header className={cn('flex h-16 items-center justify-between px-4 sm:px-6', className)}>
      <Link to="/" className="font-display text-[20px] font-bold tracking-tight text-ink">
        Gambit
      </Link>
      <div className="flex min-w-0 items-center gap-3">{children}</div>
      <button
        type="button"
        onClick={() => setTheme(next)}
        aria-label={`Theme: ${theme}. Switch to ${next}.`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted ring-1 ring-hairline hover:bg-raised hover:text-ink"
      >
        <Icon size={18} />
      </button>
    </header>
  );
};
