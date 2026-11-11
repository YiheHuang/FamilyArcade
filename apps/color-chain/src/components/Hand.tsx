import type { CSSProperties } from 'react';
import type { Card } from '../game/color-chain';
import type { Lang } from '../i18n';
import { PlayingCard } from './PlayingCard';

const COLOR_ORDER: Record<Card['color'], number> = {
  red: 0,
  yellow: 1,
  green: 2,
  blue: 3,
  wild: 4,
};

const KIND_ORDER: Record<Card['kind'], number> = {
  number: 0,
  skip: 1,
  reverse: 2,
  draw2: 3,
  wild: 4,
  wild4: 5,
};

export function sortHand(hand: readonly Card[]): Card[] {
  return [...hand].sort((a, b) => {
    const color = COLOR_ORDER[a.color] - COLOR_ORDER[b.color];
    if (color !== 0) return color;
    const kind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kind !== 0) return kind;
    return (a.value ?? -1) - (b.value ?? -1) || a.id.localeCompare(b.id);
  });
}

const TILT = [-2.8, 1.6, -1.2, 2.4, -2, 1.1, -1.8, 2.2, -1.4, 1.9];

export function Hand({
  hand,
  playableIds,
  hintCardId,
  lang,
  canAct,
  onPlay,
}: {
  hand: Card[];
  playableIds: Set<string>;
  hintCardId: string | null;
  lang: Lang;
  canAct: boolean;
  onPlay: (card: Card) => void;
}) {
  const cards = sortHand(hand);
  return (
    <div className={`hand ${cards.length > 9 ? 'hand--tight' : ''}`} role="group" aria-label="Hand">
      {cards.map((card, index) => {
        const playable = playableIds.has(card.id);
        return (
          <div
            key={card.id}
            className={`hand-card ${playable && canAct ? 'hand-card--playable' : ''}`}
            style={
              {
                '--rot': `${TILT[index % TILT.length]}deg`,
                '--lift': playable && canAct ? '-14px' : '0px',
              } as CSSProperties
            }
          >
            <PlayingCard
              card={card}
              lang={lang}
              size="md"
              onClick={() => onPlay(card)}
              disabled={!canAct || !playable}
              playable={playable}
              hint={hintCardId === card.id}
              dim={canAct && !playable}
            />
          </div>
        );
      })}
    </div>
  );
}
