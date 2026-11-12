import { useEffect, useMemo } from 'react';
import type {
  Action,
  ActionRecord,
  Card,
  HandCategory,
  PublicPlayerView,
  SeatView,
} from '../game/texas-holdem';
import { handName, streetName, t, type Lang } from '../i18n';
import { formatChips } from '../format';
import { BestFive, CardBack, CardFace, CardRow } from './Cards';

export interface SeatDisplay {
  name: string;
  player: PublicPlayerView;
  isAI: boolean;
  isYou: boolean;
  active: boolean;
  winner: boolean;
  handCategory: HandCategory | null;
  cards: Card[];
  showCards: boolean;
}

function actionText(lang: Lang, action: ActionRecord | null): string {
  if (!action) return '';
  switch (action.type) {
    case 'fold':
      return t(lang, 'actionFold');
    case 'check':
      return t(lang, 'actionCheck');
    case 'call':
      return t(lang, 'actionCallAmount', { n: formatChips(lang, action.amount) });
    case 'bet':
      return t(lang, 'actionBetTo', { n: formatChips(lang, action.to) });
    case 'raise':
      return t(lang, 'actionRaiseTo', { n: formatChips(lang, action.to) });
    case 'all-in':
      return t(lang, 'actionAllInAmount', { n: formatChips(lang, action.to) });
    default:
      return '';
  }
}

export function SeatBadge({
  lang,
  display,
}: {
  lang: Lang;
  display: SeatDisplay;
}) {
  const { player, name, isYou, active, winner, cards, showCards, handCategory } = display;
  const seatClass = `seat seat-pos-${player.seat} ${active ? 'active' : ''} ${winner ? 'winner' : ''} ${player.folded ? 'folded' : ''} ${player.allIn ? 'all-in' : ''}`;
  return (
    <div
      className={seatClass}
      data-seat={player.seat}
      data-active={active ? 'true' : 'false'}
      data-testid={`seat-${player.seat}`}
    >
      <div className="seat-head">
        <span className="seat-name">{name}</span>
        <span className="seat-tags">
          {isYou && name !== t(lang, 'you') && (
            <span className="tag you-tag">{t(lang, 'youTag')}</span>
          )}
          {player.dealer && <span className="tag dealer-tag">{t(lang, 'dealerShort')}</span>}
          {player.smallBlind && !player.dealer && (
            <span className="tag blind-tag">{t(lang, 'smallBlindShort')}</span>
          )}
          {player.bigBlind && <span className="tag blind-tag">{t(lang, 'bigBlindShort')}</span>}
          {player.allIn && <span className="tag allin-tag">{t(lang, 'allInTag')}</span>}
        </span>
      </div>
      <div className="seat-cards" aria-label={t(lang, 'handCountLabel', { n: player.cardCount })}>
        {player.cardCount > 0 &&
          (showCards && cards.length === 2 ? (
            cards.map((card) => <CardFace key={`${card.rank}${card.suit}`} card={card} lang={lang} size="mini" />)
          ) : (
            <>
              <CardBack lang={lang} size="mini" />
              <CardBack lang={lang} size="mini" />
            </>
          ))}
        {player.folded && <span className="muck-mark">{t(lang, 'foldedTag')}</span>}
      </div>
      <div className="seat-bottom">
        <span className="seat-stack">
          {formatChips(lang, player.stack)}
          <small>{t(lang, 'chipUnit')}</small>
        </span>
        <span className={`seat-bet ${player.streetBet > 0 ? 'has-bet' : ''}`}>
          {player.streetBet > 0 ? formatChips(lang, player.streetBet) : ''}
        </span>
      </div>
      <div className="seat-last">
        {handCategory && winner ? (
          <strong>{handName(lang, handCategory)}</strong>
        ) : (
          actionText(lang, player.lastAction)
        )}
      </div>
    </div>
  );
}

