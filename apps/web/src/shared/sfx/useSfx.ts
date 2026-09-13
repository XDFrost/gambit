import { useCallback } from 'react';
import { useGameStore } from '@/shared/store/gameStore';

export type Sfx = 'draw' | 'play' | 'suspense' | 'reveal_good' | 'reveal_bad' | 'assassin' | 'clue' | 'turn' | 'win' | 'lose' | 'tick';

let ctx: AudioContext | null = null;
const getCtx = () => {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
};

/**
 * Short synthesized cues; no asset files.
 * Segment: [startHz, seconds, oscillator, gain, endHz?, overlapWithPrevious?]
 * Segments play back to back unless `overlap` is true (then they layer on the previous start).
 */
type Seg = [number, number, OscillatorType, number, number?, boolean?];
const PATCHES: Record<Sfx, Seg[]> = {
  draw: [[520, 0.06, 'triangle', 0.15]],
  play: [
    [440, 0.08, 'triangle', 0.15],
    [660, 0.1, 'triangle', 0.12],
  ],
  /** Rising two-voice sweep that lasts as long as the card hangs in the air. */
  suspense: [
    [196, 1.35, 'triangle', 0.07, 392],
    [294, 1.35, 'sine', 0.05, 587, true],
  ],
  reveal_good: [
    [523, 0.1, 'sine', 0.18],
    [659, 0.1, 'sine', 0.16],
    [784, 0.22, 'sine', 0.16],
  ],
  reveal_bad: [
    [220, 0.16, 'sawtooth', 0.08],
    [165, 0.3, 'sawtooth', 0.08],
  ],
  assassin: [
    [120, 0.5, 'sawtooth', 0.12],
    [80, 0.8, 'square', 0.06],
  ],
  clue: [[660, 0.12, 'sine', 0.14]],
  turn: [
    [392, 0.1, 'triangle', 0.12],
    [494, 0.12, 'triangle', 0.12],
  ],
  win: [
    [523, 0.12, 'sine', 0.16],
    [659, 0.12, 'sine', 0.16],
    [784, 0.24, 'sine', 0.16],
  ],
  lose: [
    [330, 0.18, 'triangle', 0.14],
    [247, 0.32, 'triangle', 0.12],
  ],
  tick: [[900, 0.03, 'square', 0.05]],
};

export const playSfx = (name: Sfx): void => {
  if (useGameStore.getState().muted) return;
  const ac = getCtx();
  if (!ac) return;
  let t = ac.currentTime;
  let prevStart = t;
  for (const [freq, dur, type, gain, endFreq, overlap] of PATCHES[name]) {
    const start = overlap ? prevStart : t;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.linearRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    prevStart = start;
    if (!overlap) t = start + dur * 0.85;
  }
};

export const useSfx = () => {
  const muted = useGameStore((s) => s.muted);
  return useCallback(
    (name: Sfx) => {
      if (muted) return;
      playSfx(name);
    },
    [muted],
  );
};
