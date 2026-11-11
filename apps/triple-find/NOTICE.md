# NOTICE · Triple Find / 三连找

Triple Find is an original, non-commercial family game made for Family Arcade. The
“find three cards where every attribute is all-same or all-different” mechanic is
a public-domain combinatorial pattern game. This implementation, its card art,
names, copy, visual design and code are original.

- **No affiliation.** “Set” is a registered trademark of Set Enterprises, Inc.
  Triple Find is not affiliated with, endorsed by or licensed by Set Enterprises.
  No Set-branded art, card text or rulebook text is included.
- **No third-party assets.** All cards, shapes, patterns, icons and the logo are
  drawn with SVG/CSS for this project. No remote fonts, CDN assets, downloaded art,
  bitmap card faces or third-party audio samples are included.
- **Sound** is synthesized at runtime with the Web Audio API. The promo studio may
  add synthetic narration from the `video.json` manifest; no audio recording or
  music sample is shipped in this app.
- **LAN shell.** The Tauri shell and browser relay use the shared Family Arcade
  `family-arcade-lan-host` / `@family-arcade/lan` code from this repository. The relay is a
  message bus; the game host remains authoritative.
- **License.** Original code and assets are MIT. See [LICENSE](LICENSE).
- Trademarks mentioned in general discussion belong to their respective owners.
