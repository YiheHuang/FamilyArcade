export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** time budget per move, ms */
export const DIFFICULTY_BUDGET: Record<Difficulty, number> = {
  easy: 150,
  normal: 500,
  hard: 1500,
};

/** delay band before the AI "thinks", so moves feel natural */
export const AI_MIN_DELAY = 420;
