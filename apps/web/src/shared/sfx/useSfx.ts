import { useCallback } from 'react';
import { useGameStore } from '@/shared/store/gameStore';

export type Sfx = 'draw' | 'play' | 'reveal_good' | 'reveal_bad' | 'assassin' | 'clue' | 'turn' | 'win' | 'lose' | 'tick';

let ctx: AudioContext | null = null;
const getCtx = () => {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
};

/** Short synthesized cues; no asset files. Frequencies in Hz, durations in seconds. */
const PATCHES: Record<Sfx, Array<[number, number, OscillatorType, number]>> = {
  draw: [[520, 0.06, 'triangle', 0.15]],
  play: [
    [440, 0.08, 'triangle', 0.15],
    [660, 0.1, 'triangle', 0.12],
  ],
  reveal_good: [
    [523, 0.09, 'sine', 0.18],
    [784, 0.14, 'sine', 0.15],
  ],
  reveal_bad: [[180, 0.22, 'sawtooth', 0.09]],
  assassin: [
    [120, 0.5, 'sawtooth', 0.12],
    [80, 0.7, 'square', 0.06],
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

export const useSfx = () => {
  const muted = useGameStore((s) => s.muted);
  return useCallback(
    (name: Sfx) => {
      if (muted) return;
      const ac = getCtx();
      if (!ac) return;
      let t = ac.currentTime;
      for (const [freq, dur, type, gain] of PATCHES[name]) {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ac.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        t += dur * 0.85;
      }
    },
    [muted],
  );
};
