# Promo outputs

Generated from `video/` with the real engine and real screenshots.

| File | What |
| --- | --- |
| `star-leap-promo-zh.mp4` | 48 s, 1080p60, Chinese narration + burned-in subtitles |
| `star-leap-promo-en.mp4` | 48 s, 1080p60, English narration + burned-in subtitles |
| `star-leap-promo-zh.srt` | Chinese subtitle sidecar |
| `star-leap-promo-en.srt` | English subtitle sidecar |
| `poster-zh.png` | Chinese poster / README video cover |
| `poster-en.png` | English poster / README video cover |

Rebuild:

```bash
cd video
npm install
python -m pip install edge-tts   # only for re-generating narration
npm run gen
npm run facts
npm run render
npm run render:en
npm run master                   # loudness master + posters (needs ffmpeg)
```

See [`../../video/SCRIPT.md`](../../video/SCRIPT.md) and [`../../video/FACTS.md`](../../video/FACTS.md).
