import { Button, CrownIcon, DessertIcon, type T } from './components';

export function RulesScreen({
  t,
  onBack,
  onTutorial,
}: {
  t: T;
  onBack: () => void;
  onTutorial: () => void;
}) {
  return (
    <div className="rules screen" data-testid="rules-screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('rules.back')}
        </button>
        <div>
          <h1>{t('rules.title')}</h1>
          <p className="muted">{t('rules.subtitle')}</p>
        </div>
        <Button testId="rules-tutorial" onClick={onTutorial}>
          {t('rules.startTutorial')}
        </Button>
      </header>

      <div className="rules__grid">
        <div className="rules__main">
          <section className="panel">
            <div className="eyebrow">{t('rules.five')}</div>
            <div className="rules__five">
              {[1, 2, 3, 4, 5].map((n) => (
                <div className="rule-card" key={n}>
                  <span className="rule-card__n">0{n}</span>
                  <p>{t(`rules.five.${n}`)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="rules__section-head">
              <div>
                <div className="eyebrow">{t('rules.scoring')}</div>
                <h2>{t('rules.combo')}</h2>
              </div>
              <span className="pill">{t('rules.example')}</span>
            </div>
            <div className="scoring-table">
              <div className="scoring-table__head">
                <span>{t('rules.combo')}</span>
                <span>{t('rules.points')}</span>
                <span>{t('rules.note')}</span>
              </div>
              <div className="scoring-table__row">
                <span className="scoring-table__combo">
                  <span className="icon-pair">
                    <DessertIcon type="macaron" size={24} />
                    <DessertIcon type="macaron" size={24} />
                  </span>
                  {t('rules.pair')}
                </span>
                <strong>2</strong>
                <span className="muted">{t('rules.pairNote')}</span>
              </div>
              <div className="scoring-table__row">
                <span className="scoring-table__combo">
                  <span className="icon-pair">
                    <DessertIcon type="tart" size={24} />
                    <DessertIcon type="tart" size={24} />
                    <DessertIcon type="tart" size={24} />
                  </span>
                  {t('rules.triple')}
                </span>
                <strong>6</strong>
                <span className="muted">{t('rules.tripleNote')}</span>
              </div>
              <div className="scoring-table__row">
                <span className="scoring-table__combo">
                  <span className="icon-pair">
                    <DessertIcon type="pudding" size={24} />
                    <DessertIcon type="pudding" size={24} />
                    <DessertIcon type="pudding" size={24} />
                    <DessertIcon type="pudding" size={24} />
                  </span>
                  {t('rules.quad')}
                </span>
                <strong>12</strong>
                <span className="muted">{t('rules.quadNote')}</span>
              </div>
              <div className="scoring-table__row">
                <span className="scoring-table__combo">
                  <span className="icon-pair">
                    <DessertIcon type="macaron" size={22} />
                    <DessertIcon type="eclair" size={22} />
                    <DessertIcon type="candy" size={22} />
                  </span>
                  {t('rules.sampler')}
                </span>
                <strong>5</strong>
                <span className="muted">{t('rules.samplerNote')}</span>
              </div>
              <div className="scoring-table__row">
                <span className="scoring-table__combo">
                  <CrownIcon size={22} />
                  {t('rules.crown')}
                </span>
                <strong>6</strong>
                <span className="muted">{t('rules.crownNote')}</span>
              </div>
              <div className="scoring-table__row">
                <span className="scoring-table__combo">
                  <DessertIcon type="cake" size={24} />
                  {t('rules.leftover')}
                </span>
                <strong>1</strong>
                <span className="muted">{t('rules.leftoverNote')}</span>
              </div>
            </div>
            <p className="hint-text">{t('rules.scoringNote')}</p>
          </section>
        </div>

        <aside className="rules__side">
          <section className="panel">
            <div className="eyebrow">{t('rules.crownTitle')}</div>
            <h2>{t('game.crowns')}</h2>
            <p>{t('rules.crownBody')}</p>
          </section>
          <section className="panel">
            <div className="eyebrow">{t('rules.rounds')}</div>
            <h2>{t('game.passDirection')}</h2>
            <p>{t('rules.roundsBody')}</p>
            <div className="direction-row">
              <span className="direction-chip">1 · ↺ {t('game.passLeft')}</span>
              <span className="direction-chip">2 · ↻ {t('game.passRight')}</span>
              <span className="direction-chip">3 · ↺ {t('game.passLeft')}</span>
            </div>
          </section>
          <section className="panel">
            <div className="eyebrow">{t('rules.tiebreak')}</div>
            <h2>{t('rules.tiebreak')}</h2>
            <p>{t('rules.tiebreakBody')}</p>
          </section>
          <section className="panel">
            <div className="eyebrow">{t('rules.controls')}</div>
            <table className="control-table">
              <tbody>
                <tr>
                  <th>{t('rules.mouse')}</th>
                  <td>{t('rules.controlPick')}</td>
                </tr>
                <tr>
                  <th>{t('rules.keyboard')}</th>
                  <td>{t('rules.controlKeys')}</td>
                </tr>
                <tr>
                  <th>{t('home.privacy')}</th>
                  <td>{t('rules.controlPrivacy')}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </div>
  );
}
