import {
  QUEEN_SPADES,
  cardPoints,
  isHeart,
  isQueenOfSpades,
  suitOf,
  type Card,
  type SeatView,
  type Suit,
} from '../game/hearts';
import { t, type Lang, type MessageKey } from '../i18n';
import { CardBack, PlayingCard } from './Cards';

const SEAT_CLASS = ['pos-bottom', 'pos-left', 'pos-top', 'pos-right'] as const;

function relativeSeat(seat: number, viewer: number): number {
  return (seat - viewer + 4) % 4;
}

function directionName(direction: SeatView['passDirection'], lang: Lang): string {
  const key: MessageKey =
    direction === 'left'
      ? 'passLeft'
      : direction === 'right'
        ? 'passRight'
        : direction === 'across'
          ? 'passAcross'
          : 'passHold';
  return t(lang, key);
}

function illegalReason(view: SeatView, card: Card, lang: Lang): string {
  if (!view.canAct) return t(lang, 'illegalTurn');
  if (view.trick.length === 0) {
    if (view.trickNumber === 0 && view.mustLeadTwoClubs) return t(lang, 'illegalTwoClubs');
    if (!view.heartsBroken && isHeart(card)) return t(lang, 'illegalHearts');
    return t(lang, 'illegalTurn');
  }
  const lead = suitOf(view.trick[0].card);
  if (view.hand.some((item) => suitOf(item) === lead)) {
    return t(lang, 'illegalFollow', { suit: t(lang, suitKey(lead)) });
  }
  if (view.firstTrick && (isHeart(card) || isQueenOfSpades(card))) {
    return t(lang, 'illegalFirst');
  }
  return t(lang, 'illegalTurn');
}

function suitKey(suit: Suit): MessageKey {
  if (suit === 'clubs') return 'suitClubs';
  if (suit === 'diamonds') return 'suitDiamonds';
  if (suit === 'spades') return 'suitSpades';
  return 'suitHearts';
}

function SeatBadge({
  view,
  seat,
  names,
  lang,
  active,
}: {
  view: SeatView;
  seat: number;
  names: string[];
  lang: Lang;
  active: boolean;
}) {
  const name = names[seat] || t(lang, 'playerN', { n: seat + 1 });
  const handPoints = view.handPoints[seat] ?? 0;
  const total = view.scores[seat] ?? 0;
  const ready = view.phase === 'passing' && view.passReady[seat];
  const turn = view.phase === 'playing' && view.turn === seat;
  const moon = view.moonShooter === seat;
  return (
    <div className={`seat ${active ? 'is-active' : ''} ${turn ? 'is-turn' : ''}`}>
      <span className="seat-avatar" data-seat={seat}>
        {name.trim().slice(0, 1)}
      </span>
      <span className="seat-copy">
        <strong>{name}</strong>
        <span className="seat-score">
          {total}
          <small>{t(lang, 'total')}</small>
        </span>
      </span>
      <span className="seat-meta">
        {handPoints > 0 && <span className="hand-point-badge">+{handPoints}</span>}
        {moon && <span className="moon-badge" title={t(lang, 'moon')}>☾</span>}
        {ready && <span className="ready-badge">✓</span>}
        {view.phase === 'playing' && <span className="card-count">{view.handCounts[seat]}</span>}
      </span>
      {turn && <span className="turn-pip" aria-hidden="true" />}
    </div>
  );
}

