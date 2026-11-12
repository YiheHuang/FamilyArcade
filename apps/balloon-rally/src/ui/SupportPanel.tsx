import { useEffect, useState } from 'react';
import { balloonName } from '../game/data';
import type { GameView, Move } from '../game/types';
import type { Lang } from '../i18n';
import { BalloonIcon } from './BalloonIcon';
import { Button, type T } from './components';

export function PrivacyCover({
  name,
  t,
  onOpen,
}: {
  name: string;
  t: T;
  onOpen: () => void;
}) {
  return (
    <div className="privacy-cover" role="dialog" aria-modal="true" aria-label={t('a11y.cover')}>
      <div className="privacy-cover__card">
        <div className="privacy-cover__eye" aria-hidden>
          <svg viewBox="0 0 64 44" width="64" height="44">
            <path
              d="M4 22 C14 6 50 6 60 22 C50 38 14 38 4 22 Z"
              fill="#f4ecdc"
              stroke="#7b7468"
              strokeWidth="2"
            />
            <circle cx="32" cy="22" r="8" fill="#3f4a46" />
            <circle cx="35" cy="19" r="2.4" fill="#fffdf8" />
            <path d="M8 36 L56 8" stroke="#a95340" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </div>
        <p className="eyebrow">{t('game.phaseSupport')}</p>
        <h2>{t('game.privacyTitle', { name })}</h2>
        <p className="muted">{t('game.privacyBody', { name })}</p>
        <Button variant="primary" wide testId="privacy-open" onClick={onOpen}>
          {t('game.privacyOpen', { name })}
        </Button>
        <div className="privacy-cover__dots" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`privacy-dot privacy-dot--${i}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function SupportPanel({
  view,
  t,
  lang,
  hintText,
  thinking,
  onLock,
  onHint,
  onClearHint,
}: {
  view: GameView;
  t: T;
  lang: Lang;
  hintText: string | null;
  thinking: boolean;
  onLock: (move: Move) => void;
  onHint: () => void;
  onClearHint: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [tailwind, setTailwind] = useState(false);
  const seat = view.current >= 0 ? view.seats[view.current] : null;
  const max = Math.max(...view.positions);
  let second = -1;
  for (const p of view.positions) if (p < max && p > second) second = p;

  useEffect(() => {
    setSelected(null);
    setTailwind(false);
  }, [view.round, view.current, view.phase]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key >= '1' && key <= '5' && seat) {
        const index = Number(key) - 1;
        if (index < view.balloons.length) {
          setSelected(index);
          onClearHint();
        }
        event.preventDefault();
      } else if (key === 't') {
        if (view.canTailwind) setTailwind((value) => !value);
        event.preventDefault();
      } else if (key === 'enter' && selected !== null && seat) {
        onLock({ kind: 'support', seat: view.current, balloon: selected, tailwind });
        event.preventDefault();
      } else if (key === 'escape') {
        setSelected(null);
        setTailwind(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClearHint, onLock, seat, selected, tailwind, view.balloons.length, view.canTailwind, view.current]);

  if (!seat) return null;

  const lock = (): void => {
    if (selected === null) return;
    onLock({ kind: 'support', seat: view.current, balloon: selected, tailwind });
  };

  return (
    <div className="support-overlay" role="dialog" aria-modal="true" aria-label={t('a11y.supportPanel')}>
      <div className="support-card">
        <div className="support-card__head">
          <div>
            <p className="eyebrow">{t('game.round', { n: view.round, total: view.rounds })}</p>
            <h2>{t('game.chooseSecret', { name: seat.name })}</h2>
            <p className="muted">{t('game.selectHint')}</p>
          </div>
          <div className="support-card__tokens" aria-label={t('game.tailwindLeft', { n: view.tokensLeft[view.current] })}>
            <span className="muted">{t('game.tokens')}</span>
            <strong>{view.tokensLeft[view.current]}</strong>
          </div>
        </div>

        <div className="balloon-choice-grid">
          {view.balloons.map((balloon, index) => {
            const position = view.positions[index];
            const isLeader = max > 0 && position === max;
            const isSecond = second >= 0 && position === second && position !== max;
            const active = selected === index;
            return (
              <button
                key={balloon.id}
                type="button"
                className={`balloon-choice${active ? ' is-selected' : ''}`}
                aria-pressed={active}
                aria-label={t('a11y.chooseBalloon', { name: balloonName(balloon, lang) })}
                style={{ ['--balloon-color' as string]: balloon.color, ['--balloon-light' as string]: balloon.light }}
                onClick={() => {
                  setSelected(active ? null : index);
                  onClearHint();
                }}
                data-testid={`balloon-choice-${index}`}
              >
                <span className="balloon-choice__num">{index + 1}</span>
                <BalloonIcon balloon={balloon} size={54} />
                <span className="balloon-choice__name">{balloonName(balloon, lang)}</span>
                <span className="balloon-choice__pos">{t('game.position', { n: position })}</span>
                {(isLeader || isSecond) && (
                  <span className={`balloon-choice__badge${isLeader ? ' is-leader' : ''}`}>
                    {isLeader ? t('game.leader') : t('game.second')}
                  </span>
                )}
                {active && <span className="balloon-choice__tick" aria-hidden>✓</span>}
              </button>
            );
          })}
        </div>

        <div className="support-card__row">
          <button
            type="button"
            className={`switch-row${tailwind ? ' is-on' : ''}${!view.canTailwind ? ' is-disabled' : ''}`}
            aria-pressed={tailwind}
            disabled={!view.canTailwind}
            onClick={() => setTailwind((value) => !value)}
            data-testid="tailwind-toggle"
          >
            <span className="switch" aria-hidden>
              <span />
            </span>
            <span className="switch-row__main">
              <strong>{t('game.tailwind')}</strong>
              <small>{view.canTailwind ? t('game.tailwindLeft', { n: view.tokensLeft[view.current] }) : t('game.noTailwind')}</small>
            </span>
          </button>

          <div className="support-card__hint">
            <Button variant="ghost" onClick={onHint} disabled={thinking} testId="hint-button">
              {thinking ? t('game.thinking') : t('game.hint')}
            </Button>
            {hintText && <p className="hint-box">{hintText}</p>}
          </div>
        </div>

        <div className="support-card__actions">
          <span className="muted support-card__note">{t('game.confirmHint')}</span>
          {selected !== null && (
            <Button
              variant="ghost"
              onClick={() => {
                setSelected(null);
                setTailwind(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={selected === null}
            onClick={lock}
            testId="lock-support"
          >
            {t('game.lockSupport')} →
          </Button>
        </div>
      </div>
    </div>
  );
}
