# Screenshots

All images here are captured from the real app with Playwright (`scripts/shots.mjs`),
using the system Chrome (`channel: 'chrome'`). Nothing is a mockup. The LAN pair is a
real host lobby plus a real phone page that joined the room over the shared relay; the
guest screenshot includes the live reconnect token, not a staged string.

| File | Viewport | Notes |
| --- | --- | --- |
| `home.png` | 1440×1000 | home with hero board |
| `setup.png` | 1440×1000 | 2-player hot-seat setup |
| `game.png` | 1440×1000 | curated mid-game (64 moves) |
| `game-select.png` | 1440×1000 | a marble selected, legal dots visible |
| `game-over.png` | 1440×1000 | win dialog + ranking |
| `rules.png` | 1440×1000 | five rules + controls |
| `stats.png` | 1440×1000 | demo stats (local data) |
| `settings.png` | 1440×1000 | language / sound / speed |
| `lan-host.png` | 1440×1000 | live host lobby: room code, QR, seat status |
| `lan-guest.png` | 390×844 @2x | real phone guest lobby: seat + reconnect token |
| `home-mobile.png` | 390×844 @2x | phone portrait home |
| `game-mobile.png` | 390×844 @2x | phone portrait game |

`en/` and `zh/` contain the same set in each language. Re-generate:

```bash
npm run build                 # the guest page is the production build on :8080
npm run lan                   # relay on :8080 (needed while shots.mjs runs)
node scripts/shots.mjs
# macOS/Linux:
LANG_CODE=zh node scripts/shots.mjs
# Windows PowerShell:
$env:LANG_CODE="zh"; node scripts/shots.mjs
```

If port 8080 is already occupied by another app, run the relay on another port and
point the dev server at it:

```powershell
$env:VITE_LAN_PORT="8081"; npm run dev
$env:LAN_PORT="8081"; npm run lan          # second terminal
$env:LAN_PORT="8081"; node scripts/shots.mjs
```

The curated mid-game is `docs/demo-state.{en,zh}.json`; the near-win position is
`docs/win-state.json` / `docs/win-state.zh.json` and `docs/win-target.json`.
