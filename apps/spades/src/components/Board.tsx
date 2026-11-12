import type { ReactNode } from 'react';
import type { Bid, PlayedCard, RoundSummary, Seat, Trick } from '../game/spades';
import { t, type Lang } from '../i18n';
import { CardBack, CardFace } from './Cards';

export interface TablePlayer {
  seat: Seat;
  name: string;
  bid: Bid | null;
  tricks: number;
  dealer: boolean;
  active: boolean;
  isAI: boolean;
}

function bidText(bid: Bid | null, lang: Lang): string {
  if (!bid) return t(lang, 'none');
  if (bid.value === 0) return bid.blind ? t(lang, 'blindNilShort') : t(lang, 'nil');
  return String(bid.value);
}

export function Scoreboard({
  lang,
  scores,
  bags,
  contracts,
  tricks,
  activeTeam,
  teamNames,
  round,
  target,
}: {
  lang: Lang;
  scores: [number, number];
  bags: [number, number];
  contracts: [number, number];
  tricks: [number, number];
  activeTeam: number | null;
  teamNames: [string, string];
  round: number;
  target: number;
}) {
  return (
    <div className="scoreboard">
      {[0, 1].map((team) => (
        <div
          key={team}
          className={`team-score team-${team} ${activeTeam === team ? 'active' : ''}`}
        >
          <div className="team-head">
            <span className="team-name">{teamNames[team]}</span>
            <span className="team-target">{t(lang, 'matchTo', { n: target })}</span>
          </div>
          <div className="team-main">
            <strong>{scores[team]}</strong>
            <div className="team-facts">
              <span>
                {t(lang, 'contract')} <b>{contracts[team]}</b>
              </span>
              <span>
                {t(lang, 'tricks')} <b>{tricks[team]}</b>
              </span>
            </div>
          </div>
          <div className="bags-line" aria-label={`${t(lang, 'bags')}: ${bags[team]}`}>
            <span className="bags-label">{t(lang, 'bags')}</span>
            <span className="bag-dots" aria-hidden="true">
              {Array.from({ length: 10 }, (_, index) => (
                <i key={index} className={index < bags[team] ? 'filled' : ''} />
              ))}
            </span>
            <b>{bags[team]}</b>
          </div>
        </div>
      ))}
      <div className="round-bug">
        <span>{t(lang, 'roundLabel', { n: round })}</span>
        <strong>♠</strong>
      </div>
    </div>
  );
}

export function SeatBadge({
  player,
  lang,
  className = '',
  compact = false,
}: {
  player: TablePlayer;
  lang: Lang;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`seat-badge ${className} ${player.active ? 'active' : ''} ${compact ? 'compact' : ''}`}
      data-seat={player.seat}
      data-active={player.active ? 'true' : 'false'}
    >
      <div className="seat-name-line">
        <span className="seat-name">{player.name}</span>
        {player.dealer && <span className="dealer-chip">{t(lang, 'dealerShort')}</span>}
        {player.isAI && <span className="ai-tag">{t(lang, 'aiTag')}</span>}
      </div>
      <div className="seat-numbers">
        <span className="seat-bid">
          <small>{t(lang, 'bid')}</small>
          <b>{bidText(player.bid, lang)}</b>
        </span>
        <span className="seat-trick-count">
          <small>{t(lang, 'tricks')}</small>
          <b>{player.tricks}</b>
        </span>
      </div>
    </div>
  );
}

export function TrickArea({
  lang,
  currentTrick,
  lastTrick,
  phase,
  bidding,
  children,
}: {
  lang: Lang;
  currentTrick: PlayedCard[];
  lastTrick: Trick | null;
  phase: 'bidding' | 'playing' | 'round-over' | 'done';
  bidding: boolean;
  children?: ReactNode;
}) {
  const showingLast = currentTrick.length === 0 && lastTrick && phase !== 'bidding';
  const cards = currentTrick.length > 0 ? currentTrick : showingLast ? lastTrick.cards : [];
  return (
    <div
      className="trick-area"
      aria-label={t(lang, 'trickArea')}
      data-trick-count={currentTrick.length}
      data-testid="trick-area"
    >
      {cards.length === 0 && (
        <div className="trick-empty">
          <span className="spade-watermark" aria-hidden="true">
            ♠
          </span>
          <span className="trick-caption">
            {bidding ? t(lang, 'bids') : t(lang, 'waitingLead')}
          </span>
        </div>
      )}
      {cards.map((item) => (
        <div
          key={`${item.seat}-${item.card.rank}${item.card.suit}`}
          className={`trick-card pos-${item.seat} ${showingLast ? 'ghost' : ''}`}
        >
          <CardFace card={item.card} lang={lang} size="trick" ghost={Boolean(showingLast)} />
        </div>
      ))}
      {showingLast && <span className="last-trick-label">{t(lang, 'lastTrick')}</span>}
      {children ? <div className="trick-center-slot">{children}</div> : null}
    </div>
  );
}

export function BidPanel({
  lang,
  title,
  onBid,
}: {
  lang: Lang;
  title: string;
  onBid: (value: number) => void;
}) {
  return (
    <div className="bid-panel" data-testid="bid-panel">
      <strong className="bid-title">{title}</strong>
      <div className="bid-grid">
        {Array.from({ length: 13 }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            className="bid-btn"
            onClick={() => onBid(value)}
            data-testid={`bid-${value}`}
            aria-label={t(lang, 'bidButton', { n: value })}
          >
            {value}
          </button>
        ))}
        <button
          type="button"
          className="bid-btn nil"
          onClick={() => onBid(0)}
          data-testid="bid-nil"
          aria-label={t(lang, 'nilButton')}
        >
          {t(lang, 'nil')}
        </button>
      </div>
    </div>
  );
}

