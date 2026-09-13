import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { WarningCircle } from '@phosphor-icons/react';
import { useGameStore } from '@/shared/store/gameStore';
import { Z } from '@/shared/tokens/z-index';
import { useReduced, easeOutExpo } from '@/shared/motion';

/** Transient errors only. Persistent state lives in the UI itself. */
export const ToastHost = () => {
  const error = useGameStore((s) => s.lastError);
  const dismiss = useGameStore((s) => s.dismissError);
  const reduced = useReduced();

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(dismiss, 4200);
    return () => window.clearTimeout(t);
  }, [error, dismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center px-4" style={{ zIndex: Z.toast }} aria-live="polite">
      <AnimatePresence>
        {error ? (
          <motion.div
            key={error.at}
            initial={reduced ? false : { opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: easeOutExpo }}
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-raised px-4 py-2.5 text-[14px] text-ink ring-1 ring-hairline-strong shadow-[var(--shadow-card)]"
            role="status"
          >
            <WarningCircle size={18} weight="regular" className="text-danger" />
            <span>{error.message}</span>
            <button onClick={dismiss} className="ml-1 text-[13px] text-ink-muted hover:text-ink">
              Dismiss
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};
