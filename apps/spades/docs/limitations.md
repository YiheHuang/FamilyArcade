# Spades · known limitations (v0.1)

- **Four players, fixed 500.** The UI always deals a four-seat, 500-point match. The
  engine accepts another target, but there is no quick-match selector.
- **No online matchmaking.** LAN is IPv4 on the same subnet, host plus up to three
  guests. There is no internet lobby, account system or spectator view.
- **Empty LAN seats are AI.** Two devices can play a mixed table; the host fills every
  unclaimed seat with the chosen AI level. A guest who joins after the deal can take over
  their AI seat; if they disconnect, AI takes it back.
- **Host records LAN matches.** The host device writes the result. A guest keeps its own
  local record and never receives another seat’s hand. Clearing a record affects only that
  device.
- **Hard is honest, not perfect.** It estimates bids, counts played cards and samples
  unseen hands for a deterministic trick simulation. It can still misplay, especially in
  long suits and unusual nil positions.
- **AI never bids blind nil.** AI seats look at their hand before deciding. Blind nil is a
  human option and is available only before the seat has looked.
- **Nil variant.** A nil bidder’s tricks do not count toward the contract and do not
  become bags. This is documented in `docs/rules.md`; other family tables may score nil
  differently.
- **Tie at the target.** If both teams reach 500 in the same round with the same score,
  the match continues for another round. There is no sudden-death shortcut.
- **Undo and hints pause in LAN.** This is intentional to prevent a guest from using the
  host’s search or rewinding a public position. Hot-seat undo rewinds one action and puts
  up the hand cover; pass the device back to the seat that is being restored. Covers are
  family etiquette, not a security boundary against someone determined to peek.
- **Browser QR invites.** In Vite/browser development the invite may use `localhost`,
  which a phone cannot reach. Use the desktop build, open the host machine’s LAN address,
  or run the relay with `npm run lan`.
- **Abrupt host loss.** A normal exit sends a room-closed notice. If the host process
  disappears without it, guests may sit on the waiting screen and should rejoin from the
  invite URL when the host is back.
- **Room code is four digits.** It is a family convenience, not a security boundary
  against a determined attacker on the same network.
- **No installer in this workspace run.** The Tauri shell is kept and type-checked, but
  `cargo build`/`tauri build` are left to the central build. The NSIS installer is
  unsigned and may trigger a SmartScreen warning.
- **No cloud saves or cloud record.** The save and family record are in this browser or
  desktop WebView only.
- **Screenshot fixtures.** The round-summary and match-end screenshots use valid,
  deterministic engine fixtures (`?demo=round` and `?demo=end`); live play is covered by
  the e2e and LAN tests.
- **No 4K or vertical promo cut.** The root studio renders the 45-second promo from
  `video.json`; no separate Remotion project ships here.
