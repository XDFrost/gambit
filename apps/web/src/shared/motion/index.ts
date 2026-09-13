import { useReducedMotion } from 'motion/react';

/** Spring for cards and tiles: settles quickly, tiny overshoot. */
export const springCard = { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 } as const;
export const springSnappy = { type: 'spring', stiffness: 420, damping: 32 } as const;
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;
export const easeTabletop = [0.32, 0.72, 0, 1] as const;

export const DUR = { fast: 0.16, base: 0.28, slow: 0.52 } as const;

/** True when the user asked for reduced motion; components collapse to static/instant. */
export const useReduced = (): boolean => useReducedMotion() ?? false;
