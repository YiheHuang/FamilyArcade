# NOTICE · Big Two / 大老二

Big Two is a public-domain shedding card game played around the world. This
implementation, its name treatment, copy, visual system, card faces and code are
original work for Family Arcade.

- No third-party card art, photographs, font files, music or audio samples are
  included.
- Every card, table, chip, icon and decorative mark is drawn with CSS/SVG in this
  repository. Card ranks use text and Unicode suit glyphs.
- The browser build uses React, Vite, `qrcode`, Playwright for verification and the
  shared `@family-arcade/lan` package. Each dependency remains under its own
  licence; no dependency assets are redistributed as game art.
- The Tauri shell uses the shared `familyarcade_lan_host` crate and the standard
  WebView2 bootstrapper. No Tauri or Cargo build is produced by this app's checks.
- Sound effects are synthesised at runtime with the Web Audio API; there are no
  sampled instruments.
- The 45-second promo is rendered centrally from `video.json`. Narration, when the
  root studio produces it, is synthetic.
- Code and original assets: MIT. See [LICENSE](LICENSE).
- Trademarks mentioned in general discussion belong to their respective owners.
