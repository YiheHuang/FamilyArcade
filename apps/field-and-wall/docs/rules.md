# Rules audit — Field & Wall v0.1

> Rule → code → test → edge case. A rule without a test is not implemented.
> Test file names are relative to `tests/`.

## 1. What the engine knows

A tile has four edges (N/E/S/W), one centre feature, and one of 15 original types.
Rotations are clockwise. City and road features are connected by matching edges; monasteries
sit on one tile and watch their eight neighbours. Field edges only align; they do not score.

| # | Rule | Code | Test | Edge case |
| --- | --- | --- | --- | --- |
| R1 | 2–4 players, each starts with 7 meeples and 0 points. | `src/game/engine.ts` `setup`, `MEEPLES_PER_PLAYER` | `engine.test.ts` “starts with one tile and a full hand” | `playerCount` outside 2–4 throws. |
| R2 | The start tile is placed at the origin, then one tile is drawn and shown to all. | `setup`, `TILE_DATA.startTile` | “starts from the data start tile” (`data.test.ts`) | The start tile consumes one copy of its type; total tile conservation holds. |
| R3 | A tile may be rotated to any of four orientations. | `src/game/tiles.ts` `rotatedEdges`, `Rotation` | “rotates edges clockwise”, “rotates local feature edges and anchors” | Symmetric tiles de-duplicate identical rotations in legal moves. |
| R4 | A placed tile must touch the existing map (first tile is at 0,0). | `placementProblem` | “reports stable error codes” (`not-adjacent`) | `(9,9)` is rejected; the origin is occupied. |
| R5 | Every touching edge must match: city/city, road/road, field/field. | `placementProblem`, `edgeAt` | “names the failing direction when edges do not meet”; data test “every tile type fits beside the start tile” | Error carries `dir`, `mine`, `theirs` and is translated by the UI. |
| R6 | A tile cannot be placed on an occupied cell. | `placementProblem` | “reports stable error codes” (`occupied`) | `tileAt` scans the tile list; no hidden map state. |
| R7 | A tile may be discarded only when no placement exists. | `mustDiscard`, `legalMoves`, `apply` | “produces a discard only when there is no legal placement” | Discarding with a legal placement returns `cannot-discard`. |
| R8 | After placing, the player may put one meeple on a city/road/monastery of that tile. | `meepleChoicesFor`, `apply` | “completes a city… returns the meeple” | `move.meeple` is a local feature index; `null` means no meeple. |
| R9 | A meeple cannot go on a feature already occupied by any meeple. | `apply` (`global.meeples.length`) | `feature-occupied` error path | The check runs after the tile is virtually placed, so merges are included. |
| R10 | A meeple cannot be placed on a feature that is already complete. | `apply` (`global.complete`) | `feature-complete` error path | No wasted meeples on a just-closed feature. |
| R11 | A player cannot place a meeple with no meeples left. | `meepleChoicesFor`, `apply` (`no-meeples`) | `errors.test.ts` “no-meeples” | The UI shows “no meeples — place without one”. |
| R12 | City edges connect into one feature; each tile counts once. | `src/game/features.ts` `analyze`, union-find | “completes a two-tile city”, “counts a tile with two city edges once” | Twin caps on a centre-field tile stay separate until connected. |
| R13 | A city is complete when it has no open city edge. | `features.ts` `complete`, `openDetail` | “leaves an open city incomplete” | A city loop with no open edges is complete. |
| R14 | A completed city scores 2 per distinct tile. | `featurePoints` | “completes a two-tile city and scores 2 per tile” | A 3-tile corner city scores 6, not 8. |
| R15 | Road edges connect into one feature; a road is complete with no open road end. | `analyze`, `featurePoints` | “completes a short two-tile road”, “keeps a road open until every end is matched” | T-junction/crossroads count as one feature; dead ends count one tile. |
| R16 | A completed road scores 1 per distinct tile. | `featurePoints` | “completes a short two-tile road” | A 2-tile road is 2 points. |
| R17 | A monastery is complete when its own cell + all eight neighbours are filled. | `analyze` `surroundingFilled`, `complete` | “needs all eight surrounding tiles” | 7 neighbours = incomplete, 8 = 9 points. |
| R18 | A completed monastery scores 9. | `featurePoints` | “scores a monastery 9 when surrounded” | Complete check is based on the board, not only the new tile. |
| R19 | When a feature closes, the player(s) with the most meeples score it; ties all score. | `majoritySeats` | “awards the meeple majority and returns every meeple” | A 2-vs-1 city gives the full 6 to the majority. |
| R20 | Every meeple on a closed feature returns to its owner. | `removeMeeples` | “completes a city… returns the meeple” | Meeples on other incomplete features stay. |
| R21 | When the bag is empty, final scoring runs. | `endGame`, `finishTurn` | “scores incomplete features at the end”; random simulation asserts `status === 'ended'` | Final scoring fires after the last tile is placed or discarded. |
| R22 | Final: city 1/tile, road 1/tile, monastery 1 + filled neighbours. | `featurePoints(false)` | “scores incomplete features at the end”; monastery test | Meeples stay on the board; majority still applies. |
| R23 | Most points wins; ties compare completed features, then shared win. | `ranking`, `result` | “ranks by score then completed features” | `tiedWinners` is exposed for the UI; rank numbers are shared. |
| R24 | Same seed + same moves = same state, scores and log. | `rngFor`, `setup`, `apply` | “replays the same moves deterministically”; 120 random games | No `Math.random`, `Date.now`, DOM or network in `src/game/`. |
| R25 | Saves carry a version and reject corrupt data. | `serialize`, `deserialize`, `STATE_VERSION` | “round-trips a state and rejects a bad version” | The app save is config + moves and is replayed, not a screenshot. |
| R26 | Tile/meeple conservation is checked after every move. | `invariants` | every random simulation step + AI tests | Total tiles = placed + bag + hand + discarded; meeples = hand + on board. |
| R27 | No farms/farmers in v0.1. | No field feature type; `CenterType`/`FeatureType` | `data.test.ts` feature/local lists | Field edges only match; they never score. |
| R28 | The game always ends for a legal position. | `apply` discard path, `endGame` | 120 random games; AI vs AI test | A tile that fits nowhere can be discarded; the bag then empties. |

