/**
 * Competitive blind comparison. The rule is deliberately kind: only a single
 * lowest score loses a heart. A tie for lowest is safe for everyone.
 */

export interface CompareOutcome {
  activeBefore: number[];
  scores: number[];
  lowest: number[];
  lowestScore: number | null;
  tiedLowest: boolean;
  losses: number[];
  heartsBefore: number[];
  hearts: number[];
  eliminated: number[];
  activeAfter: number[];
  winner: number | null;
}

export function compareBlind(
  active: readonly number[],
  scores: readonly number[],
  hearts: readonly number[],
): CompareOutcome {
  const activeBefore = active.slice();
  const heartsBefore = hearts.slice();
  const nextHearts = hearts.slice();
  const eligible = activeBefore.filter((seat) => (hearts[seat] ?? 0) > 0);

  if (eligible.length < 2) {
    return {
      activeBefore,
      scores: scores.slice(),
      lowest: [],
      lowestScore: null,
      tiedLowest: false,
      losses: [],
      heartsBefore,
      hearts: nextHearts,
      eliminated: eligible.filter((seat) => (nextHearts[seat] ?? 0) <= 0),
      activeAfter: eligible,
      winner: eligible.length === 1 ? eligible[0] : null,
    };
  }

  const lowestScore = Math.min(...eligible.map((seat) => scores[seat] ?? 0));
  const lowest = eligible.filter((seat) => (scores[seat] ?? 0) === lowestScore);
  const tiedLowest = lowest.length > 1;
  const losses = tiedLowest ? [] : lowest.slice();
  for (const seat of losses) {
    nextHearts[seat] = Math.max(0, (nextHearts[seat] ?? 0) - 1);
  }
  const activeAfter = eligible.filter((seat) => (nextHearts[seat] ?? 0) > 0);
  const eliminated = eligible.filter((seat) => (nextHearts[seat] ?? 0) <= 0);

  return {
    activeBefore,
    scores: scores.slice(),
    lowest,
    lowestScore,
    tiedLowest,
    losses,
    heartsBefore,
    hearts: nextHearts,
    eliminated,
    activeAfter,
    winner: activeAfter.length === 1 ? activeAfter[0] : null,
  };
}

/**
 * Final fallback after the last finale blind: most hearts, then highest
 * cumulative score, then lowest seat. This is only used when the sequence is
 * exhausted with more than one survivor.
 */
export function fallbackWinner(
  active: readonly number[],
  hearts: readonly number[],
  totals: readonly number[],
): number | null {
  const pool = active.filter((seat) => (hearts[seat] ?? 0) > 0);
  if (pool.length === 0) return null;
  return pool.slice().sort(
    (a, b) =>
      (hearts[b] ?? 0) - (hearts[a] ?? 0) ||
      (totals[b] ?? 0) - (totals[a] ?? 0) ||
      a - b,
  )[0];
}
