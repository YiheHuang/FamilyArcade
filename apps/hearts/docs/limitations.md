# Hearts · known limitations (v0.1)

- **Standard Hearts only.** Four seats, one deck, no partnerships, no Omnibus, no
  "sun" variant and no jokers. Shooting the moon is the 26-point version.
- **Hold on the fourth hand.** The pass cycle is left → right → across → hold, repeated,
  which is the common table rule. The app never asks for a pass on a hold hand.
- **Hot-seat means four humans.** The hot-seat mode is four seats on one device with a
  privacy curtain. Mixed human/computer seats are available in solo and LAN; there is no
  separate "two humans plus two computers on one device" setup.
- **Undo is local only.** Undo and hints pause during LAN play. In hot-seat, undo can be
  triggered from the privacy curtain and returns the device to the previous seat.
- **Autosave is local only.** Solo and hot-seat games autosave. A LAN guest relies on
  the host's current view; closing the guest page is a best-effort rejoin, not a saved
  offline game.
- **LAN is local-subnet IPv4.** There is no cloud relay, matchmaking, spectator mode,
  account system or internet play. The four-digit code is a family convenience, not a
  security boundary. Firewalls must allow the relay port.
- **The host is the authority.** The host device holds the full deal and every hand.
  Only guests are limited to per-seat views. The host validates every intent, but a
  modified host browser is trusted by design.
- **Late LAN join is best effort.** A guest joining after the deal receives the current
  view. If the computer already passed for that seat, the pass stands; a late guest
  cannot retroactively change it.
- **The family record stores seats, not names.** Results keep the winning seat number,
  final scores, mode, level, hands and moon count. Player names are not persisted to
  avoid carrying a phone's name into another device's history.
- **Hard is strong, not perfect.** It uses known voids, sampled hidden hands and a
  one-hand lookahead with a simple policy. It can be beaten and it does not claim to be
  a solved-game engine.
- **No installer was built in this environment.** The Tauri shell, LAN bridge and
  installer configuration are kept working and type-checked; the main arcade build
  produces installers centrally. No `cargo build`/`tauri build` was run here.
- **The promo is a manifest, not a rendered file.** `video.json` contains the eight
  bilingual lines and facts; the root studio renders the 45-second promo. This app does
  not ship a separate Remotion project or poster frames.
- **Reduced motion is a toggle and a media query.** There is no separate "low data" or
  black-and-white theme.
- **Screenshots use generated but legal game states.** Every shot is taken from the
  running app. Long games are seeded through the real engine and resumed, never mocked
  in an image editor.
