import { Link } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight } from '@phosphor-icons/react';
import type { CardDefinitionView } from '@gambit/protocol';
import { Button } from '@/shared/ui/Button';
import { TopBar } from '@/shared/ui/TopBar';
import { WordTileFace } from '@/shared/ui/WordTileFace';
import { AbilityCardFace } from '@/shared/ui/AbilityCardFace';
import { useReduced, easeOutExpo } from '@/shared/motion';

/*
 * Design read: real-time party game landing for friend groups, tactile night-table language,
 * native CSS + Tailwind + Motion. Dials: VARIANCE 6, MOTION 5, DENSITY 4.
 * Hero: asymmetric split, headline 2 lines, subtext under 20 words, two CTAs with distinct intents.
 * The right-hand visual is a real mini board built from the actual tile component, not a fake screenshot.
 */

const DEMO_WORDS = ['ORBIT', 'LANTERN', 'GLACIER', 'PIRATE', 'VIOLIN', 'CACTUS', 'MERMAID', 'ROCKET', 'FEATHER', 'CASTLE', 'THUNDER', 'PEARL'];
const DEMO_REVEALED: Record<number, 'ember' | 'tide' | 'neutral'> = { 0: 'tide', 4: 'ember', 7: 'tide', 10: 'neutral' };

const DEMO_CARDS: CardDefinitionView[] = [
  {
    id: 'litmus',
    name: 'Litmus',
    category: 'information',
    rarity: 'common',
    description: 'Choose a word. Your team learns whether it is one of yours.',
    rulesText: '',
    targeting: { kind: 'none' },
    cost: { guesses: 1 },
    duration: 'instant',
    presentation: { glyph: 'Flask', animation: '', sfx: '' },
  },
  {
    id: 'quarantine',
    name: 'Quarantine',
    category: 'board',
    rarity: 'common',
    description: 'Lock a word. The other team cannot pick it on their next turn.',
    rulesText: '',
    targeting: { kind: 'none' },
    cost: {},
    duration: 'opponent_next_turn',
    presentation: { glyph: 'Lock', animation: '', sfx: '' },
  },
  {
    id: 'second_chance',
    name: 'Second Chance',
    category: 'turn',
    rarity: 'uncommon',
    description: 'Your next wrong guess this turn does not end your turn.',
    rulesText: '',
    targeting: { kind: 'none' },
    cost: {},
    duration: 'this_turn',
    presentation: { glyph: 'Feather', animation: '', sfx: '' },
  },
];

export const LandingPage = () => {
  const reduced = useReduced();
  const fade = (delay: number) =>
    reduced
      ? {}
      : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: easeOutExpo } };

  return (
    <main className="mx-auto w-full max-w-[1200px] overflow-x-hidden px-4 sm:px-6">
      <TopBar>
        <Link to="/join" className="text-[14px] text-ink-muted hover:text-ink">
          Have a code?
        </Link>
      </TopBar>

      <section className="grid min-h-[calc(100dvh-4rem)] items-center gap-10 py-10 md:grid-cols-12 md:gap-6">
        <div className="md:col-span-6 lg:col-span-5">
          <motion.h1 {...fade(0)} className="font-display text-[40px] font-extrabold leading-[1] tracking-tight text-ink sm:text-[52px] lg:text-[60px]">
            The word game where the spymaster clues and the team plays a card.
          </motion.h1>
          <motion.p {...fade(0.08)} className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-ink-muted">
            Codenames-style deduction for two teams, plus a small deck of tricks that bends each turn.
          </motion.p>
          <motion.div {...fade(0.16)} className="mt-8 flex flex-wrap gap-3">
            <Link to="/new">
              <Button size="lg" trailing={<ArrowRight size={16} />}>
                Create a game
              </Button>
            </Link>
            <Link to="/join">
              <Button size="lg" variant="secondary">
                Join with a code
              </Button>
            </Link>
          </motion.div>
        </div>

        <motion.div {...fade(0.1)} className="md:col-span-6 lg:col-span-7">
          <div className="rounded-[var(--radius-panel)] bg-white/[0.03] p-2 ring-1 ring-hairline shadow-[var(--shadow-panel)]">
            <div className="rounded-[var(--radius-panel-inner)] bg-panel p-3 ring-1 ring-hairline sm:p-4">
              <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {DEMO_WORDS.map((w, i) => (
                  <WordTileFace key={w} word={w} revealed={i in DEMO_REVEALED} owner={DEMO_REVEALED[i]} compact />
                ))}
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Clue</p>
                  <p className="font-display text-[26px] font-bold leading-none text-ink">
                    SPACE <span className="tabular text-accent">3</span>
                  </p>
                </div>
                <div className="flex -space-x-8">
                  {DEMO_CARDS.map((c, i) => (
                    <AbilityCardFace key={c.id} def={c} size="mini" tabIndex={-1} aria-hidden style={{ transform: `rotate(${(i - 1) * 6}deg) translateY(${Math.abs(i - 1) * 4}px)` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="border-t border-hairline py-20">
        <h2 className="font-display text-[30px] font-bold tracking-tight text-ink sm:text-[36px]">How a turn plays</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            ['Clue', 'The spymaster gives one word and a number. Nothing else.'],
            ['Draw and decide', 'Operatives get a card each turn. Play one after the clue, or hold it.'],
            ['Guess', 'Tap words. Your agents keep the turn going. The assassin ends the game.'],
          ].map(([title, body]) => (
            <div key={title} className="border-l border-hairline-strong pl-5">
              <h3 className="font-display text-[20px] font-bold text-ink">{title}</h3>
              <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-hairline py-20">
        <div className="grid items-center gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <h2 className="font-display text-[30px] font-bold tracking-tight text-ink sm:text-[36px]">Cards bend the turn. They do not read the key.</h2>
            <p className="mt-4 max-w-[40ch] text-[15px] leading-relaxed text-ink-muted">
              Information costs a guess. Locks last one turn. Every play is announced to the table.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4 md:col-span-7">
            {DEMO_CARDS.map((c) => (
              <AbilityCardFace key={c.id} def={c} tabIndex={-1} />
            ))}
          </div>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline py-8 text-[13px] text-ink-faint">
        <span>Gambit. An original game inspired by word-association party games.</span>
        <Link to="/new" className="text-ink-muted hover:text-ink">
          Create a game
        </Link>
      </footer>
    </main>
  );
};
