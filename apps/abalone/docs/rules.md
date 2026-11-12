# Abalone · rule audit

The engine lives in `src/game/abalone.ts` and has no DOM, network, clock or
`Math.random` dependency. Every rule below has engine code, at least one unit test and
a stated edge case.

## Board model

The board is a radius-4 hexagon in axial coordinates `(q, r)`:

```text
r = -4   q 0 … 4     5 points
r = -3   q -1 … 4    6 points
r = -2   q -2 … 4    7 points
r = -1   q -3 … 4    8 points
r =  0   q -4 … 4    9 points
r =  1   q -4 … 3    8 points
r =  2   q -4 … 2    7 points
r =  3   q -4 … 1    6 points
r =  4   q -4 … 0    5 points
```

That is 61 points. The six directions are `E, NE, NW, W, SW, SE`; `NE` is `(+1, -1)`
and `SW` is its opposite. Six directions, not eight, keep pushes symmetric.

## Initial position

Black fills the top two rows (`r ≤ -3`) plus the three leftmost points of `r = -2`.
White fills the bottom two rows (`r ≥ 3`) plus the three rightmost points of `r = 2`.
Each side has 14 marbles. Black moves first.

## Rule table

| # | Rule | Implementation | Test |
| --- | --- | --- | --- |
| R1 | The board is a 61-point hexagon with rows 5-6-7-8-9-8-7-6-5. | `POINTS`, `indexAt()` | “builds a 61-point board…” / “has the standard nine rows…” |
| R2 | Each side begins with 14 marbles. | `setup()` | “builds a 61-point board…” |
| R3 | Black moves first. | `setup('B')` | same |
| R4 | A move is one, two or three contiguous own marbles in a straight line. | `lineOrder()`, `validate()` | “recognises contiguous one-to-three marble lines” |
| R5 | A line of four or more is never a legal selection. | `lineOrder()` length check | “rejects a four-marble line” |
| R6 | A marble may move one step in any of the six directions into an empty point. | `validate()`, `apply()` | “moves one marble in six directions” |
| R7 | A broadside move translates every selected marble one step; all destinations must be empty. | `validate()` broadside branch | “slides a two-marble line broadside…” |
| R8 | A broadside move never pushes; an occupied destination is illegal. | `validate()` broadside branch | “refuses a broadside move into an occupied point” |
| R9 | A broadside move that leaves the board is illegal. | `neighbor()` returns `-1` | “refuses a broadside move that leaves the board” |
| R10 | An in-line move may advance into empty space. | `validate()` forward branch | “advances a line in-line into empty space” |
| R11 | An in-line move may retreat when the point behind the rear marble is empty. | `validate()` backward branch | “retreats a line in-line…” |
| R12 | A retreat is illegal when any marble (own or enemy) is behind the rear. | `validate()` backward branch | “refuses a retreat when another marble is behind the line” |
| R13 | A push is legal only when the moving line is **longer** than the enemy line in front. | `validate()` counts the enemy run | “does not push when the lines are equal” / “refuses a single marble push” / “refuses to push three with three” |
| R14 | Two marbles may push one, and three may push one or two. | `validate()` + `apply()` | “pushes one weaker marble…” / “pushes a two-marble line with three…” |
| R15 | The enemy line may only move into an empty point or off the rim. | `validate()` checks the point behind the run | “refuses to push into a marble behind the opponent” |
| R16 | A push off the rim removes exactly the last enemy marble, even when a two-marble line is pushed. | `apply()` capture loop | “captures exactly one marble when pushing two off the edge” |
| R17 | Captures are credited to the side that pushed, not the side that lost the marble. | `captured[color]` | “counts captures for the side that pushed” |
| R18 | Five captures is not a win; the sixth capture ends the game immediately. | `CAPTURES_TO_WIN`, `apply()` | “does not win at five captures” / “wins on the sixth capture” |
| R19 | A finished game accepts no further moves. | `validate()` game-over guard | “wins on the sixth capture” |
| R20 | Seat 0 is Black, seat 1 is White, and a seat may only move on its own turn. | `colorOfSeat()`, `applySeat()` | “enforces the seat colour” |
| R21 | Each seat receives a view with the public board and its own `canMove`. | `view()` | “gives each seat a view…” |
| R22 | The engine never mutates the previous state. | board/captured copies in `apply()` | “leaves the previous state untouched” |
| R23 | Malformed moves are rejected without throwing. | `validate()` shape checks | “rejects malformed moves” |
| R24 | Only own marbles can be part of a move. | `validate()` colour check | “only moves the side to play” |
| R25 | Every legal move is unique and can be reproduced. | `moveKey()` set in `legalMoves()` | “returns each legal move exactly once” |
| R26 | The hint always returns a legal move, or `null` at game over. | `hintFor()` | “offers only legal moves…” / “returns nothing on a finished game” |
| R27 | Companion and Hard take an immediate winning capture. | `winningMove()` | “takes a winning capture…” |
| R28 | The AI is deterministic when given the same injected RNG. | `chooseMove(state, level, rng)` | “is deterministic with the same injected RNG” |

## The six-in-a-row target

The family brief calls the objective “6-in-a-row”. Standard Abalone implements this
as **six enemy marbles pushed off the board**: the capture counter is the six-pip
race shown on the game screen. A literal line of six own marbles is not used as a
win condition because it is not a standard Abalone rule and the initial formation
already contains six-marble rows.

## Pushing rule, exactly

If the moving line has `m` marbles and the contiguous enemy line in front has `n`:

```text
m > n      push is legal if the point behind the enemy line is empty or off-board
m ≤ n      push is illegal
```

The point behind the enemy line is checked after the whole enemy run. If it is empty,
every enemy marble shifts one step. If it is off the board, the last enemy marble is
removed and the remaining enemy marbles shift. No other marble is removed in a single
move.

## Turn and end state

`apply()` flips the turn after a successful move. The only terminal state is `won`
with `winner = 'B' | 'W'` on the sixth capture. There is no draw rule; see
`docs/limitations.md`.

## LAN authority

`LanHost` owns the canonical `GameState`. The guest sends:

```json
{ "type": "move", "move": { "cells": [12, 6], "dir": "NE" }, "moveCount": 41 }
```

The host rejects stale intents (`moveCount` must match), wrong seats (`applySeat`),
illegal geometry and malformed moves. After every accepted move it sends
`view(state, 1)` to the guest. Abalone is perfect information, so the view contains
the full board, captures, turn and last move — no hidden information is exposed.

## AI

`src/ai/ai.ts` uses:

- **Companion** — immediate win, otherwise a gentle greedy ordering that discounts
  captures and favours connected, central shapes.
- **Easy** — random legal moves with a chance of a greedy reply.
- **Normal** — greedy candidate ordering plus one opponent reply.
- **Hard** — candidate ordering plus two replies (beam width 20 → 12 → 10).

All levels take the same injected `rng` function and never call `Math.random`
internally with a different source.

## Storage keys

| Key | Contents |
| --- | --- |
| `familyarcade.abalone.save` | current solo/hot-seat game, mode and AI level |
| `familyarcade.abalone.record` | games, wins, streak, mode split, eight recent results |
| `familyarcade.abalone.sound` | sound preference |
| `familyarcade.abalone.hostName` | remembered LAN host name |
| `familyarcade.lang` | UI language |
