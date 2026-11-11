# Ladder Run · rule audit

The engine is `src/game/ladder-run.ts`. It is pure TypeScript: no DOM, clock, network
or `Math.random`. Dice come from an injected RNG (`roll(state, rng)`) or an explicit
die (`rollWithDie`). The AI layer uses the same discipline.

`npm run check` runs the TypeScript compiler, **46 unit tests** (`tests/game.test.ts`
and `tests/storage.test.ts`) and the production build.

## Board

10 × 10 squares, numbered 1–100 in a boustrophedon path. 100 is top-left; the start is
off-board at position 0.

| Ladders (bottom → top) | Snakes (head → tail) |
| --- | --- |
| 3 → 22 | 17 → 7 |
| 8 → 30 | 32 → 12 |
| 20 → 41 | 45 → 25 |
| 28 → 55 | 54 → 34 |
| 36 → 44 | 61 → 18 |
| 51 → 67 | 69 → 50 |
| 63 → 81 | 74 → 53 |
| 71 → 90 | 82 → 62 |
| 78 → 98 | 89 → 70 |
| — | 96 → 86 |
| — | 99 → 97 |

No ladder ends on 100, so the exact-roll finish is always required. No transport
destination is another transport start, so there are no surprise chains. 100 is never
a transport start or destination.

## Rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The game seats 2, 3 or 4 players, all at position 0. | `setup()` | “creates a two-player table at the start”, “supports 2, 3 and 4 seats…” |
| R2 | Coral (seat 0) starts; turns pass clockwise (seat order). | `setup()`, `nextTurn()` | “wraps turns around 3 and 4 players” |
| R3 | A turn rolls one fair die, 1–6, from the injected RNG. | `rollDie()`, `roll()` | “maps RNG boundaries to 1..6”, “rolls with an injected RNG” |
| R4 | A roll moves along the numbered path; a plain landing has no transport. | `resolveTile()` | “resolves a plain move without transport” |
| R5 | Landing on a ladder foot climbs to its top; the raw square is recorded. | `resolveTile()`, `LADDERS` | “climbs a ladder and reports the raw square”, “applies ladder transport on the board” |
| R6 | Landing on a snake head slides to its tail. | `resolveTile()`, `SNAKES` | “slides down a snake and reports the raw square” |
| R7 | The exact roll is required to land on 100; overshooting leaves the player in place. | `resolveTile()` | “needs an exact roll to finish”, “stays put on an overshoot and passes the turn” |
| R8 | A ladder to 98 is not a win. | `resolveTile()` | “does not score a ladder to 98 as a win” |
| R9 | The first player to reach 100 wins; the game then rejects moves. | `rollWithDie()` | “ends at exactly 100…”, “refuses moves after the game is won” |
| R10 | A seat may only roll on its own turn; bad seats, dice and finished games are rejected. | `rollWithDie()`, `applySeat()` | “rejects another seat moving out of turn”, “rejects bad seats and bad dice” |
| R11 | Players share squares. There is no capture, block or extra turn. | state model | by construction — no occupancy check exists |
| R12 | Every seat gets a public view with its own `canRoll`. | `view()` | “shows a per-seat public view with canRoll” |
| R13 | Hints show all six faces and mark the kindest one with a reason. | `hint()` | “recommends a ladder when one is in reach”, “recommends the exact finishing roll” |
| R14 | The AI has no decisions; all four levels return the same die for the same RNG. | `chooseRoll()` | “rolls the same die at every level for the same RNG” |
| R15 | Companion cheers every roll; the other levels change commentary only. | `lineForMove()` | “makes Companion cheer every roll”, “changes only the flavour between levels” |
| R16 | A whole game terminates with a winner at 100. | `roll()` | “finishes a two-player game deterministically”, “finishes a four-player game…” |
| R17 | Saves are versioned and validated; broken payloads are rejected. | `isGameState()`, `loadSave()` | “accepts a fresh state and rejects spoofed payloads”, “rejects old or broken saves” |
| R18 | The family record tallies wins by seat, streak and best streak. | `recordResult()` | “records a win, streak and best streak” |

## Board data invariants

`tests/game.test.ts` checks:

- 9 ladders and 11 snakes;
- every start is between 2 and 99;
- ladders always go up, snakes always go down;
- no transport destination is another transport start;
- neither 0 nor 100 is a transport.

## Hints are not strategy

There is no move to choose. `hint()` ranks the six die faces: exact finish first, then
the longest ladder, then a plain safe step, then the least painful snake, then an
overshoot. The UI prints the chosen face and a reason, and explicitly says that the
game has no decision to make.

## AI

Snakes and ladders is a game of luck. The AI never pretends otherwise. It rolls the
same die as a human would; the level selects a commentary line only. Companion always
uses a cheerful line and the UI also shows a Companion note after every player’s roll.
The same injected RNG value produces the same die at all four levels.

## LAN authority

The host owns `GameState`. Each guest receives `view(state, seat)`, which contains only
public board information plus the guest’s own `canRoll`. A guest can only send
`{ type: 'roll' }`; the host checks `state.turn === seat` and `state.status` before
rolling. The shared relay never sees an authoritative result from a guest. A guest who
disconnects on their turn leaves an empty seat; the host may roll for it, and a
reconnected guest receives the current view again.

## Local record

The record stores games, wins per seat colour (four slots), current streak, best streak
and the last winner’s name in `localStorage`. It is updated once per finished local or
hosted game and never sent over LAN. Guests do not write to the host’s record.
