# Idiom Chain · 成语接龙

Chinese idiom chain for 2–6 players. 2–6 players.

Read `docs/next-11.md` section 10 for the complete rule contract, and
`AGENT_BRIEF.md` for the shared delivery contract. Implement the real rules, not a
simplified variant. Where the source rules leave a family-table choice, make it an
explicit option and document it.

AI focus: dictionary search by first character, difficulty by idiom frequency and length.

Non-negotiables:

- Pure engine in `src/game/` with injected RNG; at least 25 meaningful tests.
- Four AI levels: Companion, Easy, Normal, Hard.
- Solo against AI, hot-seat with privacy, and LAN host/guest with per-seat views.
- Undo, reasoned hint, autosave/resume, family record, sound toggle, reduced motion,
  keyboard path and mobile layout.
- Separate English and Chinese UI. The English UI may contain Chinese only on the
  language switch; the Chinese UI may contain English only on the switch and
  technical card/tile names.
- No explanatory subtitle under headings. Keep the screens clean.
- Real screenshots in `docs/screenshots/{en,zh}` (1440×1000 desktop, 780×1688
  mobile), bilingual README files, `docs/rules.md`, `docs/limitations.md`,
  `NOTICE.md` and `video.json`.
- LAN E2E must use `LAN_PORT=19025` (or a free port) and stop its relay afterwards.
- Keep the shared `family_arcade_lan_host` crate name in `src-tauri/src/main.rs`.
- Do not run Tauri/cargo builds, and do not edit other apps or root files.
