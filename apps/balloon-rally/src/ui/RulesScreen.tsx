import { ROUNDS, SCORING, TRACK_LENGTH } from '../game/data';
import { Button, type T } from './components';

export function RulesScreen({
  t,
  onBack,
  onTutorial,
}: {
  t: T;
  onBack: () => void;
  onTutorial: () => void;
}) {
  const rules = [t('rules.rule1'), t('rules.rule2'), t('rules.rule3'), t('rules.rule4'), t('rules.rule5')];
  return (
    <div className="rules screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('common.back')}
        </button>
        <div>
          <p className="eyebrow">{t('app.nameEn')}</p>
          <h1>{t('rules.title')}</h1>
          <p className="muted">{t('rules.subtitle')}</p>
        </div>
        <span />
      </header>

      <div className="rules__grid">
        <section className="panel rules__main">
          <div className="rules__hero-strip">
            <div>
              <strong>{TRACK_LENGTH}</strong>
              <span>{t('game.track')}</span>
            </div>
            <div>
              <strong>{ROUNDS}</strong>
              <span>{t('game.rounds')}</span>
            </div>
            <div>
              <strong>{t('home.badgePlayers')}</strong>
              <span>{t('setup.players')}</span>
            </div>
            <small>{t('setup.previewHint')}</small>
          </div>

          <ol className="rules-list">
            {rules.map((rule, index) => (
              <li key={index}>
                <span className="rules-list__num">{String(index + 1).padStart(2, '0')}</span>
                <p>{rule}</p>
              </li>
            ))}
          </ol>

          <h2>{t('rules.scoreTitle')}</h2>
          <table className="score-table">
            <tbody>
              <tr>
                <th>{t('rules.scoreLeader')}</th>
                <td>+{SCORING.roundLeader}</td>
              </tr>
              <tr>
                <th>{t('rules.scoreSecond')}</th>
                <td>+{SCORING.roundSecond}</td>
              </tr>
              <tr>
                <th>{t('rules.scoreOverall')}</th>
                <td>+{SCORING.overallLeader}</td>
              </tr>
              <tr>
                <th>{t('rules.scoreTailwind')}</th>
                <td>+{SCORING.unusedTailwind}</td>
              </tr>
            </tbody>
          </table>
          <div className="rule-note">
            <strong>{t('rules.tie')}</strong>
            <p>{t('rules.tieBody')}</p>
          </div>

          <h2>{t('rules.tipTitle')}</h2>
          <ul className="tip-list">
            <li>{t('rules.tip1')}</li>
            <li>{t('rules.tip2')}</li>
            <li>{t('rules.tip3')}</li>
          </ul>

          <div className="family-note">
            <span aria-hidden>✦</span>
            <div>
              <strong>{t('rules.family')}</strong>
              <p>{t('rules.familyBody')}</p>
            </div>
          </div>

          <div className="rules__actions">
            <Button variant="primary" onClick={onTutorial} testId="replay-tutorial">
              {t('rules.tutorial')}
            </Button>
            <Button variant="ghost" onClick={onBack}>
              {t('rules.back')}
            </Button>
          </div>
        </section>

        <aside className="panel rules__side">
          <h2>{t('rules.controls')}</h2>
          <table className="controls-table">
            <thead>
              <tr>
                <th />
                <th>{t('rules.mouse')}</th>
                <th>{t('rules.touch')}</th>
                <th>{t('rules.keyboard')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>{t('rules.select')}</th>
                <td>{t('rules.selectMouse')}</td>
                <td>{t('rules.selectTouch')}</td>
                <td><kbd>1</kbd>–<kbd>5</kbd></td>
              </tr>
              <tr>
                <th>{t('rules.tailwind')}</th>
                <td>{t('rules.tailwindMouse')}</td>
                <td>{t('rules.tailwindTouch')}</td>
                <td><kbd>T</kbd></td>
              </tr>
              <tr>
                <th>{t('rules.confirm')}</th>
                <td>{t('rules.confirmMouse')}</td>
                <td>{t('rules.confirmTouch')}</td>
                <td><kbd>Enter</kbd></td>
              </tr>
              <tr>
                <th>{t('rules.undo')}</th>
                <td>{t('rules.undoMouse')}</td>
                <td>{t('rules.undoTouch')}</td>
                <td><kbd>U</kbd></td>
              </tr>
            </tbody>
          </table>
          <div className="rules__side-note">
            <span className="eyebrow">{t('setup.modeHotseat')}</span>
            <p>{t('setup.hint')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
