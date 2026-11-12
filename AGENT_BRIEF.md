# Family Arcade · shared build brief for game agents

You are building one game inside the Family Arcade monorepo. The repository must end with
42 polished family games, each playable solo, hot-seat and over LAN, each with a
lightweight Tauri installer and a 45-second bilingual promo.

## Your workspace

- Work **only** in `apps/<your-slug>/`. Do not edit other apps, `packages/lan`,
  `crates/lan-host` or root files unless you find a real shared bug; report it instead.
- The app was scaffolded from the Triple reference (`apps/triple`). Read it first:
  - `src/game/triple.ts` — pure engine pattern
  - `src/ai/ai.ts` — four-level AI pattern
  - `src/App.tsx` — home / setup / game / LAN host / LAN guest / rules
  - `src/net.ts` — Tauri or browser relay detection
  - `src-tauri/` — shared LAN relay shell
  - `scripts/e2e.mjs`, `scripts/shots.mjs`
  - `README.md`, `README.zh-CN.md`, `docs/rules.md`, `video.json`
- `APP_BRIEF.md` contains your game-specific rules and AI notes. Follow it.
- Keep the Rust crate reference exactly `family_arcade_lan_host` (with underscores).
  Do not rename it or use `familyarcade_lan_host`; that breaks the Tauri build.
- Dependencies are already installed. `@family-arcade/lan` is linked from `../../packages/lan`.

## Non-negotiable

1. **Playable and correct.** A full game must finish. Rules in `APP_BRIEF.md` are the
   contract; document any simplification in `docs/limitations.md`.
2. **Pure engine + tests.** `src/game/` must not use DOM, network, clock or
   `Math.random`; inject RNG. At least 20 meaningful unit tests.
3. **Four AI levels.** Companion / Easy / Normal / Hard. All deterministic with an
   injected RNG. Companion should be gentle to children.
4. **Three modes.** Solo vs AI, 2+ hot-seat (number from brief), and LAN host/guest.
   Keep the `LanHost` / `LanGuest` wiring in `App.tsx`; adapt the state/view/intent
   payload to your game. Hidden-information games must send a per-seat view only.
5. **Comforts.** Undo, hint with a reason, autosave/resume, local family record,
   sound toggle, reduced motion, keyboard path, complete zh/en UI, mobile layout.
6. **Real screenshots.** At least 8–10 PNGs in `docs/screenshots/{en,zh}`:
   home, setup, game, game-select/hint, game-over, rules, stats or record, mobile.
   Desktop 1440×1000; mobile 780×1688 (390×844 @2×). No mockups.
7. **Docs.** Bilingual `README.md` / `README.zh-CN.md` with five-second rules,
   screenshots, LAN instructions, Tauri build command and honest limitations.
   `docs/rules.md` rule audit, `docs/limitations.md`, `NOTICE.md`, keep MIT LICENSE.
8. **Video manifest.** Update `video.json`: eight EN/ZH narration lines, facts,
   tagline, accent colour, and the three screenshot names. Do not build a separate
   Remotion project; the root studio renders every game from this manifest.
9. **Tauri shell.** Keep `src-tauri` working. Do not run `cargo build`/`tauri build`
   (the main agent builds all installers centrally). `npx tsc --noEmit` inside the app
   is enough.
10. **No network/assets.** No CDN, remote fonts, downloaded art or third-party samples.

## Verification you must run

```bash
cd apps/<slug>
npm run check                 # tsc + tests + production build
npm run dev                   # in one terminal, assigned port in package.json
node scripts/e2e.mjs          # in another; must print E2E OK
node scripts/shots.mjs        # regenerate screenshots
```

Also test LAN manually with the shared relay:

```bash
npm run build
npm run lan                   # serves dist on :8080
# host page on your dev port; guest page on http://localhost:8080/?lan=...
```

Do not leave dev servers running. Do not install global packages. Do not touch git.

## Timebox

Prioritise in this order: playable game → tests → LAN → screenshots → README →
video manifest. If something cannot be finished, implement the honest fallback and
document it. A complete small game beats an unfinished ambitious one.

Report: commands run, test count, E2E result, screenshot paths, LAN status, and any
known gap.
