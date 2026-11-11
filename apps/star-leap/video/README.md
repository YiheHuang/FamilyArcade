# Star Leap promo

A 48-second, 1920×1080, 60 fps promo for the Star Leap family app, built with Remotion
— two cuts: Chinese (`StarLeapPromoZH`) and English (`StarLeapPromoEN`).

The board, marbles, home counts and the 64-move game come from the real engine in
`../src`; every on-screen claim is checked in [`FACTS.md`](./FACTS.md). The score and
SFX come from the Blokus family project; narration uses Microsoft Edge TTS.

- Storyboard, copy and build steps: [`SCRIPT.md`](./SCRIPT.md)
- Outputs: `out/star-leap-promo-zh.mp4`, `out/star-leap-promo-en.mp4`
- README assets: `../docs/promo/star-leap-promo-{zh,en}.mp4`,
  `poster-{zh,en}.png`, `star-leap-promo-{zh,en}.srt`

```bash
npm install
python -m pip install edge-tts   # only for re-generating narration
npm run gen        # engine data + voice + SRT
npm run facts      # accuracy gate
npm run render     # Chinese cut
npm run render:en  # English cut
npm run master     # loudness master + posters -> ../docs/promo (needs ffmpeg)
# or: npm run release
```
