import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Stack } from '@phosphor-icons/react';
import { useGameStore } from '@/shared/store/gameStore';
import { AbilityCardFace } from '@/shared/ui/AbilityCardFace';
import { Button } from '@/shared/ui/Button';
import { Z } from '@/shared/tokens/z-index';
import { cn } from '@/shared/lib/cn';
import { useReduced, springCard, easeOutExpo } from '@/shared/motion';
import { useCardPlay } from '../cardPlay/useCardPlay';

/**
 * The operative's hand: fanned cards along the bottom, deck and discard counters, inspect stage
 * and confirmation sheet. Draws slide in from the deck side; plays lift out of the fan.
 */
export const Hand = ({ className }: { className?: string }) => {
  const view = useGameStore((s) => s.view)!;
  const pendingPlay = useGameStore((s) => Object.values(s.pending).find((p) => p.type === 'PLAY_CARD'));
  const reduced = useReduced();
  const { hand, catalog, defOf, reasonFor, inspectingCardId, inspect, beginPlay, targeting, confirmCardId, confirmDef, confirmTiles, confirm, cancel } = useCardPlay();
  const team = view.me.team;
  const teamPublic = team ? view.public.teams[team] : null;
  const discardTop = teamPublic?.discard[teamPublic.discard.length - 1];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);

  if (!team || view.me.role !== 'operative') return null;
  const inspectingDef = inspectingCardId ? defOf(inspectingCardId) : null;
  const mid = (hand.length - 1) / 2;

  return (
    <div className={cn('relative', className)} style={{ zIndex: Z.hand }}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3 text-[12px] text-ink-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 ring-1 ring-hairline">
            <Stack size={14} />
            <span className="tabular text-ink">{teamPublic?.deckCount ?? 0}</span> in deck
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 ring-1 ring-hairline">
            <span className="tabular text-ink">{teamPublic?.discard.length ?? 0}</span> played
            {discardTop && catalog[discardTop] ? <span className="text-ink-faint">, last {catalog[discardTop].name}</span> : null}
          </span>
          {teamPublic?.playedThisTurn ? <span className="text-ink-faint">Card played this turn.</span> : null}
        </div>
      </div>

      <div className="mt-3 flex min-h-[220px] items-end justify-center" role="list" aria-label="Your team's hand">
        <AnimatePresence initial={false}>
          {hand.map((card, i) => {
            const def = catalog[card.defId];
            if (!def) return null;
            const reason = reasonFor(card.id);
            const isPending = pendingPlay?.cardId === card.id;
            const isTargeting = targeting?.cardId === card.id;
            const angle = reduced ? 0 : (i - mid) * 5;
            const lift = reduced ? 0 : Math.abs(i - mid) * 6;
            return (
              <motion.div
                key={card.id}
                role="listitem"
                layout
                initial={reduced ? false : { opacity: 0, x: 240, y: 40, rotate: 12 }}
                animate={{ opacity: 1, x: 0, y: lift, rotate: angle }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -160, scale: 0.9, transition: { duration: 0.35, ease: easeOutExpo } }}
                transition={springCard}
                {...(reduced || reason ? {} : { whileHover: { y: lift - 14, rotate: 0, scale: 1.03 } })}
                className={cn('relative -mx-3 origin-bottom', isTargeting && 'z-10')}
              >
                <AbilityCardFace
                  def={def}
                  faded={!!reason}
                  selected={isTargeting || confirmCardId === card.id}
                  disabledReason={reason ?? undefined}
                  onClick={() => inspect(card.id)}
                  className={cn(isPending && 'animate-pulse')}
                />
                {reason ? (
                  <span className="pointer-events-none absolute inset-x-2 bottom-3 rounded-full bg-black/70 px-2 py-1 text-center text-[10px] leading-tight text-white/90 ring-1 ring-white/15" aria-hidden>
                    {reason}
                  </span>
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {hand.length === 0 ? <p className="pb-16 text-[14px] text-ink-faint">No cards in hand. You draw one at the start of your turn.</p> : null}
      </div>

      {/* Inspect stage */}
      <AnimatePresence>
        {inspectingDef && inspectingCardId ? (
          <motion.div
            key="inspect"
            className="fixed inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            style={{ zIndex: Z.dialog }}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => inspect(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`${inspectingDef.name} details`}
          >
            <motion.div
              initial={reduced ? false : { scale: 0.85, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              {...(reduced ? {} : { exit: { scale: 0.9, y: 20 } })}
              transition={springCard}
              onClick={(e) => e.stopPropagation()}
              className="flex flex-col items-center gap-5 sm:flex-row sm:items-end"
            >
              <AbilityCardFace def={inspectingDef} size="inspect" tabIndex={-1} />
              <div className="flex w-[300px] flex-col gap-3 rounded-[var(--radius-panel-inner)] bg-panel p-4 ring-1 ring-hairline">
                <p className="text-[14px] leading-relaxed text-ink-muted">{inspectingDef.rulesText}</p>
                <p className="text-[12px] text-ink-faint">
                  {inspectingDef.duration === 'instant' ? 'Resolves immediately.' : inspectingDef.duration === 'this_turn' ? 'Lasts this turn.' : inspectingDef.duration === 'opponent_next_turn' ? 'Applies during the other team’s next turn.' : inspectingDef.duration === 'own_next_turn' ? 'Applies at the start of your next turn.' : inspectingDef.duration === 'until_own_next_turn_end' ? 'Lasts until your next turn ends.' : 'Permanent.'}
                </p>
                {reasonFor(inspectingCardId) ? <p className="rounded-[var(--radius-input)] bg-sunken px-3 py-2 text-[13px] text-ink-muted ring-1 ring-hairline">{reasonFor(inspectingCardId)}</p> : null}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => inspect(null)}>
                    Back
                  </Button>
                  <Button disabled={!!reasonFor(inspectingCardId)} onClick={() => beginPlay(inspectingCardId)} trailing={<ArrowRight size={14} />}>
                    Play
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Confirm sheet */}
      <AnimatePresence>
        {confirmDef && confirmCardId ? (
          <motion.div
            key="confirm"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: easeOutExpo }}
            className="fixed inset-x-0 bottom-4 flex justify-center px-4"
            style={{ zIndex: Z.dialog }}
            role="dialog"
            aria-label="Confirm card play"
          >
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] bg-raised p-2 pl-4 ring-1 ring-hairline-strong shadow-[var(--shadow-card)]">
              <p className="text-[15px] text-ink">
                Play <strong className="font-display">{confirmDef.name}</strong>
                {confirmTiles.length ? ` on ${confirmTiles.map((id) => view.public.tiles.find((t) => t.id === id)?.word ?? '').join(' and ')}` : ''}?
                {confirmDef.cost.guesses ? <span className="text-ink-muted"> Costs {confirmDef.cost.guesses} guess.</span> : null}
                {confirmDef.cost.endsTurn ? <span className="text-ink-muted"> Ends your turn.</span> : null}
              </p>
              <Button variant="ghost" size="sm" onClick={cancel}>
                Back
              </Button>
              <Button size="sm" onClick={confirm}>
                Play it
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
