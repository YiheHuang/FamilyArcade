# Triple · known limitations (v0.1)

- **Two players only.** The engine and UI are built around X and O.
- **No online matchmaking.** LAN rooms are local-subnet IPv4 only.
- **No spectator mode.** A second guest gets “room full”.
- **No cloud saves or cloud stats.** The current game and family record live in this
  browser/device. A LAN result is recorded by the host only; the guest device keeps its
  own local record and clearing it affects only that device.
- **Browser QR uses the page host.** In Vite dev the invite may say `localhost`, which a
  phone cannot reach. Use the Tauri build, or open the host machine's LAN IP, for a
  phone on the Wi-Fi.
- **No installer in the browser build.** The Tauri NSIS build is local and unsigned.
- **No 4K or vertical promo.** The shipped promo is 1080p60, 45 seconds, EN/ZH.
- **Hard is perfect.** It is a challenge, not a teaching opponent.
- **Room code is 4 digits.** It keeps honest family members out, not a determined
  attacker on the same LAN.
- **Abrupt host crashes are best effort.** Leaving the room normally sends a close
  notice; if the host process disappears without one, the guest may sit on the waiting
  screen and should rejoin from the invite URL. The shared relay does not currently
  expose a host-close callback to guests.
- **Guest result is host-controlled.** The guest result banner has no restart action by
  design; the host starts the next round.