export function PokerTable({
  lang,
  view,
  seats,
  hintSeat,
}: {
  lang: Lang;
  view: SeatView;
  seats: SeatDisplay[];
  hintSeat?: number | null;
}) {
  const activeName = seats.find((seat) => seat.player.seat === view.turn)?.name ?? '';
  const status = view.sessionOver
    ? t(lang, 'sessionOver')
    : view.phase === 'showdown'
      ? view.result?.showdown
        ? t(lang, 'showdownTitle')
        : t(lang, 'handOver')
      : view.phase === 'session-over'
        ? t(lang, 'sessionOver')
        : activeName
          ? t(lang, 'turnOf', { name: activeName })
          : t(lang, 'thinking');
  return (
    <div
      className={`poker-table seats-${view.players.length}`}
      aria-label={t(lang, 'tableLabel')}
      data-phase={view.phase}
      data-turn={view.turn}
      data-seats={view.players.length}
      data-testid="table"
    >
      <div className="felt">
        <div className="felt-topline">
          <span>{t(lang, 'handNumber', { n: view.handNumber })}</span>
          <span className="felt-blinds">{t(lang, 'blindLevel')}</span>
          <span>{streetName(lang, view.phase)}</span>
        </div>
        {seats.map((display) => (
          <SeatBadge key={display.player.seat} lang={lang} display={display} />
        ))}
        <div className="table-centre">
          <div className="board-wrap">
            <CardRow cards={view.board} lang={lang} label={t(lang, 'boardLabel')} />
          </div>
          <div className="pot-badge" data-testid="pot">
            <span>{t(lang, 'pot')}</span>
            <strong>{formatChips(lang, view.pot)}</strong>
            <small>{t(lang, 'chipUnit')}</small>
          </div>
          <div className="table-status" aria-live="polite">
            {status}
            {hintSeat !== null && hintSeat !== undefined && (
              <span className="hint-chip" aria-hidden="true">
                {t(lang, 'hint')}
              </span>
            )}
          </div>
        </div>
        <div className="felt-bottomline">
          <span>{t(lang, 'currentStreet', { street: streetName(lang, view.phase) })}</span>
          <span>{t(lang, 'playMoneyTitle')}</span>
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ActionDock({
  lang,
  view,
  raiseTo,
  setRaiseTo,
  hintType,
  onAction,
}: {
  lang: Lang;
  view: SeatView;
  raiseTo: number;
  setRaiseTo: (value: number) => void;
  hintType: Action['type'] | null;
  onAction: (action: Action) => void;
}) {
  const legal = view.legal;
  const canOpen = legal.canBet;
  const canRaise = legal.canRaise;
  const hasSlider = canOpen || canRaise;
  const min = canOpen ? legal.minBetTo : legal.minRaiseTo;
  const max = legal.maxTo;
  const safeRaise = clamp(raiseTo || min, min, Math.max(min, max));
  const pot = Math.max(1, view.pot);
  const presets = useMemo(() => {
    const values = [0.5, 0.75, 1].map((fraction) => {
      const desired = Math.round(pot * fraction);
      if (canOpen) return clamp(desired, legal.minBetTo, legal.maxTo);
      return clamp(view.currentBet + Math.max(view.minRaise, desired), legal.minRaiseTo, legal.maxTo);
    });
    return Array.from(new Set(values)).filter((value) => value >= min && value <= max);
  }, [canOpen, legal.maxTo, legal.minBetTo, legal.minRaiseTo, max, min, pot, view.currentBet, view.minRaise]);

  useEffect(() => {
    if (!hasSlider) return;
    if (raiseTo < min || raiseTo > max) setRaiseTo(safeRaise);
  }, [hasSlider, max, min, raiseTo, safeRaise, setRaiseTo]);

  const callAllIn = legal.callAmount >= view.players[view.seat]?.stack;
  const actionButton = canOpen
    ? t(lang, 'betAmount', { n: formatChips(lang, safeRaise) })
    : t(lang, 'raiseTo', { n: formatChips(lang, safeRaise) });
  const foldHint = hintType === 'fold';
  const callHint = hintType === 'call' || hintType === 'check';
  const raiseHint = hintType === 'bet' || hintType === 'raise';
  const allInHint = hintType === 'all-in';

  return (
    <div className="action-dock" data-testid="action-dock">
      <div className="action-facts">
        {legal.callAmount > 0 && (
          <span>
            {t(lang, 'toCall')} <b>{formatChips(lang, legal.callAmount)}</b>
          </span>
        )}
        <span>
          {t(lang, 'pot')} <b>{formatChips(lang, view.pot)}</b>
        </span>
        {legal.callAmount > 0 && (
          <span>
            {t(lang, 'winChance')} <b>{Math.round(view.potOdds * 100)}%</b>
          </span>
        )}
      </div>
      {hasSlider && (
        <div className="raise-panel">
          <label className="raise-label">
            <span>{t(lang, 'raiseSlider')}</span>
            <b>{formatChips(lang, safeRaise)}</b>
          </label>
          <input
            type="range"
            min={min}
            max={Math.max(min, max)}
            step={1}
            value={safeRaise}
            onChange={(event) => setRaiseTo(Number(event.target.value))}
            data-testid="raise-slider"
            aria-label={t(lang, 'raiseSlider')}
          />
          <div className="preset-row">
            {presets.map((value, index) => (
              <button
                type="button"
                key={value}
                className={`preset ${safeRaise === value ? 'selected' : ''}`}
                onClick={() => setRaiseTo(value)}
                data-testid={`preset-${index}`}
              >
                {index === 0
                  ? t(lang, 'halfPot')
                  : index === 1
                    ? t(lang, 'threeQuarterPot')
                    : t(lang, 'potBet')}
                <small>{formatChips(lang, value)}</small>
              </button>
            ))}
            <button
              type="button"
              className="preset"
              onClick={() => setRaiseTo(legal.maxTo)}
              data-testid="preset-allin"
            >
              {t(lang, 'allInPreset')}
              <small>{formatChips(lang, legal.maxTo)}</small>
            </button>
          </div>
        </div>
      )}
      <div className="action-row">
        <button
          type="button"
          className={`action-btn fold ${foldHint ? 'hinted' : ''}`}
          onClick={() => onAction({ type: 'fold' })}
          data-testid="action-fold"
        >
          {t(lang, 'fold')}
          <kbd>F</kbd>
        </button>
        {legal.canCheck ? (
          <button
            type="button"
            className={`action-btn check ${callHint ? 'hinted' : ''}`}
            onClick={() => onAction({ type: 'check' })}
            data-testid="action-check"
          >
            {t(lang, 'check')}
            <kbd>C</kbd>
          </button>
        ) : (
          <button
            type="button"
            className={`action-btn call ${callHint ? 'hinted' : ''}`}
            onClick={() => onAction({ type: 'call' })}
            disabled={!legal.canCall}
            data-testid="action-call"
          >
            {callAllIn
              ? t(lang, 'callAllIn', { n: formatChips(lang, legal.callAmount) })
              : t(lang, 'callAmount', { n: formatChips(lang, legal.callAmount) })}
            <kbd>C</kbd>
          </button>
        )}
        {(canOpen || canRaise) && (
          <button
            type="button"
            className={`action-btn raise ${raiseHint ? 'hinted' : ''}`}
            onClick={() =>
              onAction({ type: canOpen ? 'bet' : 'raise', amount: safeRaise })
            }
            data-testid="action-raise"
          >
            {actionButton}
            <kbd>B</kbd>
          </button>
        )}
        {legal.canAllIn && (legal.canBet || legal.canRaise) && (
          <button
            type="button"
            className={`action-btn all-in ${allInHint ? 'hinted' : ''}`}
            onClick={() => onAction({ type: 'all-in' })}
            data-testid="action-all-in"
          >
            {legal.allInTo > view.currentBet
              ? t(lang, 'allInAmount', { n: formatChips(lang, legal.allInTo) })
              : t(lang, 'allIn')}
            <kbd>A</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

export function HandRail({
  lang,
  view,
}: {
  lang: Lang;
  view: SeatView;
}) {
  if (view.hand.length === 0) return null;
  return (
    <div className="hand-rail" data-testid="hole-cards">
      <div className="hand-rail-cards">
        {view.hand.map((card) => (
          <CardFace key={`${card.rank}${card.suit}`} card={card} lang={lang} size="hero" />
        ))}
      </div>
      <div className="hand-rail-copy">
        <span className="label">{t(lang, 'handRank')}</span>
        <strong>
          {view.handName
            ? handName(lang, view.handName)
            : view.board.length < 3
              ? t(lang, 'noHandYet')
              : t(lang, 'highCard')}
        </strong>
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
    <div className="table-curtain" data-testid="curtain">
      <div className="curtain-card">
        <div className="curtain-back">
          <CardBack lang={lang} size="hero" />
          <CardBack lang={lang} size="hero" />
        </div>
        <strong>{t(lang, 'turnOf', { name })}</strong>
        <button type="button" className="primary" onClick={onReveal} data-testid="show-hand">
          {t(lang, 'handLabel')}
        </button>
      </div>
    </div>
  );
}

function signed(lang: Lang, value: number): string {
  return `+${formatChips(lang, value)}`;
}

export function ResultSheet({
  lang,
  view,
  seats,
  canContinue,
  canManage,
  showWait,
  heroOut = false,
  onNext,
  onNewTable,
  onSetup,
  onHome,
}: {
  lang: Lang;
  view: SeatView;
  seats: SeatDisplay[];
  canContinue: boolean;
  canManage: boolean;
  showWait: boolean;
  heroOut?: boolean;
  onNext: () => void;
  onNewTable: () => void;
  onSetup: () => void;
  onHome: () => void;
}) {
  const result = view.result;
  if (!result) return null;
  const winnerNames = result.winners.map(
    (seat) => seats.find((item) => item.player.seat === seat)?.name ?? t(lang, 'none'),
  );
  const sessionOver = view.sessionOver;
  const champion = view.champion;
  return (
    <div className="sheet-layer" data-testid={sessionOver ? 'session-over' : 'hand-result'}>
      <div className="sheet-card result-sheet">
        <span className="sheet-kicker">
          {sessionOver
            ? t(lang, 'sessionOver')
            : heroOut
              ? t(lang, 'sessionOver')
              : result.showdown
                ? t(lang, 'showdownTitle')
                : t(lang, 'handOver')}
        </span>
        {sessionOver ? (
          <strong className="sheet-headline">
            {champion === null
              ? t(lang, 'sessionOver')
              : t(lang, 'sessionWinner', {
                  name: seats.find((item) => item.player.seat === champion)?.name ?? t(lang, 'none'),
                })}
          </strong>
        ) : heroOut ? (
          <strong className="sheet-headline">{t(lang, 'heroOut')}</strong>
        ) : result.winners.length === 1 ? (
          <strong className="sheet-headline">
            {result.showdown && result.handNames[result.winners[0]]
              ? t(lang, 'winsWith', {
                  name: winnerNames[0],
                  pot: formatChips(lang, result.pot),
                  hand: handName(lang, result.handNames[result.winners[0]]),
                })
              : t(lang, 'winsPot', {
                  name: winnerNames[0],
                  pot: formatChips(lang, result.pot),
                })}
          </strong>
        ) : (
          <strong className="sheet-headline">
            {result.showdown && result.handNames[result.winners[0]]
              ? t(lang, 'splitWith', {
                  names: winnerNames.join(' · '),
                  hand: handName(lang, result.handNames[result.winners[0]]),
                })
              : t(lang, 'splitPot', { names: winnerNames.join(' · ') })}
          </strong>
        )}

        <div className="result-pots">
          {result.pots.map((pot, index) => (
            <div className="pot-row" key={`${pot.amount}-${index}`}>
              <span>{t(lang, 'potValue', { n: formatChips(lang, pot.amount) })}</span>
              <span>
                {pot.winners
                  .map(
                    (seat) =>
                      seats.find((item) => item.player.seat === seat)?.name ?? t(lang, 'none'),
                  )
                  .join(' · ')}
              </span>
              {pot.uncalled && <small>{t(lang, 'uncalledReturn', { n: formatChips(lang, pot.amount) })}</small>}
            </div>
          ))}
        </div>

        <div className="payout-list">
          {result.payouts.map((payout) => (
            <div className={`payout-row ${payout.refund ? 'refund' : ''}`} key={payout.seat}>
              <span>
                {seats.find((item) => item.player.seat === payout.seat)?.name ?? t(lang, 'none')}
                {payout.hand ? ` · ${handName(lang, payout.hand)}` : ''}
              </span>
              <strong>{signed(lang, payout.amount)}</strong>
            </div>
          ))}
        </div>

        {result.showdown && (
          <div className="showdown-grid">
            {result.winners.map((seat) => {
              const cards = result.bestFive[seat] ?? [];
              if (cards.length === 0) return null;
              return (
                <div className="showdown-hand" key={seat}>
                  <span>
                    {seats.find((item) => item.player.seat === seat)?.name ?? t(lang, 'none')}
                  </span>
                  <BestFive cards={cards} lang={lang} />
                </div>
              );
            })}
          </div>
        )}

        {result.oddChips.length > 0 && (
          <p className="odd-chip">
            {t(lang, 'oddChipTo', {
              name:
                seats.find((item) => item.player.seat === result.oddChips[0].seat)?.name ??
                t(lang, 'none'),
            })}
          </p>
        )}

        {(sessionOver || heroOut) && (
          <div className="final-stacks">
            <span className="label">{t(lang, 'finalStacks')}</span>
            <div className="final-stack-grid">
              {seats.map((seat) => (
                <div
                  key={seat.player.seat}
                  className={seat.player.seat === champion ? 'champion' : ''}
                >
                  <span>{seat.name}</span>
                  <strong>{formatChips(lang, seat.player.stack)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="sheet-actions">
          {canContinue && !sessionOver && !heroOut && (
            <button type="button" className="primary" onClick={onNext} data-testid="next-hand">
              {t(lang, 'nextHand')}
            </button>
          )}
          {!canContinue && showWait && !sessionOver && !heroOut && (
            <p className="sheet-wait">{t(lang, 'waitHostNext')}</p>
          )}
          {(sessionOver || heroOut) && canManage && (
            <>
              <button type="button" className="primary" onClick={onNewTable} data-testid="play-again">
                {t(lang, 'playAgain')}
              </button>
              <button type="button" className="secondary" onClick={onSetup} data-testid="change-setup">
                {t(lang, 'changeSetup')}
              </button>
            </>
          )}
          <button type="button" className="text-button" onClick={onHome}>
            {t(lang, 'backHome')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HandStrength({
  lang,
  view,
}: {
  lang: Lang;
  view: SeatView;
}) {
  if (!view.handName) {
    return (
      <div className="strength-card">
        <span className="label">{t(lang, 'handRank')}</span>
        <strong>{view.board.length < 3 ? t(lang, 'noHandYet') : t(lang, 'highCard')}</strong>
      </div>
    );
  }
  return (
    <div className="strength-card">
      <span className="label">{t(lang, 'bestFive')}</span>
      <strong>{handName(lang, view.handName)}</strong>
      {view.bestFive.length === 5 && (
        <BestFive cards={view.bestFive} lang={lang} />
      )}
    </div>
  );
}

export function actionName(lang: Lang, action: Action): string {
  if (action.type === 'fold') return t(lang, 'actionFold');
  if (action.type === 'check') return t(lang, 'actionCheck');
  if (action.type === 'call') return t(lang, 'actionCall');
  if (action.type === 'bet') return t(lang, 'actionBet');
  if (action.type === 'raise') return t(lang, 'actionRaise');
  return t(lang, 'actionAllIn');
}

export function hintActionText(lang: Lang, action: Action): string {
  if (action.type === 'fold') return t(lang, 'hintActionFold');
  if (action.type === 'check') return t(lang, 'hintActionCheck');
  if (action.type === 'call') return t(lang, 'hintActionCall');
  if (action.type === 'bet') return t(lang, 'hintActionBet', { n: formatChips(lang, action.amount ?? 0) });
  if (action.type === 'raise') return t(lang, 'hintActionRaise', { n: formatChips(lang, action.amount ?? 0) });
  return t(lang, 'hintActionAllIn');
}

