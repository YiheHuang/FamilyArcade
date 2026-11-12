import type { ReactNode } from 'react';
import type { HandScore, PegEvent, SeatView } from '../game/cribbage';
import { t, type Lang, type MessageKey } from '../i18n';
import { CardBack, CardRow } from './Cards';

export const SEAT_CLASS = ['seat-a', 'seat-b', 'seat-c', 'seat-d'];

export function PegTrack({ score }: { score: number }) {
  const percent = Math.max(0, Math.min(100, (score / 121) * 100));
  return (
    <span className="peg-track" aria-hidden="true">
      <span className="peg-fill" style={{ width: `${percent}%` }} />
      <i className="peg-nick n30" />
      <i className="peg-nick n60" />
      <i className="peg-nick n90" />
      <i className="peg-head" style={{ left: `calc(${percent}% - 5px)` }} />
    </span>
  );
}

export function Scoreboard({
  scores,
  names,
  dealer,
  active,
  winner,
  lang,
}: {
  scores: number[];
  names: string[];
  dealer: number;
  active: number;
  winner: number | null;
  lang: Lang;
}) {
  return (
    <section className="scoreboard" aria-label={t(lang, 'finalScores')}>
      {scores.map((score, seat) => (
        <div
          key={seat}
          className={`score-line ${SEAT_CLASS[seat]} ${seat === active ? 'is-active' : ''} ${
            seat === winner ? 'is-winner' : ''
          }`}
        >
          <span className="seat-pip" aria-hidden="true" />
          <span className="score-name">
            {names[seat]}
            {seat === dealer && <small className="dealer-tag">{t(lang, 'dealer')}</small>}
          </span>
          <PegTrack score={score} />
          <strong className="score-total">{score}</strong>
        </div>
      ))}
    </section>
  );
}

export function CribSlot({
  count,
  ownerLabel,
  lang,
  compact,
}: {
  count: number;
  ownerLabel: string;
  lang: Lang;
  compact?: boolean;
}) {
  return (
    <div className={`crib-slot ${compact ? 'is-compact' : ''}`}>
      <div className="back-stack" aria-hidden="true">
        {Array.from({ length: Math.max(0, Math.min(4, count)) }, (_, index) => (
          <span key={index} className="stack-back" style={{ transform: `translate(${index * 3}px, ${-index * 2}px)` }}>
            <CardBack small />
          </span>
        ))}
        {count === 0 && <span className="empty-slot" />}
      </div>
      <div>
        <span className="slot-label">{t(lang, 'crib')}</span>
        <small>{ownerLabel}</small>
      </div>
    </div>
  );
}

function partLabel(part: HandScore['parts'][number], lang: Lang): string {
  if (part.kind === 'fifteens') return `${t(lang, 'fifteens')} ×${part.count}`;
  if (part.kind === 'pairs') return `${t(lang, 'pairs')} ×${part.count}`;
  if (part.kind === 'runs') return `${t(lang, 'runs')} ${part.n ?? 3} × ${part.count}`;
  if (part.kind === 'flush') return t(lang, 'flush');
  return t(lang, 'nobs');
}

