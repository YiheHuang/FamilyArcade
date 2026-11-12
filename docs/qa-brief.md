# QA and polish brief

You are testing and polishing the Family Arcade games. The goal is to **play each
assigned game for real**, find visible UX/layout bugs, and fix them without changing
the rules or redesigning the art direction.

## Scope

- Work only in your assigned `apps/<slug>/` folders.
- Do not edit root files, other apps, `packages/`, `crates/` or `tools/`.
- Do not change game rules, scoring, AI behaviour or LAN protocol. If you find an
  engine bug, report it instead of rewriting the engine.
- Do not run Tauri/cargo builds. The central build agent handles those.

## For each assigned game

1. Read `README.md`, `docs/rules.md` and `docs/limitations.md`.
2. Start its dev server from the app folder (`npm run dev`) on its configured port.
3. Use Playwright (already installed) to play through:
   - solo vs AI: setup, several moves, hint, undo, autosave/reload;
   - hot-seat: privacy cover, both seats, game over;
   - language switch: English and Chinese;
   - rules, record/stats, mobile layout.
4. Capture screenshots at **1440×1000** and **390×844 @2× (780×1688)**. Inspect them
   visually with the image reader. Also inspect the live DOM when useful.
5. Look specifically for:
   - overlapping, clipped or off-screen elements;
   - unreadable small text, poor contrast, cramped tap targets;
   - uneven card/button spacing, misaligned rows, inconsistent border radii;
   - awkward empty states, duplicated labels, explanatory subtitles under headings;
   - Chinese text in the English UI or English prose in the Chinese UI (the language
     switch, card ranks and game/tile names are allowed);
   - mobile hand/card overflow, horizontal scroll, hidden actions;
   - modals that do not fit, focus traps, broken keyboard flow;
   - ugly hover/disabled/selected states.
6. Fix real issues with **small targeted CSS/JSX/copy changes**. Keep the existing
   typography, palette and layout language. Do not add gradients, emoji, stock images,
   extra subtitles or a new visual style.
7. Re-run:
   - `npm run check`
   - `node scripts/e2e.mjs`
   - `node scripts/shots.mjs` (regenerate screenshots if the UI changed)
   - optionally `LAN_PORT=191xx npm run lan:e2e` with a unique port.
8. Stop every dev server / relay you start.

## Priority

- **P0:** blocked flow, unreadable/overlapping UI, mobile action hidden, broken modal.
- **P1:** visibly rough spacing/alignment, clipped labels, wrong language, tiny tap
  target, confusing empty state.
- **P2:** small polish (shadow, hover, line-height). Fix if quick and safe.

Fix P0/P1. Do not spend the whole pass on P2.

## Report

Return:

- the games you played;
- concrete issues found, with the fix for each;
- commands run and exact results;
- screenshots you regenerated;
- any remaining problems you chose not to fix, and why.

Leave changes uncommitted; the central agent will review and commit.
