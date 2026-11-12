# Nanchang Mahjong · known limitations and table options

This is a complete, playable family implementation of Nanchang Mahjong. It is honest
about the places where Nanchang tables differ.

## Table options not enabled

These are real family-table choices. They are **not** hidden or silently approximated;
they are simply not part of this release.

| Option | What some tables do | This app |
| --- | --- | --- |
| 抄庄 (copy-dealer) | If the dealer's first discard is copied/followed by all three players, the copiers pay a fixed 5-point penalty. | Not enabled. The dealer's first discard is an ordinary discard. |
| 下翻 (bottom-flip) | The other tile in the flipped dead-wall stack scores like an extra spirit. | Not enabled. Only the flipped indicator and the true/secondary types are used. |
| 连庄 (dealer continuation) | The dealer stays for another hand after winning or after a drawn hand. | The dealer rotates clockwise every hand. |
| 弃先胡后 | After passing on a winning discard, a player may not win on a later discard in the same round unless the score changes. | Not enforced. A player may pass and win later. |
| 一炮多响 | More than one player may win on the same discard. | One winner: the highest-priority claim seat, nearest first. |
| 精杠 variants | Some tables pay a fixed 10 from all three players for a spirit kong; others pay only the discarder. | The spirit kong is 10 kong points and is settled pairwise with the other kong/spirit points. |
| 花牌 | Some families add flowers. | No flowers, exactly 136 tiles. |
| Minimum fan | Some tables require a minimum fan before a win counts. | Every recognised win counts. |
| 臭庄 payment | Some tables charge the dealer when the wall runs out. | A drawn hand settles spirit and kong points but has no hand payment. |

## Deliberate scoring choices

- **Dealer ×2** applies to the dealer side. If the dealer wins, every payment doubles. If
  the dealer is a payer, that payer's payment doubles. It does not double spirit or kong
  differentials.
- **Kong draw** stacks with self-draw (×4 × ×2 = ×8). A family that treats kong draw as
  a replacement for self-draw can halve this by changing `scoreHand`.
- **German-in-German** replaces German ×2+5 with ×4+5 rather than stacking them.
- **German** applies when no spirit acts as a wildcard. A spirit that is used as its own
  natural tile does not cancel German.
- **Spirit single-wait** requires a self-drawn winning spirit that fills the pair wait.
  A discard win on a spirit is not a spirit single-wait.
- **Big Seven Pairs** is concealed-only. An exposed all-triplet hand is scored as Basic.
  This keeps the pattern distinct from a normal four-triplet hand.
- **Seven-Star** honours must be genuine non-spirit tiles. A spirit may fill a number
  slot, but may not stand in for one of the seven honours.
- **Thirteen Scattered** uses a minimum gap of three ranks (difference ≥3) inside each
  suit, and all honours must be distinct. It allows five, six or seven honours; the
  remaining slots are spaced numbers.
- **Spirit/kong settlement** is pairwise, so a player with more spirit or kong points
  collects the difference from each other player. This can produce large swings.
- **Spirit sprint** is `spiritPoints × (spiritPoints − 3)` for 5–10 points. It stacks
  with overlord ×2.
- **Match target** is 100 points. If two players tie at or above 100 after a hand, the
  match continues.
- **Claim order** is win > kong > peng > chi, then nearest seat. A player may decline a
  win; the next claimant is asked.

## Modes and connectivity

- **LAN is local-subnet IPv4.** The shared relay is a family-LAN bridge, not an internet
  service. There is no matchmaking, account or cloud save.
- **Four-digit room code.** It keeps honest family members out, not a determined attacker
  on the same network.
- **No spectator seat.** The host plus three guests fill the four seats. Empty seats are
  filled by AI when the host starts.
- **Reconnect** uses the shared client token. A guest who reloads can reclaim the same
  seat while the room is open. A guest who disconnects mid-hand is taken over by the AI
  on the host.
- **Autosave and undo are local-only.** LAN guests cannot undo. The host is authoritative;
  the host's UI does not undo across the network because that would desync the guests.
- **LAN results** are recorded on the host device only.
- **No Tauri installer is built in this workspace.** The shared shell and
  `src-tauri/tauri.conf.json` are kept; the central build agent produces installers.
- **No 4K or vertical promo.** `video.json` is the manifest; the root studio renders the
  promo. The app ships real desktop and mobile screenshots.

## AI

The four AI levels are heuristic, not exhaustive:

- Companion is deliberately gentle and may pass good claims or pick a random discard.
- Easy makes mistakes and does not defend.
- Normal uses exact tenpai waits and light danger.
- Hard uses exact waits, wild-tile efficiency, Thirteen Scattered potential, spirit
  counting and safe-tile defence.

The AI never looks at hidden hands. It does not claim to be a tournament engine. It is
deterministic with the injected RNG.

## UI and accessibility

- Tiles are CSS/DOM, not 3D meshes. There are no remote fonts or downloaded art.
- Sound is synthesised with WebAudio and can be turned off.
- Reduced motion is available as a toggle and respects `prefers-reduced-motion`.
- The keyboard path is: arrow keys select, Enter discards, D draws, W wins, K opens
  kongs, H hints, U undoes, Esc returns home.
- The hot-seat privacy curtain covers the whole table until the device is passed and the
  next player taps “Show my hand”.
- The English and Chinese UIs are separate dictionaries. The language switch and tile
  faces are the only intentional cross-language surfaces.
- Mobile screenshots are 780×1688 (390×844 at 2×). The hand scrolls horizontally when a
  full 14-tile hand does not fit.

## Not implemented

- No flowers, no bonus tiles, no 下翻, no 抄庄, no 连庄, no 弃先胡后.
- No multi-round tournament structure beyond the 100-point match.
- No hand-history replay or exported logs.
- No online leaderboard or accounts.
- No Tauri/cargo build in this workspace.
