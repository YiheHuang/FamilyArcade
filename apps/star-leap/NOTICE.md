# Notices and third-party material

This repository is an independent, non-commercial implementation of the traditional
game **Chinese Checkers** for private family play.

## Game and trademarks

- Chinese Checkers is a traditional public-domain game. There is no single publisher or
  rights holder for the rules.
- “Star Leap / 星跃” is an original working title. No third-party game name, logo,
  board art, piece design or rulebook text is included.
- If you enjoy the physical game, buy a nice set from a local maker.

## Art, icons and UI

- All board geometry, marbles, marks, icons, dialogs and screenshots are drawn in code
  (SVG/CSS) in this repository. No third-party art or icon set is bundled.
- The UI uses system font stacks only; no font files are shipped with the app.

## Sound

- The in-app sounds are synthesized at runtime with the Web Audio API (`src/sound.ts`).
- The promo video uses the generated score and sound effects from the **Blokus** family
  project by the same author (MIT-licensed repository), and narration generated with
  Microsoft Edge TTS. See `video/SCRIPT.md`.

## Runtime dependencies

- React, React DOM, Vite, TypeScript, Vitest, Playwright (development only).
- No analytics, no telemetry, no network access at runtime.
- The app runs entirely from local files; no CDN fonts, images or APIs.

## Documentation

The README, rules audit, screenshots and promo stills are shared under
**CC BY 4.0** (<https://creativecommons.org/licenses/by/4.0/>); code is MIT.

## Promo video

- 48 seconds, 1920×1080, 60 fps, H.264/AAC.
- Board data comes from the real TypeScript engine (`src/game`).
- UI stills are captured from the real app with Playwright.
- Every on-screen claim is checked by `video/scripts/facts.ts` → `video/FACTS.md`.
