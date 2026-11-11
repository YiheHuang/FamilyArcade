import type { T } from './components';
import { Button } from './components';

export function RulesScreen({
  t,
  onBack,
  onTutorial,
}: {
  t: T;
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
          <p className="muted">{t('app.tagline')}</p>
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
        </section>

        <aside className="panel">
          <h2>{t('rules.controls')}</h2>
          <table className="control-table">
            <tbody>
              <tr>
                <th>{t('rules.select')}</th>
                <td>{t('rules.controlsValue')}</td>
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
