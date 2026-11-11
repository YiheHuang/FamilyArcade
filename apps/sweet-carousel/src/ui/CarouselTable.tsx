import type { CSSProperties, ReactNode } from 'react';
import { CrownBadge, DessertTally, SeatDot, type T } from './components';

export interface CarouselPod {
  seat: number;
  name: string;
  score: number;
  cards: number[];
  status?: 'active' | 'picked' | 'waiting' | 'idle';
  crowns?: number;
  kind?: 'human' | 'ai';
}

export function CarouselTable({
  pods,
  center,
  passDirection,
  round,
  pickIndex,
  t,
  compact = false,
}: {
  pods: CarouselPod[];
  center: ReactNode;
  passDirection: 'left' | 'right';
  round: number;
  pickIndex: number;
  t: T;
  compact?: boolean;
}) {
  return (
    <div className={`carousel-table${compact ? ' carousel-table--compact' : ''}`}>
      <div className="carousel-stage">
        <div className="carousel-ring" aria-hidden>
          <div className="carousel-ring__stripes" />
          <div className="carousel-ring__inner" />
          <div className="carousel-ring__bulbs">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className="carousel-bulb" style={{ '--i': index } as CSSProperties} />
            ))}
          </div>
        </div>
        <div className="carousel-center">{center}</div>
        <div className="carousel-pods">
          {pods.map((pod, index) => {
            const angle = -90 + (index * 360) / pods.length;
            return (
              <div
                key={pod.seat}
                className={`carousel-pod carousel-pod--${pod.status ?? 'idle'}`}
                style={{ '--angle': `${angle}deg` } as CSSProperties}
              >
                <div className="carousel-pod__head">
                  <SeatDot seat={pod.seat} size={20} />
                  <strong>{pod.name}</strong>
                  {pod.kind === 'ai' && <span className="pill pill--muted">AI</span>}
                </div>
                <div className="carousel-pod__score">
                  <span>{pod.score}</span>
                  <small>{t('game.pointsShort')}</small>
                  <CrownBadge count={pod.crowns ?? 0} t={t} />
                </div>
                <DessertTally cards={pod.cards} t={t} max={4} size={16} />
                {pod.status === 'picked' && <span className="pod-status">{t('game.picked')}</span>}
                {pod.status === 'active' && <span className="pod-status pod-status--active">{t('game.currentPlayer')}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="carousel-caption">
        <span>
          {t('game.roundOf', { n: round })} · {t('game.pickOf', { n: Math.min(pickIndex + 1, 8) })}
        </span>
        <span className="carousel-caption__pass">
          {passDirection === 'left' ? '↺' : '↻'} {passDirection === 'left' ? t('game.passLeft') : t('game.passRight')}
        </span>
      </div>
    </div>
  );
}
