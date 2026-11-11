# Codebreak · rule audit

The engine lives in `src/game/codebreak.ts`. It has no DOM, network, clock or
`Math.random` dependency; every random choice takes an injected RNG. The AI in
`src/ai/ai.ts` receives only the public guess/feedback history, never the secret.

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | A code is exactly four pegs from six colours; duplicates are allowed. | `isCode`, `setup` | “accepts only four pegs from the six colours”, “handles duplicate pegs without over-counting” |
| R2 | The setter hides a code and the breaker has ten guesses. | `setup`, `submitSecret`, `maxGuesses` | “starts in the setting phase with an empty board”, “loses after ten legal guesses” |
| R3 | Feedback counts black pegs first, then white pegs; duplicates count once each. | `score` | “gives four black for an exact match”, “gives four white for a reversed code”, “handles duplicate pegs without over-counting” |
| R4 | Four black pegs cracks the code immediately, even on the tenth guess. | `submitGuess` | “ends on four black and refuses more guesses”, “lets a win on the tenth guess beat the guess limit” |
| R5 | Ten guesses without four black means the setter wins. | `submitGuess`, `resultOf` | “loses after ten legal guesses” |
| R6 | A finished round rejects further guesses. | `submitGuess` `game-over` | “ends on four black and refuses more guesses” |
| R7 | Only the setter may set and only the breaker may guess. | `applySeat` | “enforces which seat may set and guess”, “rejects unknown actions” |
| R8 | The breaker’s view hides the secret while playing; the setter sees it; both see it at the end. | `view` | “hides the secret from the breaker while playing”, “reveals the secret to both seats when the round ends” |
| R9 | `canSet` / `canGuess` follow the phase and seat. | `view` | “reports canSet and canGuess for each seat” |
| R10 | The secret is hidden by message shape, not CSS: the breaker view contains `secret: null`. | `view`, LAN `sendView` | same view tests |
| R11 | Views are copies; a UI mutation cannot corrupt the authoritative state. | `view` | “returns copies that cannot mutate the engine state” |
| R12 | A hint reveals one still-hidden peg, spends one hint and rejects further peeks. | `revealPeg` | “reveals one peg and spends one hint”, “can reveal a requested position” |
| R13 | Hints are unavailable during setting or after the round. | `revealPeg` | “does not reveal pegs during the setting phase” |
| R14 | Candidate elimination keeps exactly the codes that reproduce every clue. | `consistentCodes`, `score` | “keeps only codes consistent with every clue” |
| R15 | All 1,296 codes are generated in a stable order. | `allCodes` | “builds all 1296 unique codes in a stable order” |
| R16 | Random setup is deterministic with an injected RNG and always legal. | `randomCode` | “makes deterministic random codes with an injected RNG” |
| R17 | The AI returns legal codes at every level. | `chooseGuess` | “returns a four-peg legal code at every level” |
| R18 | Easy and Normal return codes consistent with every public clue. | `chooseGuess` | “only returns guesses that fit the clues on Easy and Normal” |
| R19 | Hard minimises the worst-case candidate bucket over all 1,296 guesses. | `chooseGuess('hard')` | “keeps Hard guesses consistent with the public clues”, “Hard cracks a fixed secret within six guesses” |
| R20 | AI is deterministic with the same injected RNG; Hard ignores the RNG while candidates remain. | `chooseGuess` | “is deterministic with the same injected RNG”, “ignores the RNG on Hard while candidates remain” |
| R21 | Companion is gentle: it may make a friendly non-optimal probe, but never an illegal code. | `chooseGuess('companion')` | “lets Companion make a friendly non-optimal probe but never an illegal code” |
| R22 | Each clue must shrink the candidate pool, and the AI’s worst case cannot exceed the pool. | `candidateCount` | “narrows the candidate pool after a clue”, “reports a worst-case pool no larger than the candidate count” |
| R23 | A repeated guess is legal and receives the same feedback. | `submitGuess` | “allows the same guess to be repeated” |
| R24 | The same board, level and RNG produce the same move. | `chooseGuess` | “is deterministic with the same injected RNG” |

## Tests

```bash
npm run test
```

43 tests in two files:

- `tests/engine.test.ts` — setup, codes, feedback, turns, limits, seats, hidden
  views, hints, candidate elimination, copy isolation.
- `tests/ai.test.ts` — legality, consistency, determinism, candidate shrinking,
  Hard solving, Normal solving, Easy solving, hint usefulness.

## Record

The family record is aggregate and local:

- `games` — every finished solo or hot-seat round.
- `cracked` / `held` — breaker or setter won.
- `bestGuesses` — fewest guesses in a cracked round.
- `streak` — current consecutive cracks.
- `recent` — the last twelve outcomes.

LAN rounds are intentionally not written to the aggregate record, because two
devices cannot agree on one local record without a sync layer.

## LAN privacy

The host is authoritative. The guest receives `view(state, 1)` only, and the
breaker view is constructed with `secret: null`. Guest intents are re-validated
on the host with `applySeat`, which checks the seat, phase, code shape and guess
limit. When the guest is the setter, the secret must travel to the host to score
guesses; it is never rendered in the host’s breaker UI, but this is application
privacy, not encryption against a technical inspection of devtools. See
[`limitations.md`](limitations.md).
