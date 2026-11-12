import type { ChainEntry, PlayerState } from '../game/idiom-chain';
import { t, type Lang } from '../i18n';

export function ChainList({
  chain,
  names,
  lang,
  emptyLabel,
}: {
  chain: readonly ChainEntry[];
  names: readonly string[];
  lang: Lang;
  emptyLabel: string;
}) {
  if (chain.length === 0) {
    return <p className="chain-empty">{emptyLabel}</p>;
  }
  return (
    <ol className="chain-list" aria-label={t(lang, 'chain')}>
      {chain.map((entry, index) => (
        <li
          key={`${entry.text}-${index}`}
          className={`chain-entry seat-${entry.seat % 6} ${index === chain.length - 1 ? 'latest' : ''}`}
        >
          <span className="chain-no">{index + 1}</span>
          <div className="chain-body">
            <div className="chain-top">
              <span className="chain-idiom">{entry.text}</span>
              <span className="chain-points">+{entry.points}</span>
            </div>
            <span className="chain-pinyin">{entry.pinyin}</span>
            {lang === 'en' && <span className="chain-gloss">{entry.gloss}</span>}
          </div>
          <span className="chain-seat">{names[entry.seat] ?? ''}</span>
          {entry.rare && <span className="chain-rare">{t(lang, 'rare')}</span>}
          {entry.streakBonus && <span className="chain-bonus">{t(lang, 'streakBonus')}</span>}
        </li>
      ))}
    </ol>
  );
}

export function ScoreStrip({
  players,
  turn,
  status,
  missLimit,
  lang,
}: {
  players: readonly PlayerState[];
  turn: number;
  status: 'playing' | 'finished';
  missLimit: number;
  lang: Lang;
}) {
  return (
    <div className="players-strip">
      {players.map((player, seat) => {
        const misses = Array.from({ length: missLimit }, (_, index) => index < player.misses);
        return (
          <div
            key={seat}
            className={`player-card seat-${seat % 6} ${status === 'playing' && turn === seat ? 'active' : ''} ${player.out ? 'out' : ''}`}
          >
            <div className="player-line">
              <span className="player-dot" aria-hidden="true" />
              <strong className="player-name">{player.name}</strong>
              <span className="player-score">{player.score}</span>
            </div>
            <div className="player-meta">
              <span className="miss-dots" title={t(lang, 'strike')} aria-label={`${t(lang, 'strike')}: ${player.misses}/${missLimit}`}>
                {misses.map((filled, index) => (
                  <span key={index} className={`miss-dot ${filled ? 'filled' : ''}`} />
                ))}
              </span>
              <span className={`streak-pips ${player.streak > 0 ? 'warm' : ''}`} title={t(lang, 'streak')}>
                {[0, 1, 2].map((index) => (
                  <span key={index} className={`streak-pip ${index < player.streak ? 'lit' : ''}`} />
                ))}
              </span>
              {player.out ? <span className="player-out">{t(lang, 'out')}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
