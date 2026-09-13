/** Systemic layers only. Do not use arbitrary z-index values elsewhere. */
export const Z = {
  base: 0,
  board: 10,
  hand: 20,
  overlay: 30,
  dialog: 40,
  toast: 50,
  grain: 60,
} as const;
