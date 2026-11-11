import type { GuessView, Peg } from '../game/codebreak';
import type { MessageKey } from '../i18n';
import { CodeRow, FeedbackDots } from './Pegs';

export function GuessBoard({
  guesses,
  maxGuesses,
  draft,
  canGuess,
  onDraftSlot,
  tr,
}: {
  guesses: readonly GuessView[];
  maxGuesses: number;
  draft: readonly (Peg | null)[];
  canGuess: boolean;
  onDraftSlot: (index: number) => void;
  tr: (key: MessageKey, params?: Record<string, string | number>) => string;
}) {
  const activeRow = canGuess ? guesses.length : -1;
  return (
    <div className="guess-board" aria-label={tr('boardLabel')}>
      <div className="guess-head" aria-hidden="true">
        <span>{tr('row')}</span>
        <span>{tr('guess')}</span>
        <span>{tr('clues')}</span>
      </div>
      {Array.from({ length: maxGuesses }, (_, index) => {
        const guess = guesses[index];
        const active = index === activeRow;
        const future = !guess && !active;
        const rowNumber = String(index + 1).padStart(2, '0');
        const feedbackLabel = guess
          ? tr('feedbackAria', {
              black: guess.feedback.black,
              white: guess.feedback.white,
            })
          : tr('noClues');
        return (
          <div
            key={index}
            className={`guess-row ${guess ? 'done' : ''} ${active ? 'active' : ''} ${future ? 'future' : ''}`}
          >
            <span className="row-no">{rowNumber}</span>
            {guess ? (
              <CodeRow code={guess.code} tr={tr} />
            ) : active ? (
              <CodeRow code={draft} tr={tr} onSlot={onDraftSlot} />
            ) : (
              <CodeRow code={[null, null, null, null]} tr={tr} />
            )}
            <span className="clue-cell">
              {guess ? (
                <>
                  <FeedbackDots feedback={guess.feedback} ariaLabel={feedbackLabel} compact />
                  <span className="clue-count" aria-hidden="true">
                    {tr('clueCount', {
                      black: guess.feedback.black,
                      white: guess.feedback.white,
                    })}
                  </span>
                </>
              ) : (
                <span className="clue-placeholder" aria-label={feedbackLabel}>
                  · · · ·
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
