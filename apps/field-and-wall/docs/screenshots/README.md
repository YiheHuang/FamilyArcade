# Screenshots

All images are captured from the running Field & Wall app with **Playwright + system Chrome**
(`channel: 'chrome'`). No mockups, Figma frames or generated interfaces.

| Set | Viewport | Device scale | Files |
| --- | --- | --- | --- |
| Desktop EN/ZH | 1440×1000 | 1× | `home`, `setup`, `game`, `game-select`, `game-over`, `rules`, `stats`, `settings` |
| LAN EN/ZH | 1440×1000 | 1× | `lan-host`, `lan-guest`, `lan-game` |
| Phone EN/ZH | 390×844 | 2× | `game-mobile` |

- Gameplay screenshots use `docs/demo-save.{en,zh}.json`, replayed by the real engine from
  a seeded 2-player game (`showcase-1`). The mid-game state has 42 tiles and scores 30 : 37.
- `game-over.png` uses `docs/end-save.{en,zh}.json`, with the final move from
  `docs/demo-info.json`, so the ranking is the engine's real final scoring.
- `stats.png` uses a seeded **local demo history** (9 games, three family names). The stats
  screen and its calculations are real; the history is demo data so the screen is not empty.
- `game-mobile.png` is the same real game at 390×844 @2×.
- `lan-host.png` is a real host lobby with a live QR and one connected guest;
  `lan-guest.png` is that guest's seat view; `lan-game.png` is a real LAN game after one
  host and one guest move. The screenshots use the built app on the test relay port
  **8096** because 8080 may be occupied by another app in the monorepo; the default
  browser relay is still 8080. Capture runs on `127.0.0.1`, so the QR in the image is a
  real encoding of a loopback invite and is not meant to be scanned from a phone; on a
  real LAN, open the host page via its LAN IPv4 so the QR carries a reachable address.
- Language is forced with `?lang=en` / `?lang=zh`; the first-run tutorial is disabled with
  `?tutorial=0` for screenshots.

## Regenerate

```bash
npm run build
npm run dev -- --port 5176
node scripts/shots.mjs
```

`scripts/shots.mjs` writes both languages, uses the real demo saves, and starts a real LAN
relay on 8096 (or `LAN_PORT`) to capture the LAN lobby and game. It kills the relay when
done. The root Family Arcade studio reads the screenshot names from `video.json`.

## File sizes

Desktop PNGs are roughly 600–800 KB because the paper texture and tile art are detailed;
`game-over.png` is ~195 KB because the modal dims the board. The README uses these PNGs
directly. The phone images are 390×844 @2× (780×1688 pixels).
