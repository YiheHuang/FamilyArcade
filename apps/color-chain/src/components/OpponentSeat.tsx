import type { PlayerView } from '../game/color-chain';
import { t, type Lang } from '../i18n';
import { cardsText, levelName } from '../labels';
import { CardBack } from './PlayingCard';

export function OpponentSeat({
  player,
  seat,
  active,
  lang,
  target,
  compact = false,
}: {
  player: PlayerView;
  seat: number;
  active: boolean;
  lang: Lang;
  target: number;
  compact?: boolean;
}) {
  const backs = Math.min(player.handCount, compact ? 4 : 5);
  return (
    <div className={`opponent ${active ? 'opponent--active' : ''}`} aria-current={active ? 'true' : undefined}>
      <div className="opponent-head">
        <span className={`avatar ${player.ai ? 'avatar-ai' : 'avatar-human'}`} aria-hidden="true">
          {player.name.slice(0, 1)}
        </span>
        <div className="opponent-name">
          <strong>{player.name}</strong>
          <span>
            {player.ai ? levelName(lang, player.ai) : t(lang, 'seatLabel', { n: seat + 1 })}
          </span>
        </div>
        <span className="opponent-score">{player.score}</span>
      </div>
      <div className="opponent-meta">
        <span>{cardsText(lang, player.handCount)}</span>
        <span className="opponent-target">/ {target}</span>
      </div>
      <div className="opponent-hand" aria-hidden="true">
        {Array.from({ length: backs }, (_, index) => (
          <CardBack key={index} size="xs" style={{ marginLeft: index === 0 ? 0 : -18, zIndex: index }} />
        ))}
        {player.handCount > backs && <span className="opponent-more">+{player.handCount - backs}</span>}
        {player.handCount === 0 && <span className="opponent-empty">0</span>}
      </div>
      {active && <span className="opponent-pulse" aria-hidden="true" />}
    </div>
  );
}
