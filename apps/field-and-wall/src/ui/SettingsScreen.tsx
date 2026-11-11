import type { Lang } from '../i18n';
import type { Settings, SoundLevel, Speed } from '../storage';
import { Button, Segmented, type T } from './components';

export function SettingsScreen({
  t,
  lang,
  settings,
  onChange,
  onBack,
  onResetStats,
  onExport,
}: {
  t: T;
  lang: Lang;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onResetStats: () => void;
  onExport: () => void;
}) {
  return (
    <div className="settings screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('settings.back')}
        </button>
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="muted">{t('settings.saved')}</p>
        </div>
        <span />
      </header>

      <div className="settings__grid">
        <section className="panel settings__form">
          <div className="field">
            <span className="field__label">{t('settings.language')}</span>
            <Segmented
              value={lang}
              label={t('settings.language')}
              options={[
                { value: 'zh' as Lang, label: '中文' },
                { value: 'en' as Lang, label: 'English' },
              ]}
              onChange={(value) => onChange({ lang: value })}
            />
          </div>

          <div className="field">
            <span className="field__label">{t('settings.sound')}</span>
            <Segmented
              value={settings.sound}
              label={t('settings.sound')}
              options={[
                { value: 'on' as SoundLevel, label: t('settings.on') },
                { value: 'low' as SoundLevel, label: t('settings.low') },
                { value: 'off' as SoundLevel, label: t('settings.off') },
              ]}
              onChange={(value) => onChange({ sound: value })}
            />
            <p className="muted small">{t('settings.audioNote')}</p>
          </div>

          <div className="field">
            <span className="field__label">{t('settings.speed')}</span>
            <Segmented
              value={settings.speed}
              label={t('settings.speed')}
              options={[
                { value: 'slow' as Speed, label: t('settings.slow') },
                { value: 'normal' as Speed, label: t('settings.normal') },
                { value: 'fast' as Speed, label: t('settings.fast') },
              ]}
              onChange={(value) => onChange({ speed: value })}
            />
          </div>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => onChange({ reducedMotion: event.target.checked })}
            />
            <span>
              <strong>{t('settings.reducedMotion')}</strong>
              <small className="muted">{t('settings.motionNote')}</small>
            </span>
          </label>

          <p className="muted small settings__color-note">{t('settings.colorNote')}</p>

          <div className="settings__buttons">
            <Button onClick={onExport}>{t('settings.export')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(t('stats.resetConfirm'))) onResetStats();
              }}
            >
              {t('settings.resetStats')}
            </Button>
          </div>
        </section>

        <aside className="panel settings__about">
          <p className="eyebrow">{t('settings.about')}</p>
          <h2>筑野 · Field &amp; Wall</h2>
          <p>{t('settings.aboutText')}</p>
          <dl className="about-list">
            <div>
              <dt>{t('settings.version')}</dt>
              <dd>0.1.0</dd>
            </div>
            <div>
              <dt>{t('app.badgePlayers')}</dt>
              <dd>2–4</dd>
            </div>
            <div>
              <dt>{t('app.badgeTime')}</dt>
              <dd>30–35 min</dd>
            </div>
            <div>
              <dt>{t('settings.language')}</dt>
              <dd>中文 · English</dd>
            </div>
          </dl>
          <p className="muted small">{t('home.footer')}</p>
        </aside>
      </div>
    </div>
  );
}