export function Table({
  view,
  names,
  humans,
  viewerSeat,
  lang,
  selected,
  hintCard,
  onCard,
}: {
  view: SeatView;
  names: string[];
  humans: boolean[];
  viewerSeat: number;
  lang: Lang;
  selected: Card[];
  hintCard: Card | null;
  onCard: (card: Card) => void;
}) {
  const passMode = view.phase === 'passing';
  const playMode = view.phase === 'playing';
  const liveCards =
    view.trick.length > 0
      ? view.trick
      : view.lastTrick.length === 4 && playMode
        ? view.lastTrick
        : [];
  const showingLast = view.trick.length === 0 && liveCards === view.lastTrick;
  const currentTrickPoints = view.trick.reduce((total, item) => total + cardPoints(item.card), 0);
  const handPoints = view.handPoints[viewerSeat] ?? 0;
  const queenOut = view.playedCards.includes(QUEEN_SPADES);
  const passTargetSeat =
    view.passDirection === 'left'
      ? (viewerSeat + 1) % 4
      : view.passDirection === 'right'
        ? (viewerSeat + 3) % 4
        : (viewerSeat + 2) % 4;
  const passTargetName =
    names[passTargetSeat] || t(lang, 'playerN', { n: passTargetSeat + 1 });

  return (
    <div className="table-wrap" aria-label={t(lang, 'tableLabel')}>
      <div className="felt">
        <span className="felt-mark" aria-hidden="true">♥</span>
        <span className="felt-stitch" aria-hidden="true" />

        {[0, 1, 2, 3].map((seat) => {
          const relative = relativeSeat(seat, viewerSeat);
          const active = seat === viewerSeat;
          const showBacks = view.phase === 'playing' && seat !== viewerSeat;
          return (
            <div key={seat} className={`seat-slot ${SEAT_CLASS[relative]}`}>
              <SeatBadge view={view} seat={seat} names={names} lang={lang} active={active} />
              {showBacks && view.handCounts[seat] > 0 && (
                <div className="seat-backs" aria-hidden="true">
                  <CardBack small />
                  <CardBack small />
                  <CardBack small />
                  <span className="seat-backs-count">{view.handCounts[seat]}</span>
                </div>
              )}
            </div>
          );
        })}

        <div className={`trick-zone ${showingLast ? 'is-last' : ''}`}>
          <div className="trick-caption">
            {passMode
              ? view.passDirection === 'hold'
                ? t(lang, 'passingHold')
                : t(lang, 'passing', { direction: directionName(view.passDirection, lang) })
              : showingLast
                ? t(lang, 'lastTrick')
                : view.trick.length > 0
                  ? t(lang, 'trickNo', { n: view.trickNumber + 1 })
                  : t(lang, 'trickWaiting')}
          </div>
          {view.trick.length > 0 && currentTrickPoints > 0 && (
            <span className="trick-points">+{currentTrickPoints}</span>
          )}
          {liveCards.length === 0 && <span className="trick-watermark" aria-hidden="true">♥</span>}
          {liveCards.map((item, index) => {
            const relative = relativeSeat(item.seat, viewerSeat);
            const winner = showingLast && view.lastTrickWinner === item.seat;
            return (
              <span
                key={`${item.seat}-${item.card}-${index}`}
                className={`trick-card ${SEAT_CLASS[relative]} ${winner ? 'is-winner' : ''}`}
              >
                <PlayingCard card={item.card} lang={lang} decorative compact />
              </span>
            );
          })}
        </div>

        <div className="table-status">
          <span className={`status-pill ${view.heartsBroken ? 'is-open' : ''}`}>
            {view.heartsBroken ? t(lang, 'heartsBroken') : t(lang, 'heartsClosed')}
          </span>
          <span className="status-divider" aria-hidden="true">·</span>
          <span className={`status-pill queen ${queenOut ? 'is-open' : ''}`}>
            {queenOut ? t(lang, 'queenPlayed') : t(lang, 'queenWaiting')}
          </span>
        </div>
      </div>

      <div className="hand-area">
        <div className="hand-head">
          <div className="hand-title">
            <span className="hand-seat">{names[viewerSeat] || t(lang, 'playerN', { n: viewerSeat + 1 })}</span>
            <span className="hand-sub">
              {passMode
                ? view.passDirection === 'hold'
                  ? t(lang, 'passingHold')
                  : t(lang, 'passTarget', { name: passTargetName })
                : t(lang, 'cardsLeft', { n: view.hand.length })}
            </span>
          </div>
          <div className="hand-chips">
            {handPoints > 0 && <span className="chip points-chip">{t(lang, 'points', { n: handPoints })}</span>}
            {view.hand.some((card) => card === QUEEN_SPADES) && (
              <span className="chip queen-chip">{t(lang, 'queenLabel')}</span>
            )}
            {humans[viewerSeat] === false && <span className="chip">{t(lang, 'cpu')}</span>}
          </div>
        </div>
        <div className={`hand-rack ${view.hand.length > 9 ? 'is-many' : ''}`} role="group" aria-label={names[viewerSeat] || t(lang, 'you')}>
          {view.hand.map((card) => {
            const disabled = passMode ? !view.canPass : !view.canAct || !view.legal.includes(card);
            return (
              <PlayingCard
                key={card}
                card={card}
                lang={lang}
                selected={selected.includes(card)}
                disabled={disabled}
                legal={passMode ? view.canPass : view.legal.includes(card)}
                hint={hintCard === card}
                title={
                  disabled && !passMode
                    ? illegalReason(view, card, lang)
                    : passMode
                      ? t(lang, 'passChosen', { n: selected.length })
                      : undefined
                }
                onClick={() => onCard(card)}
              />
            );
          })}
        </div>
        {passMode && view.passSelected && (
          <p className="hand-note">{t(lang, 'waitingOthers')}</p>
        )}
        {playMode && !view.canAct && (
          <p className="hand-note">{t(lang, 'turnOf', { name: names[view.turn] || t(lang, 'playerN', { n: view.turn + 1 }) })}</p>
        )}
      </div>
    </div>
  );
}
