# Gambit web: design notes

## Design read

Reading this as: a real-time multiplayer tabletop game UI for friend groups on laptops and phones, with a tactile night-table language, built on native CSS + Tailwind v4 + Motion. No component design system applies to a game board; the aesthetic is labeled honestly as "dark tabletop", not glassmorphism.

The `design-taste-frontend` skill marks realtime collaboration and dense product UI as out of scope, so on the game screen only its typography, colour, motion, accessibility and "AI tell" rules are applied. Its full landing-page rules apply to `/`.

## Dials

- `DESIGN_VARIANCE: 6` on the landing page, `5` in the game (legibility first).
- `MOTION_INTENSITY: 6`. Every animation communicates a state change and collapses under `prefers-reduced-motion`.
- `VISUAL_DENSITY: 4` on the landing page, `6` in the game. All counts use the mono face.

## Tokens (`src/shared/tokens/tokens.css`)

- Surfaces: table `#0e1013`, panel `#151820`, raised `#1b1f29`. No pure black or white anywhere. Light theme mirrors with warm off-whites.
- Team colours are semantic: Ember `#d9683a`, Tide `#2f6fc4`. The one UI accent is gold `#d1a955` (light: `#a8842e`).
- Type: Cabinet Grotesk (display), Satoshi (UI), JetBrains Mono (numbers). Self-hosted woff2 in `public/fonts`.
- Shape lock: tiles 12px, cards 16px with 10px inner core, panels 20px with 14px inner core, inputs 10px, buttons pill.
- Shadows tinted to the table colour; hairlines at 8 to 16 percent white.
- Motion: `--ease-out-expo` and `--ease-tabletop` curves; springs 260/24 for cards. No `linear`, no `ease-in-out`.
- Z-index scale in `src/shared/tokens/z-index.ts`.

## Motion, each with its reason

| Moment | Motion | Communicates |
|---|---|---|
| Card drawn | slides in from the deck side, settles with a spring | a new resource arrived |
| Card played | lifts out of the fan and fades | the card left your hand |
| Word revealed | 3D flip to the owner colour | a physical card turned over |
| Turn handoff | team-colour band crosses the screen for 1.5 s | control changed hands |
| Clue given | clue text scales in | the turn's key fact is now fixed |
| Assassin | dark full-screen wash with the skull | the game is over, badly |
| Targeting | gold dashed rings on valid tiles, others dim | where you may act |
| Pending guess | tile pulses until the server answers | the action is in flight |
| Word marked | name badge appears on the tile for everyone; green reveal control springs in for active operatives | the team is considering this word; the second step is deliberate |

## Pre-flight (tick before calling a screen done)

- [ ] Zero em-dashes or en-dashes in visible UI strings.
- [ ] No emojis in code or copy.
- [ ] No Inter, Roboto, Arial or Helvetica as chosen faces.
- [ ] Icons from Phosphor only; no hand-rolled SVG paths.
- [ ] One theme per page; both themes checked.
- [ ] Button text passes WCAG AA against its background.
- [ ] Labels above inputs; errors below; no placeholder-as-label.
- [ ] `min-h-[100dvh]`, never `h-screen`.
- [ ] No `window.addEventListener('scroll')`.
- [ ] Reduced motion collapses every animation.
- [ ] No decorative status dots; the only dots convey team or connection state.
