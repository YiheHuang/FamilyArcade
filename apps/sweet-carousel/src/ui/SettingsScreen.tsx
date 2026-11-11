import type { Lang } from '../i18n';
import type { Settings, SoundLevel, Speed } from '../storage';
import { Button, Segmented, type T } from './components';

export function SettingsScreen({
  t,
  settings,
  onChange,
  onBack,
  onResetStats,
  onExportStats,
  onTutorial,
}: {
  t: T;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onResetStats: () => void;
  onExportStats: () => void;
  onTutorial: () => void;
}) {
  return (
    <div className="settings screen" data-testid="settings-screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('settings.back')}
        </button>
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="muted">{t('settings.subtitle')}</p>
        </div>
        <span />
      </header>

      <div className="settings__panel panel">
        <div className="settings__row">
          <div>
            <strong>{t('settings.language')}</strong>
            <p className="hint-text">{t('settings.langHint')}</p>
          </div>
          <Segmented
            value={settings.lang}
            label={t('settings.language')}
            testId="settings-lang"
            onChange={(value) => onChange({ lang: value as Lang })}
            options={[
              { value: 'zh', label: t('settings.langZh') },
              { value: 'en', label: t('settings.langEn') },
            ]}
          />
        </div>

        <div className="settings__row">
          <div>
            <strong>{t('settings.sound')}</strong>
            <p className="hint-text">{t('settings.soundDesc')}</p>
          </div>
          <Segmented
            value={settings.sound}
            label={t('settings.sound')}
            testId="settings-sound"
            onChange={(value) => onChange({ sound: value as SoundLevel })}
            options={[
              { value: 'on', label: t('settings.on') },
              { value: 'low', label: t('settings.low') },
              { value: 'off', label: t('settings.off') },
            ]}
          />
        </div>

        <div className="settings__row">
          <div>
            <strong>{t('settings.speed')}</strong>
            <p className="hint-text">{t('settings.speedDesc')}</p>
          </div>
          <Segmented
            value={settings.speed}
            label={t('settings.speed')}
            testId="settings-speed"
            onChange={(value) => onChange({ speed: value as Speed })}
            options={[
              { value: 'slow', label: t('settings.slow') },
              { value: 'normal', label: t('settings.normal') },
              { value: 'fast', label: t('settings.fast') },
            ]}
          />
        </div>

        <div className="settings__row">
          <div>
            <strong>{t('settings.reducedMotion')}</strong>
            <p className="hint-text">{t('settings.reducedMotionDesc')}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) => onChange({ reducedMotion: event.target.checked })}
              data-testid="settings-reduced-motion"
              aria-label={t('settings.reducedMotion')}
            />
            <span />
          </label>
        </div>

        <div className="settings__row">
          <div>
            <strong>{t('settings.tutorial')}</strong>
            <p className="hint-text">{t('settings.tutorialDesc')}</p>
          </div>
          <Button testId="settings-tutorial" onClick={onTutorial}>
            {t('settings.tutorialButton')}
          </Button>
        </div>

        <div className="settings__row">
          <div>
            <strong>{t('settings.data')}</strong>
            <p className="hint-text">{t('settings.dataDesc')}</p>
          </div>
          <div className="settings__data-actions">
            <Button testId="export-stats" onClick={onExportStats}>
              {t('settings.export')}
            </Button>
            <Button
              testId="reset-stats"
              variant="danger"
              onClick={() => {
                if (window.confirm(t('stats.resetConfirm'))) onResetStats();
              }}
            >
              {t('settings.reset')}
            </Button>
          </div>
        </div>
      </div>
      <p className="muted settings__footer">{t('settings.soundOffHint')}</p>
    </div>
  );
}
