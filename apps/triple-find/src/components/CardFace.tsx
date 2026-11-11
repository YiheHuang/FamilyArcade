import { useId } from 'react';
import type { Card } from '../game/cards';
import { t, type Lang, type MessageKey } from '../i18n';

const COLOR_HEX = ['#c4513d', '#237a67', '#4959a4'] as const;
const COLOR_KEYS: MessageKey[] = ['colorCoral', 'colorTeal', 'colorIndigo'];
const SHAPE_KEYS: MessageKey[] = ['shapePill', 'shapeDiamond', 'shapeStar'];
const FILL_KEYS: MessageKey[] = ['fillSolid', 'fillStripe', 'fillOpen'];

function starPoints(cx: number, cy: number, rx: number, ry: number): string {
  const points: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? 1 : 0.43;
    points.push(`${cx + Math.cos(angle) * rx * radius},${cy + Math.sin(angle) * ry * radius}`);
  }
  return points.join(' ');
}

function shapeProps(fill: Card['fill'], color: string, patternId: string) {
  if (fill === 0) return { fill: color, stroke: color, strokeWidth: 2.5 };
  if (fill === 1) return { fill: `url(#${patternId})`, stroke: color, strokeWidth: 3 };
  return { fill: 'none', stroke: color, strokeWidth: 5 };
}

export function CardFace({
  card,
  lang,
  selected = false,
  hinted = false,
  wrong = false,
  disabled = false,
  onSelect,
  className = '',
}: {
  card: Card;
  lang: Lang;
  selected?: boolean;
  hinted?: boolean;
  wrong?: boolean;
  disabled?: boolean;
  onSelect?: (id: number) => void;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, '');
  const patternId = `stripe-${uid}`;
  const color = COLOR_HEX[card.color];
  const props = shapeProps(card.fill, color, patternId);
  const starts = card.count === 1 ? [0.5] : card.count === 2 ? [0.29, 0.71] : [0.16, 0.5, 0.84];
  const width = card.count === 1 ? 34 : card.count === 2 ? 27 : 21;
  const height = card.count === 1 ? 50 : card.count === 2 ? 48 : 44;
  const y = (72 - height) / 2;

  const label = t(lang, 'cardAria', {
    count: card.count,
    color: t(lang, COLOR_KEYS[card.color]),
    shape: t(lang, SHAPE_KEYS[card.shape]),
    fill: t(lang, FILL_KEYS[card.fill]),
  });

  const classes = [
    'card-face',
    `fill-${card.fill}`,
    selected ? 'is-selected' : '',
    hinted ? 'is-hinted' : '',
    wrong ? 'is-wrong' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      onClick={() => onSelect?.(card.id)}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      data-card-id={card.id}
      data-color={card.color}
      data-shape={card.shape}
      data-fill={card.fill}
      data-count={card.count}
    >
      <svg className="card-art" viewBox="0 0 100 72" aria-hidden="true" focusable="false">
        <defs>
          <pattern
            id={patternId}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="7" stroke={color} strokeWidth="3" />
          </pattern>
        </defs>
        {starts.map((start, index) => {
          const x = start * 100 - width / 2;
          if (card.shape === 0) {
            return (
              <rect
                key={index}
                x={x}
                y={y}
                width={width}
                height={height}
                rx={height / 2}
                {...props}
              />
            );
          }
          if (card.shape === 1) {
            return (
              <polygon
                key={index}
                points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`}
                {...props}
              />
            );
          }
          return (
            <polygon
              key={index}
              points={starPoints(x + width / 2, y + height / 2, width / 2, height / 2)}
              {...props}
            />
          );
        })}
      </svg>
      {selected ? <span className="card-check" aria-hidden="true">✓</span> : null}
    </button>
  );
}

export function MiniCard({ card, lang }: { card: Card; lang: Lang }) {
  return <CardFace card={card} lang={lang} disabled className="mini" />;
}
