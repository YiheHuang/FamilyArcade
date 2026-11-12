# Go · known limitations (v0.1)

- **Simple ko only.** The engine blocks an immediate recapture of a single stone. There
  is no superko, triple-ko or positional-repeat rule.
- **Area scoring as the board stands.** Stones on the board plus empty points surrounded
  by one colour. Dead stones are not marked or removed, so a dead stone left on the board
  still counts one point. Empty regions touching both colours are neutral; dame are not
  filled or awarded.
- **No resignation, handicap or clocks.** Games end with two consecutive passes. Komi is
  chosen from 6.5 or 7.5; there is no bidding or Japanese/Chinese rule-set switch.
- **Suicide is forbidden.** A move that leaves its own group with no liberties is
  rejected unless it captures first.
- **The AI is heuristic.** Companion, Easy, Normal and Hard share a liberty/atari/
  influence/capture shortlist. Normal uses 8 playouts on 19×19 (12 on 9×9/13×13); Hard
  uses 24 on 19×19 (36 on smaller boards). Hard is a good family challenge, not a
  dan-level opponent. Bounded playouts trade strength for a responsive table.
- **Companion is gentle, not a teacher.** It avoids big captures and filling eyes, so it
  can leave strong moves on the table. That is intentional for children, but it is not a
  Go tutor.
- **LAN is local-network IPv4.** The Tauri build or `npm run lan` hosts a relay on port
  8080. Guests need the host’s firewall to allow the app. There is no cloud matchmaking,
  spectator seat or public room browser.
- **LAN games are not duplicated on the guest record.** The host writes the result to its
  local family record; the guest device keeps its own local record and cannot undo a LAN
  move or ask for a hint. The host controls the next game.
- **The LAN host is in memory.** Reloading or closing the host tab ends the room. A guest
  refresh can rejoin because the relay keeps the seat token; a host refresh cannot restore
  the unfinished LAN board. The guest is told the room closed and can rejoin from the
  invite when a new host room is open.
- **iPhone-size 19×19 targets are tight.** The full 19×19 board is playable on a phone,
  but individual intersections are small; 9×9 and 13×13 are the comfortable phone
  boards. No zoom or coordinate-entry mode is provided.
- **Autosave undo depth is bounded.** The in-session history is complete, but a reload
  restores only the last 120 positions from the autosave.
- **Installer is unsigned.** The Tauri NSIS build is a local family build and may trigger
  Windows SmartScreen. It has not been built in this workspace.
- **No separate promo render in this app.** `video.json` is the manifest; the root studio
  renders the 45-second EN/ZH promo. This app ships neither a Remotion project nor a
  downloaded video.
- **Screenshots are real.** They are captured by `scripts/shots.mjs` at 1440×1000 and
  780×1688 (390×844 @2×). The finished positions are replayed through the app’s own UI
  and engine.
