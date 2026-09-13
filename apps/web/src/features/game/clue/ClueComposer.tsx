import { useMemo, useState, type FormEvent } from 'react';
import { Minus, PaperPlaneRight, Plus } from '@phosphor-icons/react';
import { useGameStore } from '@/shared/store/gameStore';
import { socket } from '@/shared/ws/socket';
import { Button } from '@/shared/ui/Button';
import { Panel } from '@/shared/ui/Panel';

const CLUE_RE = /^[\p{L}][\p{L}'-]{0,23}$/u;

/** Spymaster only, clue phase only. Mirrors the server's validation so errors show before sending. */
export const ClueComposer = () => {
  const view = useGameStore((s) => s.view)!;
  const pending = useGameStore((s) => Object.values(s.pending).some((p) => p.type === 'GIVE_CLUE'));
  const [word, setWord] = useState('');
  const [count, setCount] = useState(2);
  const turn = view.public.turn!;

  const boardWords = useMemo(() => view.public.tiles.filter((t) => !t.revealed).map((t) => t.word.toUpperCase()), [view.public.tiles]);
  const upper = word.trim().toUpperCase();
  const error = !upper
    ? null
    : !CLUE_RE.test(upper)
      ? 'One word, letters only.'
      : boardWords.some((w) => w === upper || w.includes(upper) || upper.includes(w))
        ? 'Too close to a word on the board.'
        : null;
  const ready = upper.length > 0 && !error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    socket.send({ type: 'GIVE_CLUE', word: upper, count, expectedTurnIndex: turn.index });
    setWord('');
  };

  return (
    <Panel inner="p-4 sm:p-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="clue-word" className="text-[13px] font-medium text-ink-muted">
            Your clue
          </label>
          <input
            id="clue-word"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby="clue-help"
            className="h-14 rounded-[var(--radius-input)] bg-sunken px-4 font-display text-[26px] font-bold uppercase tracking-wide text-ink ring-1 ring-hairline-strong placeholder:text-ink-faint focus:ring-2 focus:ring-accent focus:outline-none"
          />
          <p id="clue-help" className={error ? 'text-[13px] text-danger' : 'text-[13px] text-ink-faint'}>
            {error ?? 'One word that connects your agents. Not a word on the board.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-ink-muted">Number</span>
            <div className="inline-flex items-center rounded-full bg-sunken ring-1 ring-hairline-strong">
              <button type="button" aria-label="Fewer" onClick={() => setCount((c) => Math.max(0, c - 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:text-ink">
                <Minus size={16} />
              </button>
              <span className="tabular w-10 text-center text-[22px] font-medium text-ink" aria-live="polite">
                {count}
              </span>
              <button type="button" aria-label="More" onClick={() => setCount((c) => Math.min(9, c + 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:text-ink">
                <Plus size={16} />
              </button>
            </div>
            <span className="text-[12px] text-ink-faint">{count === 0 ? 'Zero means unlimited guesses.' : `Your team may guess ${count + 1} times.`}</span>
          </div>
          <Button type="submit" size="lg" disabled={!ready} loading={pending} trailing={<PaperPlaneRight size={16} weight="fill" />}>
            Give clue
          </Button>
        </div>
      </form>
    </Panel>
  );
};
