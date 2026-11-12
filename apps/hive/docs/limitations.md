# Hive · known limitations (v0.1)

- **Base set only.** No Mosquito, Ladybug, Pillbug or other expansions. The five base
  pieces and 22-piece set are complete.
- **Two players only.** Solo is against the computer; there is no team or spectator seat.
- **No online matchmaking.** LAN rooms are local-subnet IPv4 only. No TLS, accounts or
  internet relay.
- **No cloud saves or cloud stats.** The current game and family record live in this
  browser/device. A LAN result is recorded by the host only; the guest device keeps its
  own local record and clearing it affects only that device.
- **Browser QR uses the page host.** In Vite dev the invite may say `localhost`, which a
  phone cannot reach. Use the Tauri build, or open the host machine’s LAN IP, for a phone
  on the network.
- **No installer was built during this task.** The shared Tauri shell is kept and
  configured; the main agent builds all installers centrally. `npx tauri build --bundles
  nsis` is the documented command.
- **No 4K or vertical promo.** `video.json` is the manifest; the root studio renders the
  45-second EN/ZH promo.
- **Hard is strong, not perfect.** It uses a three-ply ordered search with a bounded beam
  and a one-move safety filter. It is not a solved-game tablebase.
- **Pass and shut-outs.** A player with no legal placement or move must pass. If both
  sides are shut out in succession, the game is recorded as a draw. Repetition is not
  automatically adjudicated; base Hive has no repetition draw rule.
- **Rare queen-deadline fallback.** If a player reaches their fourth turn without a queen
  and literally no legal queen placement exists, the engine continues with other legal
  moves rather than deadlocking. This position is extraordinarily rare but is a deliberate
  deviation from a strict reading of the rulebook.
- **Room code is four digits.** It keeps honest family members out, not a determined
  attacker on the same network.
- **Abrupt host crashes are best effort.** Leaving the room normally sends a close notice;
  if the host process disappears without one, the guest may sit on the waiting screen and
  should rejoin from the invite URL. The shared relay does not expose a host-close callback
  to guests.
- **Guest result is host-controlled.** The guest result banner has no restart action by
  design; the host starts the next round.
- **Sound is synthesised Web Audio.** There is no music track or recorded voice in the app.
