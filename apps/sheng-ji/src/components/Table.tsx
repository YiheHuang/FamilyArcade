import type { BidOption, DealResult, Declaration, PlayedCard, Team, TrumpSuit } from '../game/sheng-ji';
import { teamOf, type NormalRank } from '../game/sheng-ji';
import { suitName, t, type Lang } from '../i18n';
import { CardBack, CardFace } from './Cards';

export type RelativePosition = 'bottom' | 'left' | 'top' | 'right';

export function relativePosition(seat: number, viewerSeat: number): RelativePosition {
  const offset = (seat - viewerSeat + 4) % 4;
  if (offset === 0) return 'bottom';
  if (offset === 1) return 'left';
  if (offset === 2) return 'top';
  return 'right';
}

export function SeatBadge({
  seat,
  name,
  count,
  position,
  active,
  declarer,
  isYou,
  isAI,
  bidStrength,
  lastWinner,
  lang,
  thinking,
}: {
  seat: number;
  name: string;
  count: number;
  position: RelativePosition;
  active: boolean;
  declarer: boolean;
  isYou: boolean;
  isAI: boolean;
  bidStrength: number | null;
  lastWinner: boolean;
  lang: Lang;
  thinking?: boolean;
}) {
  return (
    <div
      className={`seat-badge pos-${position} team-${teamOf(seat)} ${active ? 'active' : ''} ${declarer ? 'is-declarer' : ''} ${isYou ? 'is-you' : ''}`}
      data-seat={seat}
      data-active={active ? 'true' : 'false'}
    >
      <div className="seat-name-line">
        <span className="seat-name">{name}</span>
        {isYou && <span className="you-chip">{t(lang, 'you')}</span>}
        {isAI && <span className="ai-chip">{t(lang, 'aiTag')}</span>}
      </div>
      <div className="seat-meta">
        <span className="seat-count">{t(lang, 'cardCount', { n: count })}</span>
        {declarer && <span className="declarer-chip">{t(lang, 'declarer')}</span>}
        {bidStrength !== null && <span className="bid-chip">{'★'.repeat(bidStrength)}</span>}
        {lastWinner && <span className="last-winner-chip">●</span>}
        {thinking && <span className="thinking-dot">…</span>}
      </div>
    </div>
  );
}

