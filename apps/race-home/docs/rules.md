# Race Home · rule audit

`src/game/race-home.ts` is the whole rules engine. It has no DOM, clock, network,
locale or `Math.random` dependency. The die is passed in as `rng: () => number`, so
the same state plus the same RNG always produces the same action.

The board uses a 15×15 Ludo grid: four 6×6 yards, 52 shared ring cells, four
five-square colour lanes and a 3×3 central house. Pawn progress is stored as one
number:

| Value | Meaning |
| --- | --- |
| `-1` | waiting in the colour yard |
| `0..51` | on the shared ring, counted from this colour's start |
| `52..56` | the five colour-lane squares |
| `57` | home, inside the house |

## Rule table

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | 2–4 colours, four pawns each, all in their yards. | `setup()` | “sets up four colours, four pawns each, red to roll” |
| R2 | Red starts; seats take turns clockwise around the active player list. | `setup`, `advanceTurn` | “supports 2–4 players and wraps the first seat” |
| R3 | One die face 1–6, sampled deterministically from the injected RNG. | `roll()` | “rolls every face deterministically from the injected RNG” |
| R4 | A six brings a yard pawn onto its start and grants another roll. | `legalMoves`, `move()` | “brings a pawn out on a six and grants another roll” |
| R5 | Without a six a yard pawn cannot move. | `legalMoves()` | “lets a six leave the yard but not a smaller roll” |
| R6 | Movement is clockwise around the shared 52-cell ring. | `ringCell`, `START_CELL` | “maps every colour to the same 52-cell ring” |
| R7 | Own pawns may stack on one square. | `move()` | “allows own pawns to share a square” |
| R8 | Landing on a ring square with rivals sends every rival there back to its yard. | `move()` capture loop | “captures an opponent on the shared ring…” and “captures stacked rivals…” |
| R9 | Colour-lane pawns cannot be captured. | `move()` ring-only capture | “captures stacked rivals but never a pawn in its own lane” |
| R10 | After the ring, a pawn walks five lane squares before the house. | `LANE_START`, `HOME` | “walks the five colour-lane squares before home” |
| R11 | The house requires an exact roll; overshooting is illegal. | `legalMoves()`, `move()` | “requires an exact roll to enter the house” |
| R12 | If a roll has no legal pawn, the turn passes immediately. | `roll()` pass branch | “passes the turn immediately when no pawn can move” |
| R13 | The first colour with all four pawns home wins; the game ends. | `move()` | “declares a winner only when all four pawns are home” |
| R14 | A finished game rejects further rolls and moves. | `roll()`, `move()` | “declares a winner…” and “rejects out-of-phase…” |
| R15 | A seat may only act for the player whose turn it is. | `rollSeat`, `moveSeat` | “enforces seat ownership on LAN helpers” |
| R16 | State updates are immutable and JSON-safe. | `move()` clones pawn arrays | “does not mutate the state it is given” and “serialises to JSON without losing a game” |
| R17 | A full seeded two-player race always reaches exactly one winner. | engine + AI | “finishes a full two-player game and produces one winner” |

## AI audit

| Level | Behaviour | Test |
| --- | --- | --- |
| Companion | Gentle scoring: a capture is a large penalty, so it looks for a non-capturing move when one is reasonable. It still takes an immediate win. | “lets Hard capture while Companion looks for a gentler move” |
| Easy | Returns a random legal pawn 62% of the time; otherwise a simple greedy pick. | “only returns legal pawn indices for every level” |
| Normal | Greedy progress plus captures, 10% random. | same + capture test |
| Hard | One-ply scoring with immediate progress and the number of rivals that could land on the destination on their next roll. | “prefers finishing a pawn to a small advance”, capture test |
| All | Immediate winning move is always taken. Deterministic for a fixed RNG sequence. Only legal indices are returned. | “takes an immediate winning move on every level”, “is deterministic with the same injected RNG sequence” |

`explainMove()` maps the chosen pawn to one of six hint reasons: finish, capture,
lane, base, safe or advance. The UI shows that reason in a toast.

## LAN audit

| # | Rule | Code |
| --- | --- | --- |
| L1 | The host owns the only `GameState`; a guest gets `view(state, seat)` and no hidden information. | `view()`, `LanHost.sendView` |
| L2 | Guest intents are `{type:'roll'}` or `{type:'pawn', pawn}`; the host rejects stale seats, wrong phases and illegal pawns. | `roll`, `move`, host `onIntent` |
| L3 | Room admission, 4-digit code, reconnect token and max-player checks come from `@family-arcade/lan`. | `LanHost`, `LanGuest`, `newRoomCode` |
| L4 | If a guest disconnects and the turn reaches that seat, the host can skip it without corrupting state. | `skipTurn()`, “skips a disconnected seat for the LAN host” |
| L5 | Views are re-sent on reconnect, and a lobby update keeps seat names in sync. | host `onChange`, guest `onView` / `onPlayers` |

The shared relay is a message bus only. It never sees a move decision; it forwards
intent and view messages. A guest cannot apply a move locally.

## Scores and records

There are no points. Winning is the only result. The family record stores:

- games finished on this device (solo and hot-seat);
- wins by colour;
- solo games, family wins and AI wins;
- the fewest rolls used in a completed race;
- the last winner.

The record lives in `localStorage` under `familyarcade.race-home.record`. LAN games are
deliberately not written to the local record so the host can reset the table freely.

## Test run

```bash
npm test        # 28 tests
npm run check   # tsc + 28 tests + production build
node scripts/e2e.mjs
```

The screenshot generator and Playwright suite use `?seed=` to make dice repeatable.
The engine itself is still pure; the seed helper lives in `App.tsx`, outside
`src/game/`.
