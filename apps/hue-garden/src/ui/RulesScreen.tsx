import type { Lang } from '../i18n';
import { Button, SealLegend, type T } from './components';
import { ShapeLegend } from './tiles';

export function RulesScreen({
  t,
  lang,
  onBack,
  onTutorial,
}: {
  t: T;
  lang: Lang;
  onBack: () => void;
  onTutorial: () => void;
}) {
  const rules = [1, 2, 3, 4, 5] as const;
  return (
    <div className="rules screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('rules.back')}
        </button>
        <div>
          <h1>{t('rules.title')}</h1>
          <p className="muted">{t('rules.intro')}</p>
        </div>
        <span />
      </header>

      <div className="rules__grid">
        <section className="rules__list">
          {rules.map((n) => (
            <article className="rule-card" key={n}>
              <span className="rule-card__n">{String(n).padStart(2, '0')}</span>
              <p>{t(`rules.rule${n}`)}</p>
            </article>
          ))}

          <section className="panel rules__detail">
            <h2>{t('rules.full')}</h2>
            <h3>{t('rules.scoring')}</h3>
            <p>{t('rules.scoringLines')}</p>
            <p>{t('rules.scoringBloom')}</p>
            <p>{t('rules.scoringBonus')}</p>
            <h3>{t('rules.end')}</h3>
            <p>{t('rules.endText')}</p>
            <h3>{t('rules.house')}</h3>
            <ul>
              <li>{t('rules.house1')}</li>
              <li>{t('rules.house2')}</li>
              <li>{t('rules.house3')}</li>
            </ul>
          </section>

          <section className="panel rules__legend">
            <h2>{t('rules.legend')}</h2>
            <ShapeLegend lang={lang} />
            <SealLegend lang={lang} t={t} />
            <p className="hint-text">{t('rules.legendText')}</p>
          </section>
        </section>

        <aside className="panel rules__controls">
          <h2>{t('rules.controls')}</h2>
          <table className="control-table">
            <tbody>
              <tr>
                <th>{t('rules.select')}</th>
                <td>{t('rules.selectValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.place')}</th>
                <td>{t('rules.placeValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.confirm')}</th>
                <td>{t('rules.confirmValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.cancel')}</th>
                <td>{t('rules.cancelValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.hint')}</th>
                <td>{t('rules.hintValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.undo')}</th>
                <td>{t('rules.undoValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.swap')}</th>
                <td>{t('rules.swapValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.sound')}</th>
                <td>{t('rules.soundValue')}</td>
              </tr>
              <tr>
                <th>{t('rules.keyboard')}</th>
                <td>{t('rules.keyboardValue')}</td>
              </tr>
            </tbody>
          </table>
          <p className="hint-text">{t('rules.tip')}</p>
          <Button variant="primary" wide onClick={onTutorial}>
            {t('rules.replayTutorial')}
          </Button>
        </aside>
      </div>
    </div>
  );
}
