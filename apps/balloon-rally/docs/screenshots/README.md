# Screenshots

All files are captured from the real app with Playwright and system Chrome (`channel: 'chrome'`). No mockups, Figma exports, or generated interface images.

## Sizes

| Set | Viewport | Device scale | Pixel file |
| --- | --- | --- | --- |
| Desktop | 1440 × 1000 | 1 | 1440 × 1000 |
| Mobile | 390 × 844 | 2 | 780 × 1688 |

## Files

Each language folder (`en/`, `zh/`) contains:

| File | What it shows |
| --- | --- |
| `home.png` | Home, modes, tagline, badges |
| `setup.png` | Hot-seat setup, player count, seat editor, course preview |
| `game.png` | Real round-2 summary: track, wind cards, supports, points |
| `game-select.png` | Secret support panel with selected balloon and tailwind |
| `game-over.png` | Final ranking breakdown |
| `rules.png` | Five rules, scoring table, controls, family note |
| `stats.png` | Local family record with demo stats |
| `settings.png` | Language, sound, speed, reduced motion |
| `lan-host.png` | Real host lobby: room code, QR, seat status, start button |
| `lan-guest.png` | Real guest join lobby: seat, players, waiting state |
| `game-mobile.png` | 390 px portrait support panel |
| `home-mobile.png` | Bonus: portrait home |

`game.png`, `game-select.png`, and `game-over.png` use deterministic demo states from the real engine:

- `?demo=summary` — two real rounds completed, summary visible.
- `?demo=support` — round 3 support turn.
- `?demo=end` — complete four-round game with a winner.

`lan-host.png` and `lan-guest.png` are captured from a real relay session: the host creates a room, a second browser page joins with the invite, and both lobbies show the same connected seat status. They are not mockups or static QR placeholders.

## Rebuild

```bash
npm run dev           # in one terminal, port 5177
npm run build         # LAN screenshots need dist/
npm run screenshots   # in another; starts a relay on :8090 if needed
```

The script uses `http://localhost:5177` for the app screens and a real relay on `http://localhost:8090` for `lan-host.png` / `lan-guest.png`. Set `BASE_URL`, `LAN_URL`, or `LAN_PORT` to point elsewhere. Set `LANG_CODE=en` or `LANG_CODE=zh` to capture one language only.

## Note on demo stats

The stats screenshot seeds local-only demo numbers into `localStorage` so the table is populated. The game itself records stats only after a real finished rally. The demo states used for game screenshots do **not** write stats or create a Continue card.
