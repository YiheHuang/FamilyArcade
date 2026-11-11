import type { Feedback, Peg } from '../game/codebreak';
import type { MessageKey } from '../i18n';

export const PEG_LABEL: Record<Peg, MessageKey> = {
  red: 'colorRed',
  yellow: 'colorYellow',
  green: 'colorGreen',
  blue: 'colorBlue',
  purple: 'colorPurple',
  orange: 'colorOrange',
};

export function PegDot({
  color,
  hidden = false,
  small = false,
  empty = false,
}: {
  color?: Peg | null;
  hidden?: boolean;
  small?: boolean;
  empty?: boolean;
}) {
  const classes = [
    'peg',
    small ? 'peg-small' : '',
    empty ? 'peg-empty' : '',
    hidden ? 'peg-hidden' : '',
    !empty && !hidden && color ? `peg-${color}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes} aria-hidden="true">
      {hidden ? '?' : null}
    </span>
  );
}

export function CodeRow({
  code,
  hidden = false,
  small = false,
  onSlot,
  tr,
}: {
  code: readonly (Peg | null)[];
  hidden?: boolean;
  small?: boolean;
  onSlot?: (index: number) => void;
  tr: (key: MessageKey) => string;
}) {
  return (
    <span className={`code-row ${small ? 'code-row-small' : ''}`}>
      {code.map((peg, index) => {
        const label = hidden
          ? tr('hiddenPeg')
          : peg
            ? tr(PEG_LABEL[peg])
            : tr('emptyPeg');
        const content = (
          <>
            <PegDot color={peg} hidden={hidden} empty={!hidden && !peg} small={small} />
            <span className="sr-only">{label}</span>
          </>
        );
        return onSlot ? (
          <button
            key={index}
            type="button"
            className={`code-slot ${peg ? 'filled' : ''}`}
            aria-label={`${tr('position')} ${index + 1}: ${label}`}
            onClick={() => onSlot(index)}
          >
            {content}
          </button>
        ) : (
          <span key={index} className="code-slot">
            {content}
          </span>
        );
      })}
    </span>
  );
}

export function FeedbackDots({
  feedback,
  ariaLabel,
  compact = false,
}: {
  feedback: Feedback | null;
  ariaLabel: string;
  compact?: boolean;
}) {
  const cells = Array.from({ length: 4 }, (_, index) => {
    if (!feedback) return 'empty';
    if (index < feedback.black) return 'black';
    if (index < feedback.black + feedback.white) return 'white';
    return 'empty';
  });
  return (
    <span
      className={`feedback ${compact ? 'feedback-compact' : ''}`}
      role="img"
      aria-label={ariaLabel}
    >
      {cells.map((kind, index) => (
        <span key={index} className={`fb-dot fb-${kind}`} />
      ))}
    </span>
  );
}