## 2. Scoring examples

| Situation | Points |
| --- | --- |
| Two-tile city (two caps), seat 0 has 1 meeple | 4 to seat 0; meeple returns |
| Three-tile city (corner + two caps), seat 0 has 2 meeples, seat 1 has 1 | 6 to seat 0; all meeples return |
| Two-tile road, seat 1 has 1 meeple | 2 to seat 1 |
| Monastery with 8 neighbours, seat 0 | 9 to seat 0 |
| Incomplete 1-tile city at the end, seat 0 | 1 to seat 0; meeple stays |
| Incomplete monastery with 5 neighbours at the end | 6 to the meeple owner |

## 3. Error codes

| Code | Meaning | UI key |
| --- | --- | --- |
| `game-over` | The game is already ended. | `error.game-over` |
| `not-your-turn` | Move seat is not the current seat. | `error.not-your-turn` |
| `bad-seat` / `bad-config` | Invalid seat or setup. | `error.bad-seat` / `error.bad-config` |
| `no-current-tile` | No tile in hand. | `error.no-current-tile` |
| `unknown-tile` | Tile id not in the data set. | `error.unknown-tile` |
| `occupied` | Cell already has a tile. | `error.occupied` |
| `not-adjacent` | No orthogonal neighbour. | `error.not-adjacent` |
| `edge-mismatch` | Edges do not meet (with `dir`, `mine`, `theirs`). | `error.edge-mismatch` |
| `bad-rotation` | Rotation not 0–3. | `error.bad-rotation` |
| `bad-meeple` | Local feature is invalid or a field. | `error.bad-meeple` |
| `no-meeples` | Supply exhausted. | `error.no-meeples` |
| `feature-occupied` | Existing meeple on the merged feature. | `error.feature-occupied` |
| `feature-complete` | Feature already closed. | `error.feature-complete` |
| `cannot-discard` | A legal placement exists. | `error.cannot-discard` |
| `bad-move` | Unknown move kind / non-integer coordinates. | `error.bad-move` |

## 4. Deliberate simplifications

- **No farms/farmers.** Field edges only align; no field majority, no barns.
- **One field type per edge.** A road does not split a field into sub-fields; there is no
  farm scoring to make that distinction matter.
- **Monastery needs the full 8-neighbour square**, diagonal included.
- **Discard** is a house rule for a tile that fits nowhere, so a legal game cannot deadlock.
- **Shared win** when score and completed-feature count both tie; no arbitrary seat tiebreak.

## 5. LAN rules

Field & Wall has no hidden information, so every guest receives the same public `GameView`,
but **only the host mutates state**. Guests send intents; the host validates and applies
them through the same engine.

| # | Rule | Code | Test | Edge case |
| --- | --- | --- | --- | --- |
| L1 | Host creates a room with a 4-digit code and a QR/invite link. | `src/net.ts`, `LanHostScreen`, `startLanServer` | `scripts/lan-e2e.mjs` host create | Browser relay default 8080; `?lanPort=` exists for shared ports. |
| L2 | 2–4 seats; host is seat 0; every seat must be connected before start. | `LanHost.create({maxPlayers})`, `startLanGame` | LAN E2E host+guest; start disabled until 2/2 | A 4-seat room waits for three guests. |
| L3 | Host is authoritative; guests send tile/meeple/discard intents. | `LanHost.onIntent`, `handleHostIntent`, `applyLanMove` | LAN E2E host move + guest move | A guest cannot mutate another seat; the host overrides the seat id. |
| L4 | Guests receive the public view after every applied move. | `broadcastLanViews`, `LanHost.sendView`, `LanGuest.onView` | LAN E2E both boards show 3 tiles | Same view is sent per seat so hidden-info games can switch to a per-seat view later. |
| L5 | Guest reconnect returns the same seat via a stored client token. | `@family-arcade/lan` `clientToken`, `LanHost.peer-join`, `joinGuest` | LAN E2E close guest, reopen invite, join | Host sends the current view on `sync` after reconnect. |
| L6 | Host close/refresh ends the room; guest close leaves the seat offline. | `closeLanHost`, `LanGuest.onClose`/status poll | Manual + LAN E2E disconnect check | No host migration in v0.1. |
| L7 | LAN undo/spectate/pause are out of scope. | `allowUndo={false}`; no spectator UI | UI disabled; `onUndo` toast | Documented in limitations. |

## 6. Data audit

`npm run data:verify` checks:

- `count` = 54, sum of copies = 54, version/source present.
- 15 unique types, 4 valid edges each, valid centre, bilingual names.
- Start tile references a real type and offers city/road/field (so every type can fit
  somewhere beside it).
- Edge balance: 34 city, 56 road, 126 field edge instances.
- Every tile type + rotation has local features and at least one legal fit beside the start.
- 47 distinct rotation signatures (symmetric tiles legitimately repeat).

See `docs/limitations.md` for what is intentionally out of scope.
