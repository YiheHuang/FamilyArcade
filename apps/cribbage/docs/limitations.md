# Cribbage · known limitations (v0.1)

- **Three/four-player game is cut-throat.** Five cards each, one discard, individual
  scores, crib to the dealer. The standard four-player partnership variant (partners
  opposite, shared score) is not implemented.
- **No five-card two-player variant.** The two-player table is the standard six-card game.
- **No muggins.** Every point is counted automatically; a player cannot steal a point the
  opponent missed. This is a deliberate family-table choice.
- **The cut is automatic.** The engine takes the top card of the stock rather than letting
  the cutter choose a physical position in the deck.
- **Hard is strong, not perfect.** It evaluates hand EV, crib risk and one-ply pegging
  replies from unseen cards; it is not an exhaustive solver and does not read opponents’
  hands. Companion is intentionally gentle.
- **No online matchmaking.** LAN rooms are same-subnet IPv4 only; the host firewall must
  allow the relay. Room codes are four digits and keep honest family members out, not a
  determined attacker.
- **No cloud saves.** The autosave and family record live in this browser/device. A LAN
  result is recorded on the host only; a guest’s device keeps its own local record. The
  record mixes modes, so its seat labels are generic.
- **Browser QR caveat.** A room created in the browser may advertise `localhost`. For a
  phone on the same network, use the desktop build or open the host machine’s LAN IP.
- **No spectator mode or chat.** Every connected seat plays; there is no watching-only
  client.
- **Undo/hints are off in LAN.** Both seats play without take-backs or hints so neither
  side gets an information advantage.
- **No installer built here.** The shared Tauri shell is wired and `npx tauri build
  --bundles nsis` is documented; the main build centre produces the installers.
- **Promo.** The 45-second bilingual promo is rendered by the root studio from `video.json`;
  this app ships the manifest and real screenshots, not a separate Remotion project.

See [`rules.md`](rules.md) for the rule audit and the LAN privacy model.
