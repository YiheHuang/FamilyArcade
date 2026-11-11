const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function DieFace({ value, empty = false }: { value: number; empty?: boolean }) {
  const pips = empty || value < 1 ? [] : PIPS[value] ?? [];
  return (
    <span className="die-shell" aria-hidden="true">
      <span className="pip-grid">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} className={`pip-slot ${pips.includes(index) ? 'on' : ''}`}>
            <span className="pip" />
          </span>
        ))}
      </span>
      {(empty || value < 1) && <span className="die-empty">?</span>}
    </span>
  );
}

export function Die({
  value,
  held,
  highlighted,
  disabled,
  label,
  heldLabel,
  idleLabel,
  onToggle,
}: {
  value: number;
  held: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  label: string;
  heldLabel: string;
  idleLabel: string;
  onToggle: () => void;
}) {
  const empty = value < 1;
  return (
    <button
      type="button"
      className={[
        'die',
        empty ? 'empty' : '',
        held ? 'held' : '',
        highlighted ? 'highlighted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      aria-pressed={held}
      disabled={disabled || empty}
      onClick={onToggle}
    >
      <DieFace value={value} empty={empty} />
      <span className={`die-badge ${held ? 'on' : ''}`}>{held ? heldLabel : idleLabel}</span>
    </button>
  );
}
