const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
};

export function Dice({
  value,
  rolling = false,
  onClick,
  disabled = false,
  label,
  hint,
}: {
  value: number | null;
  rolling?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  label: string;
  hint?: string;
}) {
  const face = value && value >= 1 && value <= 6 ? value : null;
  const pips = face ? PIPS[face] : PIPS[1];
  return (
    <button
      type="button"
      className={`dice${rolling ? ' is-rolling' : ''}${face ? '' : ' is-empty'}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <span className="dice__face" aria-hidden="true">
        {face ? (
          Array.from({ length: 9 }, (_, index) => {
            const row = Math.floor(index / 3);
            const col = index % 3;
            const on = pips.some(([r, c]) => r === row && c === col);
            return <span key={index} className={`pip${on ? ' is-on' : ''}`} />;
          })
        ) : (
          <span className="dice__question">?</span>
        )}
      </span>
      {hint && <span className="dice__hint">{hint}</span>}
    </button>
  );
}
