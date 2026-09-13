import { Link } from 'react-router';
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react';
import type { ClientView } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { cn } from '@/shared/lib/cn';
import { useTheme } from '@/shared/ui/theme';
import { Moon, Sun, Monitor } from '@phosphor-icons/react';

const teamName = (t: 'ember' | 'tide') => (t === 'ember' ? 'Ember' : 'Tide');

export const turnHeadline = (view: ClientView): { title: string; detail: string } => {
  const turn = view.public.turn;
  if (!turn) return { title: 'Setting up', detail: '' };
  const mine = view.me.team === turn.team;
  const who = mine ? 'Your team' : teamName(turn.team);
  if (turn.phase === 'clue') {
    const spy = view.public.players.find((p) => p.team === turn.team && p.role === 'spymaster');
    if (mine && view.me.role === 'spymaster') return { title: 'Your clue', detail: 'Give one word and a number.' };
    return { title: `${who} is thinking`, detail: `${spy?.nickname ?? 'The spymaster'} is preparing a clue.` };
  }
  const left = turn.guessesRemaining === 'unlimited' ? 'unlimited guesses' : `${turn.guessesRemaining} guess${turn.guessesRemaining === 1 ? '' : 'es'} left`;
  return { title: `${who} is guessing`, detail: left };
};

/** Full-width band in the active team's colour. Answers "whose turn is it" at a glance. */
export const TurnIndicator = () => {
  const view = useGameStore((s) => s.view)!;
  const connection = useGameStore((s) => s.connection);
  const muted = useGameStore((s) => s.muted);
  const setMuted = useGameStore((s) => s.setMuted);
  const { theme, setTheme } = useTheme();
  const turn = view.public.turn;
  const team = turn?.team ?? 'ember';
  const { title, detail } = turnHeadline(view);
  const next = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system';
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;

  return (
    <header
      className={cn(
        'flex h-16 items-center justify-between gap-4 px-4 sm:px-6',
        'border-b border-hairline transition-colors duration-500 ease-[var(--ease-tabletop)]',
        team === 'ember' ? 'bg-ember-soft' : 'bg-tide-soft',
      )}
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-4">
        <Link to="/" className="hidden font-display text-[18px] font-bold tracking-tight text-ink sm:block">
          Gambit
        </Link>
        <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', team === 'ember' ? 'bg-ember' : 'bg-tide')} aria-hidden />
        <div className="min-w-0">
          <p className="truncate font-display text-[17px] font-bold leading-tight text-ink sm:text-[19px]">{title}</p>
          <p className="truncate text-[12px] text-ink-muted sm:text-[13px]">
            {detail}
            {connection === 'reconnecting' ? ' Reconnecting.' : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="tabular hidden rounded-full bg-black/10 px-3 py-1 text-[12px] tracking-[0.18em] text-ink-muted sm:inline">{view.public.roomCode}</span>
        <button type="button" onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted ring-1 ring-hairline hover:bg-raised hover:text-ink">
          {muted ? <SpeakerSlash size={16} /> : <SpeakerHigh size={16} />}
        </button>
        <button type="button" onClick={() => setTheme(next)} aria-label={`Theme: ${theme}. Switch to ${next}.`} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted ring-1 ring-hairline hover:bg-raised hover:text-ink">
          <ThemeIcon size={16} />
        </button>
      </div>
    </header>
  );
};
