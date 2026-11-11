# Triple · rule audit

Every rule has code, a test and an edge case. The engine lives in `src/game/triple.ts`
and has no DOM, clock, network or `Math.random` dependency. The suite has 20 tests:
engine, AI, hint reasons and the family record.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | The board has nine cells and starts empty. | `setup()` | “has nine empty cells and X starts” |
| R2 | X moves first. | `setup('X')` | “alternates turns and rejects occupied cells” |
| R3 | Players alternate X and O. | `apply()` | same |
| R4 | A cell can only be played once. | `apply()` `occupied` | same |
| R5 | A move outside 0–8 is rejected. | `apply()` `bad-cell` | same |
| R6 | Three marks in a row, column or diagonal win. | `winningLine()` | “detects rows, columns and diagonals” |
| R7 | A finished game rejects further moves. | `apply()` `game-over` | “ends on a win and refuses more moves” |
| R8 | A full board with no line is a draw. | `apply()` | “ends in a draw when the board fills” |
| R9 | Seat 0 is X and seat 1 is O. | `applySeat()` | “enforces the seat mark” |
| R10 | A seat may only move on its own turn. | `applySeat()` `wrong-turn` | same |
| R11 | Each seat gets a view with only its own mark and `canMove`. | `view()` | “gives each seat its own public view” |
| R12 | A view reports the last move and move count. | `view()` | “reports the last move, including after a LAN view” |
| R13 | Applying a move never mutates the old state. | `apply()` | “never mutates the state passed into apply” |
| R14 | The AI only returns legal moves. | `chooseMove()` | “only returns legal moves” |
| R15 | Hard and Companion take an immediate win and block an immediate loss. | `chooseMove()` | AI tests |
| R16 | A hint is legal and explains win, block, centre or corner. | `hintFor()` | “Triple hints” |
| R17 | A completed game updates the record once; the host records LAN, the guest never does. | `recordResult()` / `addResult()` | “Triple family record” |

## Scores and record

No score: the first line wins. The family record stores games, X wins, O wins, draws,
the current same-winner run, the best run, a per-mode split and the eight most recent
results in `localStorage`. A guest does not write to the host record; a LAN result is
recorded on the host device only.

## LAN

The host owns the state. The guest receives `view(state, 1)` and may send only
`{type:'place', index, moveCount}`. `applySeat` re-checks the turn, the cell and the
game status on the host; a stale `moveCount`, spoofed intent or occupied cell is
ignored. The four-digit room code doubles as the relay room id, so a guest can join by
typing it without scanning the QR.

If a guest reloads, the reconnect token restores the seat. The host sends a fresh
`start` and `view`, so a late join or refresh lands on the live board. Only the host
gets a **Play again** button; the guest result banner waits for the host.

When the host leaves, it sends a `result {kind:'closed'}` notice before closing the
socket. The guest returns to the join card with an honest message. If the host process
crashes without that notice, the guest can rejoin from the invite URL.

## Hints

Hints use the same perfect Hard search and add a reason derived from the position:
complete a line, block the opponent, take the centre, take a corner, or keep the board
balanced. Hints are available in local and AI games. LAN play disables undo and hints
for both seats so neither side gets an information advantage.