export function BidCover({
  lang,
  title,
  blindAvailable,
  onReveal,
  onBlind,
}: {
  lang: Lang;
  title: string;
  blindAvailable: boolean;
  onReveal: () => void;
  onBlind: () => void;
}) {
  return (
    <div className="hand-cover bid-cover" data-testid="bid-cover">
      <div className="cover-back-fan" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <CardBack key={index} lang={lang} index={index} total={5} />
        ))}
      </div>
      <strong>{title}</strong>
      <div className="cover-actions">
        <button type="button" className="primary" onClick={onReveal} data-testid="reveal">
          {t(lang, 'lookHand')}
        </button>
        {blindAvailable && (
          <button type="button" className="secondary" onClick={onBlind} data-testid="blind-nil">
            {t(lang, 'blindButton')}
          </button>
        )}
      </div>
    </div>
  );
}

export function Curtain({
  lang,
  name,
  onReveal,
}: {
  lang: Lang;
  name: string;
  onReveal: () => void;
}) {
  return (
    <div className="hand-cover play-cover" data-testid="curtain">
      <div className="cover-back-fan" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <CardBack key={index} lang={lang} index={index} total={5} />
        ))}
      </div>
      <strong>{t(lang, 'passTo', { name })}</strong>
      <button type="button" className="primary" onClick={onReveal} data-testid="show-hand">
        {t(lang, 'showHand')}
      </button>
    </div>
  );
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export function RoundSheet({
  lang,
  summary,
  teamNames,
  seatNames,
  canNext,
  onNext,
}: {
  lang: Lang;
  summary: RoundSummary;
  teamNames: [string, string];
  seatNames: string[];
  canNext: boolean;
  onNext: () => void;
}) {
  return (
    <div className="table-sheet" data-testid="round-sheet">
      <div className="sheet-card">
        <span className="sheet-kicker">{t(lang, 'roundOver', { n: summary.round })}</span>
        <div className="sheet-teams">
          {[0, 1].map((team) => (
            <div key={team} className={`sheet-team team-${team}`}>
              <div className="sheet-team-head">
                <strong>{teamNames[team]}</strong>
                <span>{summary.contractMade[team] ? t(lang, 'contractMade') : t(lang, 'contractSet')}</span>
              </div>
              <div className="sheet-facts">
                <span>
                  {t(lang, 'contract')} <b>{summary.teamBids[team]}</b>
                </span>
                <span>
                  {t(lang, 'tricks')} <b>{summary.eligibleTricks[team]}</b>
                </span>
                <span>
                  {t(lang, 'pointsThisRound')} <b className={summary.points[team] >= 0 ? 'up' : 'down'}>{signed(summary.points[team])}</b>
                </span>
              </div>
              {summary.bagPenalties[team] > 0 && (
                <span className="sheet-bag">{t(lang, 'bagPenalty', { n: summary.bagPenalties[team] })}</span>
              )}
            </div>
          ))}
        </div>
        {summary.nilResults.length > 0 && (
          <ul className="sheet-nils">
            {summary.nilResults.map((item) => (
              <li key={item.seat} className={item.points >= 0 ? 'up' : 'down'}>
                {item.points >= 0
                  ? t(lang, 'nilMade', { name: seatNames[item.seat], n: item.points })
                  : t(lang, 'nilFailed', { name: seatNames[item.seat], n: Math.abs(item.points) })}
              </li>
            ))}
          </ul>
        )}
        <div className="sheet-score">
          <span>{t(lang, 'score')}</span>
          <strong>
            {teamNames[0]} {summary.scores[0]} · {teamNames[1]} {summary.scores[1]}
          </strong>
        </div>
        {canNext ? (
          <button type="button" className="primary wide" onClick={onNext} data-testid="next-round">
            {t(lang, 'nextRound')}
          </button>
        ) : (
          <p className="sheet-wait">{t(lang, 'waitHostNext')}</p>
        )}
      </div>
    </div>
  );
}

export function MatchSheet({
  lang,
  winner,
  scores,
  teamNames,
  canRestart,
  canChangeLevel,
  isGuest,
  onChangeLevel,
  onRestart,
}: {
  lang: Lang;
  winner: 0 | 1;
  scores: [number, number];
  teamNames: [string, string];
  canRestart: boolean;
  canChangeLevel: boolean;
  isGuest: boolean;
  onChangeLevel: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="table-sheet" data-testid="match-over">
      <div className="sheet-card match-card">
        <span className="sheet-kicker">{t(lang, 'matchOver')}</span>
        <strong className="match-headline">
          {t(lang, 'matchWinner', { team: teamNames[winner] })}
        </strong>
        <div className="match-score">
          <span>{t(lang, 'finalScore')}</span>
          <strong>
            {teamNames[0]} {scores[0]} · {teamNames[1]} {scores[1]}
          </strong>
        </div>
        {isGuest ? (
          <p className="sheet-wait">{t(lang, 'waitHostMatch')}</p>
        ) : (
          <div className="sheet-actions">
            {canRestart && (
              <button type="button" className="primary" onClick={onRestart} data-testid="play-again">
                {t(lang, 'playAgain')}
              </button>
            )}
            {canChangeLevel && (
              <button type="button" className="secondary" onClick={onChangeLevel} data-testid="change-level">
                {t(lang, 'changeLevel')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
