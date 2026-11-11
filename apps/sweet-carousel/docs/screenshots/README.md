# Screenshots · Sweet Carousel v0.1

All screenshots are captured from the running React app with Playwright + system Chrome (`channel: 'chrome'`). No mockups, Figma frames or generated UI.

## Desktop

- Viewport: **1440 × 1000**
- Device scale factor: **1**
- Locale: `?lang=en` or `?lang=zh`, fixed seed per run, tutorial disabled with `?tutorial=0`.

| File | What it shows |
| --- | --- |
| `home.png` | Home, real carousel with demo seats, mode cards and feature strip. |
| `setup.png` | Setup with four seats, human/AI toggles and AI level controls. |
| `game.png` | A real three-player game at pick 3/8, with the hand visible after the cover. |
| `game-select.png` | The same state with one card selected and the confirm bar active. |
| `game-over.png` | Final ranking after a complete three-round game. |
| `rules.png` | Five-sentence rules and the full scoring table. |
| `stats.png` | Local stats after the complete game. |
| `settings.png` | Language, sound, speed, reduced motion and local data controls. |
| `lan-host.png` | Real LAN host lobby: room code, QR invite and both seats online. |
| `lan-guest.png` | Real LAN guest lobby after joining: seat, seat status and wait-for-host state. |
| `lan-game.png` | Real LAN game on the host device, with the host hand and both seats. |
| `lan-guest-game.png` | The same LAN game on the guest device; only the guest hand is present. |

## Mobile

- Viewport: **390 × 844**
- Device scale factor: **2** (image is 780 × 1688)
- `game-mobile.png`: real two-player hot-seat game, cover dismissed, hand fan and confirm bar visible.

## Regenerate

```bash
npm run build
npm run dev -- --host 127.0.0.1 --port 5175
# in another terminal (the script also starts its own relay on a free port)
npm run screenshots
```

The script writes both `en/` and `zh/` sets plus `docs/promo/sweet-carousel-poster-{en,zh}.png`. It drives a real game to completion for `game-over` and `stats`, and starts a real LAN relay plus a guest browser for the LAN screenshots; it does not inject fake score data.

## Notes

- The paper texture and gradients make the PNGs relatively large (roughly 0.5–0.8 MB each). They are kept as lossless PNGs; no CDN or remote images are used.
- Desktop images are 1440 × 1000. The mobile image is 780 × 1688 pixels at 2× density.
