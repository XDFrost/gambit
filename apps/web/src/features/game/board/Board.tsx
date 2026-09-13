import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from '@phosphor-icons/react';
import type { Owner, TileId } from '@gambit/protocol';
import { useGameStore } from '@/shared/store/gameStore';
import { socket } from '@/shared/ws/socket';
import { WordTileFace, type TileMark } from '@/shared/ui/WordTileFace';
import { Button } from '@/shared/ui/Button';
import { useReduced, easeOutExpo } from '@/shared/motion';
import { useCardPlay } from '../cardPlay/useCardPlay';
import { RevealStage, type StageItem } from './RevealStage';

/**
 * The 5x5 grid, ordered by position. Guessing is two-step: the first click marks a word for
 * everyone at the table, clicking again unmarks it, and the reveal control on a marked word
 * makes the actual guess. Reveals are staged (lift, suspense, flip) before the tile settles.
 */
export const Board = () => {
  const view = useGameStore((s) => s.view)!;
  const pending = useGameStore((s) => s.pending);
  const flashes = useGameStore((s) => s.flashes);
  const reduced = useReduced();
  const { targeting, onTargetTile, cancel, defOf } = useCardPlay();

  const turn = view.public.turn;
  const me = view.me;
  const key = view.spymaster?.key;
  const known = view.team?.knownOwners ?? {};
  const isMyGuessTurn = !!turn && turn.phase === 'guess' && turn.team === me.team && me.role === 'operative' && (turn.guessesRemaining === 'unlimited' || turn.guessesRemaining > 0);
  const pendingTile = Object.values(pending).find((p) => p.type === 'SELECT_WORD')?.tileId;

  const tiles = useMemo(() => [...view.public.tiles].sort((a, b) => a.position - b.position), [view.public.tiles]);
  const playersById = useMemo(() => new Map(view.public.players.map((p) => [p.id, p])), [view.public.players]);

  // ---- staged reveals: queue WORD_REVEALED flashes; hold the tile face until its stage finishes.
  const tileRefs = useRef(new Map<TileId, HTMLButtonElement>());
  const seenFlash = useRef(0);
  const [queue, setQueue] = useState<Array<StageItem & { team: 'ember' | 'tide' }>>([]);
  const [settled, setSettled] = useState<Set<TileId>>(() => new Set());
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const fresh = flashes.filter((f) => f.id > seenFlash.current);
    if (fresh.length === 0) return;
    seenFlash.current = flashes[flashes.length - 1]!.id;
    if (reduced) return;
    const items = fresh
      .filter((f) => f.event.type === 'WORD_REVEALED')
      .map((f) => {
        const e = f.event as Extract<typeof f.event, { type: 'WORD_REVEALED' }>;
        return { key: f.id, tileId: e.tileId, word: e.word, owner: e.owner, team: e.team };
      });
    if (items.length) setQueue((q) => [...q, ...items]);
  }, [flashes, reduced]);

  const active = queue[0];

  const finishStage = useCallback(() => {
    setQueue((q) => {
      const [done, ...rest] = q;
      if (done) setSettled((s) => new Set(s).add(done.tileId));
      return rest;
    });
    setRect(null);
  }, []);

  // Measure the tile once it is the active stage item. If it is not on screen (mobile tab
  // switched away), skip the stage rather than stalling the queue.
  useEffect(() => {
    if (!active) return;
    const el = tileRefs.current.get(active.tileId);
    if (!el) {
      finishStage();
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [active, finishStage]);

  const holding = useMemo(() => new Set(queue.map((q) => q.tileId)), [queue]);

  const marksFor = useCallback(
    (id: TileId): TileMark[] =>
      (turn?.marks[String(id)] ?? []).map((pid) => {
        const p = playersById.get(pid);
        return { playerId: pid, nickname: p?.nickname ?? 'Someone', team: p?.team ?? null };
      }),
    [turn, playersById],
  );

  const onTile = useCallback(
    (id: TileId) => {
      if (targeting) return onTargetTile(id);
      if (!isMyGuessTurn || !turn) return;
      socket.send({ type: 'MARK_WORD', tileId: id, expectedTurnIndex: turn.index }, { tileId: id });
    },
    [targeting, onTargetTile, isMyGuessTurn, turn],
  );

  const reveal = useCallback(
    (id: TileId) => {
      if (!isMyGuessTurn || !turn) return;
      socket.send({ type: 'SELECT_WORD', tileId: id, expectedTurnIndex: turn.index }, { tileId: id });
    },
    [isMyGuessTurn, turn],
  );

  const targetingDef = targeting ? defOf(targeting.cardId) : null;
  const staging = queue.length > 0;

  return (
    <div className="relative">
      <AnimatePresence>
        {targeting && targetingDef ? (
          <motion.div
            key="targeting"
            initial={reduced ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: easeOutExpo }}
            className="mb-3 flex items-center justify-between gap-3 rounded-full bg-accent px-4 py-2 text-[14px] font-medium text-accent-ink"
            role="status"
          >
            <span>
              Choose {targeting.needed === 2 ? 'two words' : 'a word'} for {targetingDef.name}.
              {targeting.needed === 2 ? ` ${targeting.picked.length} of 2 picked.` : ''}
            </span>
            <button type="button" onClick={cancel} className="inline-flex items-center gap-1 rounded-full bg-black/10 px-2.5 py-1 text-[13px] hover:bg-black/20">
              <X size={12} weight="bold" /> Cancel
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className="grid grid-cols-5 gap-2 sm:gap-3"
        role="grid"
        aria-label="Word board"
        aria-busy={staging || undefined}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && targeting) cancel();
        }}
      >
        {tiles.map((t) => {
          const held = holding.has(t.id);
          const keyOwner: Owner | undefined = key ? key[t.id] : undefined;
          const knownOwner = known[String(t.id)];
          const lockedForMe = !!t.lockedFor && t.lockedFor === me.team;
          let targetMode: 'valid' | 'invalid' | 'picked' | null = null;
          if (targeting) {
            if (targeting.picked.includes(t.id)) targetMode = 'picked';
            else if (targeting.validTiles.includes(t.id)) targetMode = 'valid';
            else targetMode = 'invalid';
          }
          const revealed = t.revealed && !held;
          const selectable = !targeting && !staging && isMyGuessTurn && !t.revealed && !lockedForMe;
          const marks = revealed ? [] : marksFor(t.id);
          const canReveal = selectable && marks.length > 0 && pendingTile !== t.id;
          return (
            <WordTileFace
              key={t.id}
              ref={(el) => {
                if (el) tileRefs.current.set(t.id, el);
                else tileRefs.current.delete(t.id);
              }}
              word={t.word}
              revealed={revealed}
              owner={revealed ? t.owner : undefined}
              instant={held || settled.has(t.id)}
              keyOwner={held ? undefined : keyOwner}
              knownOwner={knownOwner}
              lockedFor={t.lockedFor}
              shieldedBy={t.shieldedBy}
              hiddenText={!!t.hiddenTextFor && t.hiddenTextFor === me.team && me.role === 'operative'}
              selectable={selectable}
              pending={pendingTile === t.id && !held}
              targetMode={t.revealed ? (targeting ? 'invalid' : null) : targetMode}
              dimmed={(!!targeting && targetMode === 'invalid') || (active?.tileId === t.id && rect !== null)}
              marks={marks}
              markedByMe={marks.some((m) => m.playerId === me.playerId)}
              onReveal={canReveal ? () => reveal(t.id) : undefined}
              onClick={() => onTile(t.id)}
              title={lockedForMe ? 'Locked for your team this turn' : t.shieldedBy ? 'Shielded from opponent cards' : selectable ? (marks.length ? 'Click to unmark, or press the green control to reveal' : 'Click to mark this word for your team') : undefined}
            />
          );
        })}
      </div>

      {active && rect ? <RevealStage key={active.key} item={active} rect={rect} team={active.team} onDone={finishStage} /> : null}

      {!targeting && turn?.phase === 'guess' && turn.team === me.team && me.role === 'operative' ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-ink-faint">Click a word to mark it for your team. Press the green control on a marked word to reveal it.</p>
          <Button variant="secondary" size="sm" onClick={() => socket.send({ type: 'END_TURN', expectedTurnIndex: turn.index })}>
            End turn
          </Button>
        </div>
      ) : null}
    </div>
  );
};
