import { balloonName, type Balloon } from '../game/data';
import type { Lang } from '../i18n';
import { SeatDot } from './components';
import type { T } from './components';

export function WindRail({
  wind,
  revealed = 0,
  balloons,
  lang,
  t,
  supports = null,
}: {
  wind: number[] | null;
  revealed?: number;
  balloons: readonly Balloon[];
  lang: Lang;
  t: T;
  supports?: (number | null)[] | null;
}) {
  return (
    <section className="wind-rail" aria-label={t('a11y.windCards')}>
      <div className="wind-rail__head">
        <h3>{t('game.windCard')}</h3>
        <span className="muted">
          {wind ? t('game.revealWind') : t('game.hidden')}
        </span>
      </div>
      <div className="wind-cards">
        {balloons.map((balloon, index) => {
          const show = wind !== null && index < revealed;
          const value = wind ? wind[index] : null;
          const supporters = (supports ?? [])
            .map((supported, seat) => (supported === index ? seat : -1))
            .filter((seat) => seat >= 0);
          return (
            <div
              key={balloon.id}
              className={`wind-card${show ? ' is-shown' : ' is-hidden'}`}
              style={{ ['--balloon-color' as string]: balloon.color, ['--balloon-light' as string]: balloon.light }}
              data-testid={`wind-card-${index}`}
            >
              <div className="wind-card__face wind-card__back" aria-hidden={show}>
                <span className="wind-card__swirl">⌁</span>
                <span className="wind-card__num">{index + 1}</span>
              </div>
              <div className="wind-card__face wind-card__front" aria-hidden={!show}>
                <span className="wind-card__name">{balloonName(balloon, lang)}</span>
                <strong className="wind-card__value">{value ?? '·'}</strong>
                <span className="wind-card__unit">+</span>
                <div className="wind-card__supporters">
                  {supporters.map((seat) => (
                    <SeatDot key={seat} seat={seat} small />
                  ))}
                </div>
              </div>
              <span className="sr-only">
                {show
                  ? `${balloonName(balloon, lang)} +${value}`
                  : `${t('game.windCard')} ${index + 1} ${t('game.hidden')}`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
