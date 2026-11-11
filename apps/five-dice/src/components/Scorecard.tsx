import type { CSSProperties } from 'react';
import {
  CATEGORIES,
  UPPER_BONUS,
  UPPER_TARGET,
  type SeatView,
} from '../game/five-dice';
import {
  CATEGORY_DESC_KEYS,
  CATEGORY_KEYS,
  t,
  type Lang,
} from '../i18n';

export function Scorecard({
  view,
  lang,
  interactive,
  hintCategory,
  onScore,
}: {
  view: SeatView;
  lang: Lang;
  interactive: boolean;
  hintCategory: number | null;
  onScore: (category: number) => void;
}) {
  const playerCount = view.players.length;
  const style = { '--players': playerCount } as CSSProperties;
  const colorVars = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];
  const cellStyle = (seat: number) => ({ '--pc': colorVars[seat] ?? colorVars[0] }) as CSSProperties;
  const open = new Set(view.open);
  const active = view.status === 'over' ? -1 : view.turn;

  const scoreCells = (index: number, highlightable: boolean) => (
    <span className="score-cells">
      {view.players.map((_player, seat) => {
        const value = view.scores[seat][index];
        const isLast = view.last?.player === seat && CATEGORIES[index] === view.last?.category;
        return (
          <span
            key={seat}
            className={[
              'score-cell',
              seat === active ? 'active' : '',
              value !== null ? 'filled' : '',
              isLast ? 'last-score' : '',
              highlightable && seat === active && value === null ? 'open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={cellStyle(seat)}
          >
            {value === null ? <span className="blank-dot">·</span> : value}
          </span>
        );
      })}
    </span>
  );

  return (
    <div className="scorecard-wrap">
      <div className="scorecard-head">
        <div>
          <p className="scorecard-kicker">{t(lang, 'scorecard')}</p>
          <h2>{t(lang, 'roundShort', { n: Math.min(13, Math.floor(view.turnCount / playerCount) + 1) })}</h2>
        </div>
        <span className="bonus-target">{t(lang, 'bonusRule')}</span>
      </div>
      <div className="scorecard" style={style} aria-label={t(lang, 'a11yTable')}>
        <div className="score-row players-row">
          <span className="cat-name" />
          {view.players.map((player, seat) => (
            <span
              key={seat}
              className={`player-head ${seat === active ? 'active' : ''}`}
              style={{ '--pc': `var(--p${seat + 1})` } as CSSProperties}
            >
              <span className="player-pip" />
              <span className="player-name">{player.name}</span>
              {player.ai && <span className="ai-tag">{player.level ? t(lang, player.level) : 'AI'}</span>}
            </span>
          ))}
        </div>

        <div className="section-band">
          <span>{t(lang, 'upper')}</span>
          <span className="band-note">{t(lang, 'bonusRule')}</span>
        </div>

        {CATEGORIES.slice(0, 6).map((category, index) => {
          const available = interactive && open.has(index);
          return (
            <button
              key={category}
              type="button"
             
              className={[
                'score-row',
                'category-row',
                index % 2 === 1 ? 'shaded' : '',
                available ? 'available' : '',
                hintCategory === index ? 'hinted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!available}
              onClick={() => onScore(index)}
              title={t(lang, CATEGORY_DESC_KEYS[category])}
              aria-label={t(lang, 'a11yScoreRow', {
                category: t(lang, CATEGORY_KEYS[category]),
                scores: view.scores.map((line) => line[index] ?? t(lang, 'a11yOpen')).join(', '),
              })}
            >
              <span className="cat-name">
                <strong>{t(lang, CATEGORY_KEYS[category])}</strong>
                <small>{t(lang, CATEGORY_DESC_KEYS[category])}</small>
              </span>
              {scoreCells(index, true)}
            </button>
          );
        })}

        <div className="score-row subtotal-row">
          <span className="cat-name">
            <strong>{t(lang, 'upper')}</strong>
            <small>{t(lang, 'subtotal')}</small>
          </span>
          <span className="score-cells">
            {view.totals.map((total, seat) => (
              <span key={seat} className={`score-cell ${seat === active ? 'active' : ''}`} style={cellStyle(seat)}>
                {total.upper}
              </span>
            ))}
          </span>
        </div>
        <div className="score-row bonus-row">
          <span className="cat-name">
            <strong>{t(lang, 'bonus')}</strong>
            <small>
              {UPPER_TARGET} / +{UPPER_BONUS}
            </small>
          </span>
          <span className="score-cells">
            {view.totals.map((total, seat) => (
              <span key={seat} className={`score-cell bonus ${total.bonus ? 'won' : ''}`} style={cellStyle(seat)}>
                {total.bonus ? `+${total.bonus}` : '—'}
              </span>
            ))}
          </span>
        </div>

        <div className="section-band">
          <span>{t(lang, 'lower')}</span>
        </div>

        {CATEGORIES.slice(6).map((category, offset) => {
          const index = offset + 6;
          const available = interactive && open.has(index);
          return (
            <button
              key={category}
              type="button"
             
              className={[
                'score-row',
                'category-row',
                index % 2 === 0 ? 'shaded' : '',
                available ? 'available' : '',
                hintCategory === index ? 'hinted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={!available}
              onClick={() => onScore(index)}
              title={t(lang, CATEGORY_DESC_KEYS[category])}
              aria-label={t(lang, 'a11yScoreRow', {
                category: t(lang, CATEGORY_KEYS[category]),
                scores: view.scores.map((line) => line[index] ?? t(lang, 'a11yOpen')).join(', '),
              })}
            >
              <span className="cat-name">
                <strong>{t(lang, CATEGORY_KEYS[category])}</strong>
                <small>{t(lang, CATEGORY_DESC_KEYS[category])}</small>
              </span>
              {scoreCells(index, true)}
            </button>
          );
        })}

        <div className="score-row total-row">
          <span className="cat-name">
            <strong>{t(lang, 'grandTotal')}</strong>
            <small>
              {t(lang, 'upper')} + {t(lang, 'lower')}
            </small>
          </span>
          <span className="score-cells">
            {view.totals.map((total, seat) => (
              <span key={seat} className={`score-cell ${seat === active ? 'active' : ''}`} style={cellStyle(seat)}>
                {total.total}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

