import { COLORS, type Peg } from '../game/codebreak';
import type { MessageKey } from '../i18n';
import { PEG_LABEL, PegDot } from './Pegs';

export function CodePicker({
  value,
  onColor,
  onSlot,
  onClear,
  onSubmit,
  submitLabel,
  tr,
  disabled = false,
  submitDisabled = false,
  helper,
}: {
  value: readonly (Peg | null)[];
  onColor: (color: Peg) => void;
  onSlot: (index: number) => void;
  onClear: () => void;
  onSubmit: () => void;
  submitLabel: string;
  tr: (key: MessageKey) => string;
  disabled?: boolean;
  submitDisabled?: boolean;
  helper?: string;
}) {
  const complete = value.every(Boolean);
  return (
    <div className={`code-picker ${disabled ? 'picker-disabled' : ''}`}>
      <div className="picker-slots" role="group" aria-label={tr('yourCode')}>
        {value.map((peg, index) => (
          <button
            key={index}
            type="button"
            className={`picker-slot ${peg ? 'filled' : ''}`}
            onClick={() => onSlot(index)}
            disabled={disabled || !peg}
            aria-label={`${tr('position')} ${index + 1}: ${peg ? tr(PEG_LABEL[peg]) : tr('emptyPeg')}`}
          >
            <PegDot color={peg} empty={!peg} />
            {!peg && <span className="slot-hint">{index + 1}</span>}
          </button>
        ))}
      </div>
      <div className="palette" role="group" aria-label={tr('colorsTitle')}>
        {COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            className={`palette-btn palette-${color}`}
            onClick={() => onColor(color)}
            disabled={disabled}
            aria-label={`${tr(PEG_LABEL[color])} (${index + 1})`}
          >
            <PegDot color={color} small />
            <span>{tr(PEG_LABEL[color])}</span>
          </button>
        ))}
      </div>
      {helper && <p className="picker-helper">{helper}</p>}
      <div className="picker-actions">
        <button
          type="button"
          className="ghost"
          onClick={onClear}
          disabled={disabled || !value.some(Boolean)}
        >
          {tr('clear')}
        </button>
        <button
          type="button"
          className="primary"
          onClick={onSubmit}
          disabled={disabled || submitDisabled || !complete}
        >
          {submitLabel}
        </button>
      </div>
      <p className="key-hint">{tr('pickerKeys')}</p>
    </div>
  );
}
