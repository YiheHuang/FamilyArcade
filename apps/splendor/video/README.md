# Splendor promo

A **54-second**, 1920×1080, 60 fps promo for the Splendor family app, built with
Remotion — **two cuts**: Chinese (`SplendorPromoZH`) and English
(`SplendorPromoEN`).

The board, cards, tokens and scores come from the real engine in
`../packages/engine`; the transactions shown on screen are replayed and checked
by the engine. The UI stills are captured from the real app. The score and the
sound effects are synthesized by scripts here (no third-party audio), and the
narration uses Microsoft Edge's neural male voices.

- Storyboard, design language, narration and build steps: [`SCRIPT.md`](./SCRIPT.md)
- Every on-screen claim and its automated check: [`FACTS.md`](./FACTS.md)
- Outputs: `out/splendor-promo-zh.mp4` and `out/splendor-promo-en.mp4`
  (54.0 s, H.264/AAC, yuv420p, 60 fps)

```bash
npm install
npm run gen        # real game data + synthesized score/SFX + font subsets
npm run voice      # both narrations (needs: python -m pip install edge-tts)
npm run srt        # subtitle sidecars in ../docs/promo
npm run facts      # accuracy gate → FACTS.md
npm run shots      # real UI stills for the video (needs a built client)
npm run stills     # key frames → out/stills/
npm run render     # out/splendor-promo-zh.mp4
npm run render:en  # out/splendor-promo-en.mp4
node scripts/verify.mjs out/splendor-promo-zh.mp4
```

The final audio master is applied with ffmpeg (a gentle 2:1 voice compressor,
+12 dB, a −4 dB limiter) to ≈ −14.6 LUFS / −1.5 dBTP. The exact command is in
`SCRIPT.md`.