export function ShowBoard({
  scores,
  names,
  cribOwnerLabel,
  lang,
  winner,
  bestPoints,
  bestSeat,
}: {
  scores: HandScore[];
  names: string[];
  cribOwnerLabel: string;
  lang: Lang;
  winner: number | null;
  bestPoints: number;
  bestSeat: number | null;
}) {
  return (
    <div className="show-board">
      {scores.map((score, index) => {
        const ownerName = score.owner === 'crib' ? cribOwnerLabel : names[score.owner];
        const isBest =
          score.owner !== 'crib' && score.total === bestPoints && score.owner === bestSeat;
        return (
          <article
            key={`${score.owner}-${index}`}
            className={`show-card ${score.owner === 'crib' ? 'is-crib' : ''} ${
              isBest ? 'is-best' : ''
            } ${winner !== null && !score.awarded ? 'is-unawarded' : ''}`}
          >
            <header className="show-head">
              <div>
                <span className="show-kicker">
                  {score.owner === 'crib' ? t(lang, 'scoreCrib') : t(lang, 'scoreHand')}
                </span>
                <h4>{ownerName}</h4>
              </div>
              {winner !== null && (
                <span className={`award-tag ${score.awarded ? 'on' : ''}`}>
                  {score.awarded ? t(lang, 'counted') : t(lang, 'notCounted')}
                </span>
              )}
            </header>
            <div className="show-cards">
              <CardRow cards={score.cards} lang={lang} small />
              <span className="plus-chip">+</span>
              <CardRow cards={[score.starter]} lang={lang} small />
            </div>
            <ul className="score-parts">
              {score.parts.length === 0 ? (
                <li className="zero-part">
                  <span>—</span>
                  <strong>0</strong>
                </li>
              ) : (
                score.parts.map((part) => (
                  <li key={`${part.kind}-${part.n ?? ''}`}>
                    <span>{partLabel(part, lang)}</span>
                    <strong>{part.points}</strong>
                  </li>
                ))
              )}
            </ul>
            <footer className="show-total">
              <span>{t(lang, 'total')}</span>
              <strong>{score.total}</strong>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

export function EventChips({
  events,
  lang,
  names,
  limit = 4,
}: {
  events: PegEvent[];
  lang: Lang;
  names: string[];
  limit?: number;
}) {
  const useful = events
    .filter((event) => ['fifteen', 'thirtyone', 'pair', 'run', 'go', 'last', 'heels'].includes(event.kind))
    .slice(-limit);
  if (useful.length === 0) return null;
  return (
    <div className="event-chips" aria-live="polite">
      {useful.map((event, index) => {
        const key: MessageKey =
          event.kind === 'thirtyone'
            ? 'thirtyOne'
            : event.kind === 'fifteen'
              ? 'fifteen'
              : event.kind === 'pair'
                ? 'pair'
                : event.kind === 'run'
                  ? 'run'
                  : event.kind === 'go'
                    ? 'go'
                    : event.kind === 'heels'
                      ? 'heels'
                      : 'lastCard';
        const name =
          event.seat === null || names[event.seat] === undefined
            ? ''
            : names[event.seat];
        return (
          <span key={`${event.kind}-${index}`} className={`event-chip ${event.kind}`}>
            {name && <b>{name}</b>}
            <span>{t(lang, key)}</span>
            {event.points > 0 && <strong>+{event.points}</strong>}
          </span>
        );
      })}
    </div>
  );
}

export function TableCenter({
  view,
  names,
  cribOwnerLabel,
  lang,
  children,
}: {
  view: SeatView;
  names: string[];
  cribOwnerLabel: string;
  lang: Lang;
  children?: ReactNode;
}) {
  const sequence = view.sequence;
  return (
    <div className={`table-felt phase-${view.phase}`}>
      <div className="felt-top">
        <div className="starter-slot">
          <span className="slot-label">{t(lang, 'starter')}</span>
          {view.starter !== null ? (
            <CardRow cards={[view.starter]} lang={lang} small />
          ) : (
            <span className="empty-card-slot">—</span>
          )}
        </div>
        <div className="stock-slot" aria-hidden="true">
          <span className="slot-label">{t(lang, 'stock')}</span>
          <span className="stock-mini">
            <CardBack small />
            <small>{view.stockCount}</small>
          </span>
        </div>
        <CribSlot
          count={view.cribCount}
          ownerLabel={cribOwnerLabel}
          lang={lang}
          compact
        />
      </div>

      <div className="count-orb" data-tone={view.count === 31 ? 'hot' : view.count === 15 ? 'warm' : 'cool'}>
        <span>{t(lang, 'tableCount')}</span>
        <strong>{view.count}</strong>
      </div>

      <div className="peg-lane">
        {sequence.length === 0 ? (
          <span className="lane-empty">—</span>
        ) : (
          <CardRow cards={sequence} lang={lang} highlight={view.lastCard} />
        )}
      </div>

      <EventChips events={view.events} lang={lang} names={names} />
      {children}
    </div>
  );
}
