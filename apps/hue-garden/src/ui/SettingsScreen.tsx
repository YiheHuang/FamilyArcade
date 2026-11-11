import type { Lang } from '../i18n';
import type { Settings, SoundLevel, Speed } from '../storage';
import { Button, Segmented, type T } from './components';

export function SettingsScreen({
  t,
  settings,
  onChange,
  onBack,
  onResetStats,
}: {
  t: T;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onResetStats: () => void;
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

      <div className="panel settings__panel">
        <div className="settings__row">
          <div>
            <strong>{t('settings.language')}</strong>
            <p className="muted">中文 / English</p>
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

        <div className="settings__row">
          <div>
            <strong>{t('settings.sound')}</strong>
            <p className="muted">{t('rules.soundValue')}</p>
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

        <div className="settings__row">
          <div>
            <strong>{t('settings.speed')}</strong>
            <p className="muted">{t('rules.tip')}</p>
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

        <div className="settings__row">
          <div>
            <strong>{t('settings.reducedMotion')}</strong>
            <p className="muted">{t('settings.motionHint')}</p>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(e) => onChange({ reducedMotion: e.target.checked })}
            />
            <span />
          </label>
        </div>

        <div className="settings__row">
          <div>
            <strong>{t('settings.resetStats')}</strong>
            <p className="muted">{t('stats.noGames')}</p>
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
      </div>
    </div>
  );
}
