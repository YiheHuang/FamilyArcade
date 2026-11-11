import { Button, FeatureIcon, type T } from './components';

export function RulesScreen({
  t,
  onBack,
  onTutorial,
}: {
  t: T;
  onBack: () => void;
  onTutorial: () => void;
}) {
  const rules = [
    { n: '01', title: t('rules.rule1Title'), text: t('rules.rule1') },
    { n: '02', title: t('rules.rule2Title'), text: t('rules.rule2') },
    { n: '03', title: t('rules.rule3Title'), text: t('rules.rule3') },
    { n: '04', title: t('rules.rule4Title'), text: t('rules.rule4') },
    { n: '05', title: t('rules.rule5Title'), text: t('rules.rule5') },
  ];

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
        <section className="rules__main">
          <ol className="rule-list">
            {rules.map((rule) => (
              <li key={rule.n} className="rule-row">
                <span className="rule-row__num">{rule.n}</span>
                <div>
                  <strong>{rule.title}</strong>
                  <p>{rule.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="panel rules__scoring">
            <h2>{t('rules.scoring')}</h2>
            <table className="score-table">
              <thead>
                <tr>
                  <th>{t('rules.feature')}</th>
                  <th>{t('rules.whenComplete')}</th>
                  <th>{t('rules.atEnd')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="score-feature"><FeatureIcon type="city" size={20} />{t('rules.city')}</span></td>
                  <td>{t('rules.cityComplete')}</td>
                  <td>{t('rules.cityEnd')}</td>
                </tr>
                <tr>
                  <td><span className="score-feature"><FeatureIcon type="road" size={20} />{t('rules.road')}</span></td>
                  <td>{t('rules.roadComplete')}</td>
                  <td>{t('rules.roadEnd')}</td>
                </tr>
                <tr>
                  <td><span className="score-feature"><FeatureIcon type="monastery" size={20} />{t('rules.monastery')}</span></td>
                  <td>{t('rules.monasteryComplete')}</td>
                  <td>{t('rules.monasteryEnd')}</td>
                </tr>
                <tr>
                  <td><span className="score-feature"><span className="meeple-dot" />{t('rules.meepleRule')}</span></td>
                  <td>{t('rules.meepleReturn')}</td>
                  <td>{t('rules.meepleEnd')}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">{t('rules.tie')}</p>
            <p className="muted small">{t('rules.discard')}</p>
            <p className="muted small">{t('rules.firstTile')}</p>
          </section>

          <section className="panel rules__controls">
            <h2>{t('rules.controls')}</h2>
            <table className="controls-table">
              <thead>
                <tr>
                  <th>{t('rules.action')}</th>
                  <th>{t('rules.mouse')}</th>
                  <th>{t('rules.keyboard')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('rules.select')}</td>
                  <td>{t('rules.selectMouse')}</td>
                  <td>{t('rules.selectKey')}</td>
                </tr>
                <tr>
                  <td>{t('game.rotate')}</td>
                  <td>{t('rules.rotateMouse')}</td>
                  <td>{t('rules.rotateKey')}</td>
                </tr>
                <tr>
                  <td>{t('game.chooseMeeple')}</td>
                  <td>{t('rules.meepleMouse')}</td>
                  <td>{t('rules.meepleKey')}</td>
                </tr>
                <tr>
                  <td>{t('game.confirm')}</td>
                  <td>{t('rules.confirmMouse')}</td>
                  <td>{t('rules.confirmKey')}</td>
                </tr>
                <tr>
                  <td>{t('game.cancel')}</td>
                  <td>{t('rules.cancelMouse')}</td>
                  <td>{t('rules.cancelKey')}</td>
                </tr>
                <tr>
                  <td>{t('game.hint')}</td>
                  <td>{t('rules.hintMouse')}</td>
                  <td>{t('rules.hintKey')}</td>
                </tr>
                <tr>
                  <td>{t('game.undo')}</td>
                  <td>{t('rules.undoMouse')}</td>
                  <td>{t('rules.undoKey')}</td>
                </tr>
                <tr>
                  <td>{t('common.sound')}</td>
                  <td>{t('rules.soundKey')}</td>
                  <td>{t('rules.soundKey')}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted small">{t('rules.tip')}</p>
          </section>
        </section>

        <aside className="rules__side">
          <section className="panel rules__callout">
            <p className="eyebrow">{t('rules.v01')}</p>
            <h2>{t('rules.noFarmsTitle')}</h2>
            <p>{t('rules.noFarms')}</p>
            <Button variant="primary" onClick={onTutorial}>{t('rules.tutorial')}</Button>
          </section>
          <section className="panel rules__original">
            <p className="eyebrow">{t('rules.originalEyebrow')}</p>
            <p className="muted small">{t('rules.original')}</p>
            <p className="tiny muted">{t('rules.originalTiny')}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