export function TrickArea({
  lang,
  viewerSeat,
  current,
  last,
  trickCount,
  turnName,
  points,
  names,
}: {
  lang: Lang;
  viewerSeat: number;
  current: PlayedCard[];
  last: PlayedCard[] | null;
  trickCount: number;
  turnName: string;
  points: number;
  names: string[];
}) {
  const plays = current.length > 0 ? current : last ?? [];
  const showingLast = current.length === 0 && last !== null;
  return (
    <div
      className={`trick-area ${current.length > 0 ? 'has-trick' : 'empty-trick'}`}
      aria-label={t(lang, 'trickArea')}
      data-trick-count={current.length}
    >
      {plays.length === 0 ? (
        <div className="trick-empty">
          <span className="trick-watermark" aria-hidden="true">
            ♠
          </span>
          <span className="trick-caption">{t(lang, 'newTrick')}</span>
          <strong>{t(lang, 'leadBy', { name: turnName })}</strong>
        </div>
      ) : (
        <>
          {plays.map((play) => {
            const position = relativePosition(play.seat, viewerSeat);
            return (
              <div key={`${play.seat}-${play.cards.map((card) => card.id).join('-')}`} className={`trick-play pos-${position}`}>
                <span className="trick-seat-label">{names[play.seat] ?? ''}</span>
                <div className="trick-cards">
                  {play.cards.map((card, index) => (
                    <CardFace
                      key={card.id}
                      card={card}
                      lang={lang}
                      size="trick"
                      index={index}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {showingLast && <span className="last-trick-label">{t(lang, 'lastTrick')}</span>}
          <div className="trick-center">
            <span>{t(lang, 'trickLabel', { n: trickCount })}</span>
            {points > 0 && <strong>{t(lang, 'trickPoints', { n: points })}</strong>}
          </div>
        </>
      )}
    </div>
  );
}

export function Scoreboard({
  lang,
  teamNames,
  levels,
  points,
  declarerTeam,
  trump,
  levelRank,
}: {
  lang: Lang;
  teamNames: [string, string];
  levels: [number, number];
  points: [number, number];
  declarerTeam: Team | null;
  trump: TrumpSuit | null;
  levelRank: NormalRank;
}) {
  return (
    <section className="scoreboard" aria-label={t(lang, 'scoreboard')}>
      {([0, 1] as Team[]).map((team) => (
        <div
          key={team}
          className={`team-score team-${team} ${declarerTeam === team ? 'is-declarer' : ''}`}
        >
          <div className="team-head">
            <span className="team-name">{teamNames[team]}</span>
            {declarerTeam === team && <span className="team-role">{t(lang, 'declarerTeam')}</span>}
            {declarerTeam !== null && declarerTeam !== team && (
              <span className="team-role muted">{t(lang, 'defenders')}</span>
            )}
          </div>
          <div className="team-main">
            <span className="team-level" title={t(lang, 'teamLevel', { rank: levelLabelText(levels[team]) })}>
              <small>{t(lang, 'levelShort')}</small>
              <strong>{levelLabelText(levels[team])}</strong>
            </span>
            <span className="team-points">
              <strong>{points[team]}</strong>
              <small>{t(lang, 'pointsShort')}</small>
            </span>
            {declarerTeam === team && (
              <span className="team-target">{t(lang, 'progressTo80', { n: Math.min(80, points[team]) })}</span>
            )}
          </div>
          <div className="level-dots" aria-hidden="true">
            {Array.from({ length: 13 }, (_, index) => (
              <i key={index} className={index <= levels[team] ? 'filled' : ''} />
            ))}
          </div>
        </div>
      ))}
      <div className="trump-bug">
        <span>{t(lang, 'trump')}</span>
        <strong>{trumpLabel(lang, trump, levelRank)}</strong>
      </div>
    </section>
  );
}

export function levelLabelText(level: number): string {
  return ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'][
    Math.max(0, Math.min(12, level))
  ];
}

export function trumpLabel(lang: Lang, trump: TrumpSuit | null, levelRank: NormalRank): string {
  if (!trump) return t(lang, 'none');
  if (trump === 'NT') return t(lang, 'noTrump');
  return `${suitName(lang, trump)} · ${levelRank}`;
}

export function PrivacyGate({
  lang,
  name,
  onReveal,
}: {
  lang: Lang;
  name: string;
  onReveal: () => void;
}) {
  return (
    <div className="privacy-gate" data-testid="privacy-gate">
      <div className="cover-backs" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <CardBack key={index} lang={lang} index={index} />
        ))}
      </div>
      <span className="privacy-kicker">{t(lang, 'privacyTitle')}</span>
      <strong>{t(lang, 'privacyTo', { name })}</strong>
      <p>{t(lang, 'revealHint')}</p>
      <button type="button" className="primary" onClick={onReveal} data-testid="reveal-hand">
        {t(lang, 'reveal')}
      </button>
    </div>
  );
}

function bidLabel(lang: Lang, option: BidOption): string {
  if (option.kind === 'nt') return t(lang, 'declareNt');
  const suit = suitName(lang, option.suit as 'S' | 'H' | 'D' | 'C');
  if (option.strength === 2) {
    return t(lang, 'declarePair', { suit, rank: option.cards.length > 0 ? levelRankFromCard(option.cards[0]) : '' });
  }
  return t(lang, 'declareSuit', { suit, card: option.cards.length > 0 ? levelRankFromCard(option.cards[0]) : '' });
}

function levelRankFromCard(id: string): string {
  const match = /^[SHDC](10|[2-9JQKA])-/.exec(id);
  return match?.[1] ?? '';
}

function declarationLabel(lang: Lang, declaration: Declaration): string {
  if (declaration.kind === 'nt') return t(lang, 'noTrumpBid');
  const suit = suitName(lang, declaration.suit as 'S' | 'H' | 'D' | 'C');
  const rank = levelRankFromCard(declaration.cards[0] ?? '');
  return `${suit} ${rank}${declaration.strength === 2 ? ' ×2' : ''}`;
}

export function DeclarePanel({
  lang,
  options,
  current,
  names,
  canAct,
  hintOption,
  hintPass,
  onDeclare,
  onPass,
}: {
  lang: Lang;
  options: BidOption[];
  current: Declaration | null;
  names: string[];
  canAct: boolean;
  hintOption: BidOption | null;
  hintPass: boolean;
  onDeclare: (option: BidOption) => void;
  onPass: () => void;
}) {
  return (
    <section className="phase-panel declare-panel" data-testid="declare-panel">
      <div className="phase-head">
        <span className="phase-kicker">{t(lang, 'statusDeclare')}</span>
        <h3>{t(lang, 'declareTitle')}</h3>
      </div>
      <p className="phase-copy">{t(lang, 'declarePrompt')}</p>
      <div className="current-bid">
        <span>{t(lang, 'currentBid')}</span>
        <strong>
          {current
            ? t(lang, 'bidBy', {
                name: names[current.seat] ?? '',
                bid: declarationLabel(lang, current),
              })
            : t(lang, 'noBid')}
        </strong>
      </div>
      {canAct ? (
        <div className="declare-options">
          {options.map((option) => {
            const hinted =
              hintOption !== null &&
              hintOption.kind === option.kind &&
              hintOption.suit === option.suit &&
              hintOption.strength === option.strength;
            return (
              <button
                key={`${option.kind}-${option.suit}-${option.strength}`}
                type="button"
                className={`declare-option ${hinted ? 'hinted' : ''}`}
                onClick={() => onDeclare(option)}
              >
                <span className="declare-label">{bidLabel(lang, option)}</span>
                <span className="declare-strength">
                  {t(
                    lang,
                    option.strength === 1
                      ? 'bidStrength1'
                      : option.strength === 2
                        ? 'bidStrength2'
                        : 'bidStrength3',
                  )}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className={`secondary pass-declare-button ${hintPass ? 'hinted' : ''}`}
            onClick={onPass}
          >
            {t(lang, 'pass')}
          </button>
        </div>
      ) : (
        <p className="phase-wait">{t(lang, 'waitingDeclare')}</p>
      )}
    </section>
  );
}

export function BuryPanel({
  lang,
  selected,
  selectedPoints,
  canAct,
  hintSelected,
  onBury,
  onHint,
}: {
  lang: Lang;
  selected: number;
  selectedPoints: number;
  canAct: boolean;
  hintSelected: boolean;
  onBury: () => void;
  onHint: () => void;
}) {
  return (
    <section className="phase-panel bury-panel" data-testid="bury-panel">
      <div className="phase-head">
        <span className="phase-kicker">{t(lang, 'statusBury')}</span>
        <h3>{t(lang, 'buryTitle')}</h3>
      </div>
      <p className="phase-copy">{t(lang, 'buryPrompt')}</p>
      <p className="bury-count">{t(lang, 'buryCount', { n: selected })}</p>
      <p className="bury-points">{t(lang, 'buryPointsChosen', { n: selectedPoints })}</p>
      {canAct ? (
        <div className="bury-actions">
          <button type="button" className="primary bury-button" disabled={selected !== 8} onClick={onBury}>
            {t(lang, 'buryButton')}
          </button>
          <button type="button" className={`ghost ${hintSelected ? 'hinted' : ''}`} onClick={onHint}>
            {t(lang, 'hint')}
          </button>
        </div>
      ) : (
        <p className="phase-wait">{t(lang, 'waitingBury')}</p>
      )}
    </section>
  );
}

export function ResultPanel({
  lang,
  result,
  names,
  isGuest,
  canNext,
  onNext,
  onHome,
}: {
  lang: Lang;
  result: DealResult;
  names: string[];
  isGuest: boolean;
  canNext: boolean;
  onNext: () => void;
  onHome: () => void;
}) {
  const declarerTeamName = teamNamesFor(names)[result.declarerTeam];
  const defenderTeamName = teamNamesFor(names)[result.declarerTeam === 0 ? 1 : 0];
  const change =
    result.jump === 0
      ? t(lang, 'noJump')
      : result.jump === 3
        ? t(lang, 'jumpThree')
        : t(lang, 'jumpOne');
  const reason =
    result.reason === 'made'
      ? t(lang, 'dealMade')
      : result.reason === 'held'
        ? t(lang, 'dealHeld')
        : result.reason === 'shutout'
          ? t(lang, 'dealShutout')
          : t(lang, 'dealDefenders');
  return (
    <section className="result-panel" aria-live="polite" data-testid="result-panel">
      <span className="result-kicker">{t(lang, 'dealResult')}</span>
      <h3>{t(lang, 'dealResultTitle', { n: result.deal })}</h3>
      <div className="result-score-row">
        <div className={`result-team team-${result.declarerTeam} ${result.success ? 'winner' : ''}`}>
          <span>{declarerTeamName}</span>
          <strong>{result.declarerPoints}</strong>
          <small>{t(lang, 'declarerTeam')} · {t(lang, 'target80')}</small>
        </div>
        <div className="result-vs">vs</div>
        <div className={`result-team team-${result.declarerTeam === 0 ? 1 : 0} ${result.success ? '' : 'winner'}`}>
          <span>{defenderTeamName}</span>
          <strong>{result.defenderPoints}</strong>
          <small>{t(lang, 'defenders')}</small>
        </div>
      </div>
      <p className="result-reason">{reason}</p>
      <div className="result-facts">
        <span>{t(lang, 'availablePoints', { n: result.availablePoints })}</span>
        <span>{t(lang, 'buriedPoints', { n: result.buriedPoints })}</span>
        <span>{t(lang, 'upgradeLine', { team: teamNamesFor(names)[result.upgradeTeam], change })}</span>
      </div>
      {result.matchWinner !== null && (
        <div className="match-winner">
          <span>{t(lang, 'matchOver')}</span>
          <strong>{t(lang, 'matchWinner', { team: teamNamesFor(names)[result.matchWinner] })}</strong>
        </div>
      )}
      <div className="result-actions">
        {result.matchWinner !== null ? (
          <button type="button" className="primary" onClick={onHome}>
            {t(lang, 'newMatch')}
          </button>
        ) : isGuest ? (
          <span className="wait-pill">{t(lang, 'waitHostNext')}</span>
        ) : (
          <button type="button" className="primary next-deal-button" onClick={onNext} disabled={!canNext}>
            {t(lang, 'nextDeal')}
          </button>
        )}
        {result.matchWinner === null && (
          <button type="button" className="text-button" onClick={onHome}>
            {t(lang, 'home')} →
          </button>
        )}
      </div>
    </section>
  );
}

export function teamNamesFor(names: string[]): [string, string] {
  return [
    `${names[0] ?? ''} + ${names[2] ?? ''}`,
    `${names[1] ?? ''} + ${names[3] ?? ''}`,
  ];
}
