import type { GameState, Move, Side } from '../game/tables';
import { t, type Lang } from '../i18n';

const TOP_LEFT = [12, 13, 14, 15, 16, 17];
const TOP_RIGHT = [18, 19, 20, 21, 22, 23];
const BOTTOM_LEFT = [11, 10, 9, 8, 7, 6];
const BOTTOM_RIGHT = [5, 4, 3, 2, 1, 0];

function CheckerStack({
  count,
  side,
  row,
}: {
  count: number;
  side: Side;
  row: 'top' | 'bottom';
}) {
  if (count <= 0) return null;
  const visible = Math.min(count, 5);
  return (
    <span className={`checkers checkers-${row} ${count > 3 ? 'dense' : ''}`} aria-hidden="true">
      {Array.from({ length: visible }, (_, index) => (
        <span key={index} className={`checker checker-${side.toLowerCase()}`} />
      ))}
      {count > visible && <span className="checker-more">+{count - visible}</span>}
    </span>
  );
}

function pointAria(lang: Lang, point: number, count: number, side: Side | null): string {
  const sideText = side ? t(lang, side === 'W' ? 'whiteShort' : 'blackShort') : '';
  return t(lang, 'pointAria', {
    n: point + 1,
    count,
    side: sideText,
    s: lang === 'en' && count !== 1 ? 's' : '',
  });
}

export function Board({
  state,
  lang,
  selected,
  moves,
  hint,
  interactive,
  onPoint,
  onBar,
  onOff,
}: {
  state: GameState;
  lang: Lang;
  selected: number | 'bar' | null;
  moves: Move[];
  hint: Move | null;
  interactive: boolean;
  onPoint: (point: number) => void;
  onBar: () => void;
  onOff: (side: Side) => void;
}) {
  const targets = new Set(
    selected === null
      ? []
      : moves.filter((move) => move.from === selected && typeof move.to === 'number').map((move) => move.to as number),
  );
  const offMove = moves.find((move) => move.from === selected && move.to === 'off');
  const last = state.lastMove;
  const lastPoint = last && typeof last.from === 'number' ? last.from : null;
  const lastTo = last && typeof last.to === 'number' ? last.to : null;
  const hintFrom = hint?.from ?? null;
  const hintTo = hint?.to ?? null;
  const turn = state.turn;

  const pointButton = (point: number, row: 'top' | 'bottom', column: number) => {
    const value = state.points[point] ?? 0;
    const side: Side | null = value > 0 ? 'W' : value < 0 ? 'B' : null;
    const count = Math.abs(value);
    const canPick = Boolean(side && side === turn);
    const isTarget = targets.has(point);
    const isHinted = hintFrom === point || hintTo === point;
    const isLast = lastPoint === point || lastTo === point;
    const isHome = side === 'W' ? point <= 5 : side === 'B' ? point >= 18 : false;
    const classes = [
      'point',
      row,
      column % 2 === 0 ? 'shade-a' : 'shade-b',
      canPick ? 'can-pick' : '',
      selected === point ? 'selected' : '',
      isTarget ? 'target' : '',
      isHinted ? 'hinted' : '',
      isLast ? 'last' : '',
      isHome ? 'home' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <button
        key={point}
        type="button"
        className={classes}
        style={{ gridColumn: column, gridRow: row === 'top' ? 1 : 2 }}
        disabled={!interactive}
        aria-label={pointAria(lang, point, count, side)}
        aria-pressed={selected === point}
        data-point={point}
        onClick={() => onPoint(point)}
      >
        <span className="point-number" aria-hidden="true">
          {point + 1}
        </span>
        <span className="triangle" aria-hidden="true" />
        <span className="point-stack" aria-hidden="true">
          <CheckerStack count={count} side={side ?? 'W'} row={row} />
        </span>
        {isTarget && <span className="target-dot" aria-hidden="true" />}
      </button>
    );
  };

  const barAria = t(lang, 'barAria', {
    count: state.bar[turn],
    side: t(lang, turn === 'W' ? 'whiteShort' : 'blackShort'),
    s: lang === 'en' && state.bar[turn] !== 1 ? 's' : '',
  });

  return (
    <div className="board" role="group" aria-label={t(lang, 'title')}>
      {TOP_LEFT.map((point, index) => pointButton(point, 'top', index + 1))}
      {TOP_RIGHT.map((point, index) => pointButton(point, 'top', index + 8))}
      {BOTTOM_LEFT.map((point, index) => pointButton(point, 'bottom', index + 1))}
      {BOTTOM_RIGHT.map((point, index) => pointButton(point, 'bottom', index + 8))}

      <button
        type="button"
        className={`bar ${selected === 'bar' ? 'selected' : ''} ${state.bar[turn] > 0 ? 'has-bar' : ''}`}
        style={{ gridColumn: 7, gridRow: '1 / 3' }}
        disabled={!interactive}
        aria-label={barAria}
        onClick={onBar}
      >
        <span className="bar-half bar-top">
          <span className="bar-label">{t(lang, 'barShort')}</span>
          <CheckerStack count={state.bar.B} side="B" row="top" />
        </span>
        <span className="bar-rail" aria-hidden="true" />
        <span className="bar-half bar-bottom">
          <CheckerStack count={state.bar.W} side="W" row="bottom" />
          <span className="bar-label">{t(lang, 'barShort')}</span>
        </span>
      </button>

      <button
        type="button"
        className={`off-tray off-top ${offMove && turn === 'B' ? 'target' : ''}`}
        style={{ gridColumn: 14, gridRow: 1 }}
        disabled={!interactive}
        aria-label={t(lang, 'offAria', {
          count: state.off.B,
          side: t(lang, 'blackShort'),
          s: lang === 'en' && state.off.B !== 1 ? 's' : '',
        })}
        onClick={() => onOff('B')}
        data-testid="off-black"
      >
        <span className="off-label">{t(lang, 'offShort')}</span>
        <strong>{state.off.B}</strong>
        <span className="off-mini" aria-hidden="true">
          {Array.from({ length: Math.min(state.off.B, 5) }, (_, index) => (
            <span key={index} className="checker checker-b" />
          ))}
        </span>
      </button>
      <button
        type="button"
        className={`off-tray off-bottom ${offMove && turn === 'W' ? 'target' : ''}`}
        style={{ gridColumn: 14, gridRow: 2 }}
        disabled={!interactive}
        aria-label={t(lang, 'offAria', {
          count: state.off.W,
          side: t(lang, 'whiteShort'),
          s: lang === 'en' && state.off.W !== 1 ? 's' : '',
        })}
        onClick={() => onOff('W')}
        data-testid="off-white"
      >
        <span className="off-mini" aria-hidden="true">
          {Array.from({ length: Math.min(state.off.W, 5) }, (_, index) => (
            <span key={index} className="checker checker-w" />
          ))}
        </span>
        <strong>{state.off.W}</strong>
        <span className="off-label">{t(lang, 'offShort')}</span>
      </button>
    </div>
  );
}
