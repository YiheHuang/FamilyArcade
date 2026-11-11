import type { Lang } from '../i18n';
import type { Settings, SoundLevel, Speed } from '../storage';
import { Button, Segmented, type T } from './components';

export function SettingsScreen({
  t,
  settings,
  onChange,
  onBack,
  onResetStats,
  onTutorial,
}: {
  t: T;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onResetStats: () => void;
  onTutorial: () => void;
}) {
  return (
    <div className="settings screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('settings.back')}
        </button>
        <div>
          <p className="eyebrow">{t('app.nameEn')}</p>
          <h1>{t('settings.title')}</h1>
          <p className="muted">{t('settings.saved')}</p>
        </div>
        <span />
      </header>

      <div className="settings__grid">
        <section className="panel settings__panel">
          <div className="settings-row">
            <div>
              <strong>{t('settings.language')}</strong>
              <small>{t('settings.saved')}</small>
            </div>
            <Segmented<Lang>
              value={settings.lang}
              label={t('settings.language')}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
              onChange={(lang) => onChange({ lang })}
            />
          </div>

          <div className="settings-row">
            <div>
              <strong>{t('settings.sound')}</strong>
              <small>{t('settings.audioHint')}</small>
            </div>
            <Segmented<SoundLevel>
              value={settings.sound}
              label={t('settings.sound')}
              options={[
                { value: 'on', label: t('settings.on') },
                { value: 'low', label: t('settings.low') },
                { value: 'off', label: t('settings.off') },
              ]}
              onChange={(sound) => onChange({ sound })}
            />
          </div>

          <div className="settings-row">
            <div>
              <strong>{t('settings.speed')}</strong>
              <small>{t('game.windRevealNote')}</small>
            </div>
            <Segmented<Speed>
              value={settings.speed}
              label={t('settings.speed')}
              options={[
                { value: 'slow', label: t('settings.slow') },
                { value: 'normal', label: t('settings.normal') },
                { value: 'fast', label: t('settings.fast') },
              ]}
              onChange={(speed) => onChange({ speed })}
            />
          </div>

          <div className="settings-row">
            <div>
              <strong>{t('settings.reducedMotion')}</strong>
              <small>{t('settings.reducedHint')}</small>
            </div>
            <button
              type="button"
              className={`switch-row switch-row--compact${settings.reducedMotion ? ' is-on' : ''}`}
              aria-pressed={settings.reducedMotion}
              onClick={() => onChange({ reducedMotion: !settings.reducedMotion })}
              data-testid="reduced-motion"
            >
              <span className="switch" aria-hidden>
                <span />
              </span>
              <span>{settings.reducedMotion ? t('settings.on') : t('settings.off')}</span>
            </button>
          </div>

          <div className="settings-row">
            <div>
              <strong>{t('settings.resetStats')}</strong>
              <small>{t('stats.local')}</small>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(t('stats.resetConfirm'))) onResetStats();
              }}
            >
              {t('settings.resetStats')}
            </Button>
          </div>

          <div className="settings__actions">
            <Button variant="ghost" onClick={onTutorial}>
              {t('rules.tutorial')}
            </Button>
            <Button variant="primary" onClick={onBack}>
              {t('common.back')}
            </Button>
          </div>
        </section>

        <aside className="panel settings__side">
          <div className="settings-swatch" aria-hidden>
            {['#3f6b8c', '#a97b2d', '#a95340', '#5d8164', '#78619b', '#6c6a4f'].map((color) => (
              <span key={color} style={{ background: color }} />
            ))}
          </div>
          <h2>{t('app.tagline')}</h2>
          <p className="muted">{t('app.subtitle')}</p>
          <div className="settings__facts">
            <span>{t('home.badgePlayers')}</span>
            <span>{t('home.badgeTime')}</span>
            <span>{t('home.badgeAge')}</span>
            <span>{t('home.badgeOffline')}</span>
          </div>
          <p className="settings__version">{t('home.version')}</p>
        </aside>
      </div>
    </div>
  );
}
