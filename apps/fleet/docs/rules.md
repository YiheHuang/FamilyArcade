# Fleet · rule audit

The rules in `APP_BRIEF.md` are implemented in `src/game/fleet.ts` (pure TypeScript,
no DOM, network, clock or `Math.random`). The AI lives in `src/ai/ai.ts` and receives
only a per-seat `SeatView`. Unit tests live in `tests/game.test.ts`.

## The contract

- **Chart.** 10×10, coordinates A1–J10 in row-major order (cell `0` is A1).
- **Fleet per captain.** Carrier 5, battleship 4, cruiser 3, submarine 3, destroyer 2
  (17 hull cells).
- **Placement.** Straight horizontal or vertical; inside the chart; ships may touch but
  never overlap. Each hull appears once. Both fleets must be complete and ready before
  play begins. Seat 0 fires first.
- **Turns.** One shot per turn. **A hit does not earn another shot**; the turn always
  passes to the opponent.
- **Feedback.** Miss, hit, and sunk are immediate. The hit square is public; the identity
  of a live hull is not. A hull's cells are revealed only when it sinks (and both fleets
  are revealed when the battle ends).
- **Win.** Sink all five enemy hulls. There is no draw and no score.

## Audit table

| # | Rule | Code | Test(s) |
| --- | --- | --- | --- |
| R1 | A new game is an empty 10×10 chart in the placing phase. | `setup()` | “starts on an empty 10x10 chart…” |
| R2 | The five hull lengths are 5/4/3/3/2. | `FLEET` | “uses the five classic hull lengths” |
| R3 | Hulls lie straight, inside the chart, and overflow is rejected. | `shipCells()`, `placeShip()` | “computes horizontal and vertical cells…”, “rejects a hull that runs off the chart” |
| R4 | Hulls may touch but not overlap. | `placeShip()` `occupied` | “rejects overlapping hulls”, “allows ships to touch…” |
| R5 | Each hull appears at most once. | `placeShip()` `already-placed` | “rejects a second copy of the same hull” |
| R6 | A captain can only be ready with all five hulls. | `readyUp()`, `fleetComplete()` | “requires all five hulls before a captain can be ready” |
| R7 | Play starts only when both captains are ready, with seat 0 to fire. | `readyUp()` | “starts play only when both captains are ready” |
| R8 | Clear/lift only during placement. | `clearFleet()`, `removeShip()` | “allows ships to touch and clears a fleet…”, “locks the dock once the battle starts” |
| R9 | Auto-placement is a complete, non-overlapping fleet and is deterministic for an injected RNG. | `randomFleet()`, `autoPlace()` | “builds a deterministic, legal random fleet” |
| R10 | A malformed or overlapping submitted fleet is rejected. | `placeFleet()` | “rejects malformed fleets…” |
| R11 | Coordinates are labelled A1–J10. | `coordLabel()` | “labels coordinates from A1 to J10” |
| R12 | Firing is allowed only during play, on the turn, inside the chart, at an unshot cell. | `fire()` | “rejects a shot out of order, out of bounds…”, “rejects a shot on the same square twice” |
| R13 | A miss is recorded and the turn passes. | `fire()` | “records a miss and hands the turn over” |
| R14 | A hit is recorded without revealing the live hull. | `fire()`, `view()` | “records a hit without revealing the hull” |
| R15 | A hull is sunk when every one of its cells is hit. | `isShipSunk()` | “marks a hull sunk when every cell is hit” |
| R16 | The whole fleet must sink before the battle ends; later shots are rejected. | `isFleetSunk()`, `fire()` | “finishes only when the entire fleet is sunk” |
| R17 | Each seat receives a view with its own hulls, its own shot results, the enemy roster and no live enemy hulls. | `view()` | “hides live enemy hulls…”, “gives each seat a different view” |
| R18 | Sunk enemy hulls and their cells are revealed; both fleets are revealed at the end. | `view()` | “marks a hull sunk…”, “finishes only…” |
| R19 | `lastMove` masks the identity of a hull that is only hit, so a per-seat payload cannot leak it. | `view()` | “hides live enemy hulls…” |
| R20 | Every AI level returns an unshot cell. | `chooseShot()` | “always returns an unshot cell on every level” |
| R21 | AI is deterministic for a given view and RNG. | `chooseShot(view, level, rng)` | “is deterministic for a given injected RNG” |
| R22 | Normal extends a line of hits before returning to the hunt. | `lineExtensions()` | “normal extends a line of hits…” |
| R23 | Hard never targets known misses or sunk cells and concentrates around an unresolved hit. | `densityScores()` | “hard never fires at a known miss…”, “hard concentrates around an unresolved hit” |
| R24 | Companion stays legal and gentle, including a loose sweep near its own misses. | `chooseShot()` companion branch | “companion is gentle but legal…” |
| R25 | Hints are legal, deterministic and carry a reason. | `hint()` | “hints a legal target and explains why” |
| R26 | With every enemy square shot there is no AI move. | `chooseShot()` | “returns -1 only when every enemy square is already shot” |

## Turn order and choices

The brief says players alternate shots. Fleet therefore implements **one shot per turn
even on a hit**. This is a deliberate, documented variant: it keeps matches moving and
matches the common family rules. “Salvo” or “hit again” variants are not implemented.

Players may place ships edge-to-edge (touching) because the brief only forbids overlap.
There is no diagonal placement, no ship rotation during play, and no draw.

## Information model

The full `GameState` contains both boards. `view(state, seat)` returns only:

- the seat's own hulls (with sunk flags and cells);
- shots the opponent fired at the seat (`ownBoardShots`);
- shots the seat fired at the opponent (`enemyBoardShots`);
- the enemy roster (id, length, sunk) but **not** live enemy cells;
- cells of sunk enemy hulls; every enemy hull once the phase is `finished`;
- turn, phase, ready flags, winner, move count and a masked `lastMove`.

The AI signature is `chooseShot(view, level, rng)`. It cannot reach the full state, so
Hard cannot cheat. Tests confirm the enemy payload contains no live hulls.

## LAN

`LanHost` owns the authoritative `GameState`. Guest intents are `place`, `lift`, `clear`,
`auto`, `ready` and `fire`; each is checked against the guest's server-assigned seat.
After every accepted intent the host sends only `view(state, 1)` to the guest. When a
game ends, the host also sends the same per-seat view as the result. The host UI renders
`view(state, 0)`.

The browser relay is a dumb WebSocket bus; it forwards messages but never receives a
full state. Verified with `scripts/lan-check.mjs`: two real pages, hidden enemy hull counts
of zero on both sides, and a per-seat turn exchange.

## Record and persistence

The family logbook stores finished local games: total games, seat-0 wins, seat-1 wins,
solo games, solo wins, current win streak and last winner. Solo/hot-seat games autosave
to `localStorage` after every accepted action and clear the save when the battle ends.
LAN games are not written to the family logbook and do not autosave.
