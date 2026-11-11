# Decisions and exceptions

This file records the places where the family-game standard has a `MUST` that is intentionally deferred in this v0.1 vertical slice, plus the rule interpretations that could otherwise be ambiguous.

## Standard clauses and status

| Standard clause | Status | Why | User-visible impact | Plan |
| --- | --- | --- | --- | --- |
| P4 / N1–N10 · three modes including LAN | **Implemented (core)** | LAN host/guest uses the shared `@family-arcade/lan` relay; host-authoritative intents, per-seat filtered views, room code, QR, seat status and reconnect are in. | The LAN card is active. Guests only receive their own hand. | Spectator, UDP discovery and AI takeover are still next milestone. |
| D6 / F1 / F5 · Windows installer | **Shell present, build deferred** | `src-tauri` is configured and kept working; NSIS is built centrally, not in this parallel pass. | README documents the Tauri commands and does not claim a tested installer size. | Central release job + clean-machine test. |
| Q5 · LAN E2E | **Implemented (host + guest + reconnect)** | `scripts/e2e.mjs` starts a real relay, joins a guest, plays a full game, drops/rejoins and rematches. | LAN is tested in Chrome. | Add spectator and wrong-code/timeout cases. |
| X1 · interactive first-run guide | **Implemented, pragmatic** | The tutorial is a three-step modal with real card art. It is not a scripted in-game forced sequence. | Users can skip or replay it from rules/settings. | Optional: add a first-pick coach mark. |
| M5 · replay by re-applying moves | **Partial** | The engine has `replay()` and tests use it. The UI “Review” screen lists stored records instead of animating re-application. | Review is a readable recap, not a timeline scrubber. | Build a replay screen that re-applies `Move[]` snapshots. |

## Rule interpretations

### Sampler

A sampler is **exactly three different leftover dessert types**, one card each, 5 points. If four or more dessert types remain as leftovers, no sampler is scored. This keeps the sampler a deliberate small plate rather than an automatic bonus.

### Same-type sets

A dessert type contributes at most one same-type set per round: quad (12) first, then triple (6), then pair (2). Extra copies are leftovers at 1 point each. This prevents a pile of one dessert from becoming multiple quads.

### Popularity crowns

Crowns are scored once at the end of the third round. For each dessert, the unique player with the most copies earns 6 points if they have at least **6** copies. A tie awards no crown. This is a final race, not a per-round bonus, and it keeps the total in the intended 30–45 band.

### Tie-break

Total score → most crowns → most distinct dessert kinds collected across all rounds → earlier seat order. The seat-order fallback makes the ranking deterministic for tests and UI.

### Deck and rounds

The full 72-card deck is shuffled fresh for each of the three rounds. Unused cards in a round are not in any hand. The same card id may reappear in a later round; invariants only require uniqueness within the current round.

### Privacy

The `view()` function removes other hands and other pending picks. The hot-seat UI uses a per-pick `uncoveredKey` rather than a boolean so the next hand cannot render for a frame after a pick. The cover replaces the whole game surface.

### LAN privacy

The LAN host keeps the full `GameState`; each guest receives `view(state, guestSeat)` only. Guests send pick intents; the host maps the sender to its seat through `@family-arcade/lan`, validates with the pure `apply`, and resends every connected guest's own filtered view. The host never uses `sendAll(view)`. Reconnect reuses the shared client token and the same seat; the host resends `start` and the filtered view.
