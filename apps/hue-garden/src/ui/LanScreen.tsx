import type { Lang } from '../i18n';
import type { LanPublicPeer } from '@family-arcade/lan';
import { Button, Segmented, type T } from './components';

export type LanRole = 'host' | 'guest';

export function LanScreen({
  t,
  lang,
  role,
  busy,
  error,
  code,
  invite,
  qr,
  players,
  seatCount,
  onSeatCount,
  onCreate,
  onStart,
  onCopy,
  onBack,
  guestName,
  guestCode,
  guestRoom,
  guestSeat,
  guestStarted,
  guestConnecting,
  guestDisconnected,
  onGuestName,
  onGuestCode,
  onJoin,
  onReconnect,
}: {
  t: T;
  lang: Lang;
  role: LanRole;
  busy: boolean;
  error: string;
  code: string;
  invite: string;
  qr: string;
  players: LanPublicPeer[];
  seatCount: 2 | 3 | 4;
  onSeatCount: (value: 2 | 3 | 4) => void;
  onCreate: () => void;
  onStart: () => void;
  onCopy: () => void;
  onBack: () => void;
  guestName: string;
  guestCode: string;
  guestRoom: string;
  guestSeat: number;
  guestStarted: boolean;
  guestConnecting: boolean;
  guestDisconnected: boolean;
  onGuestName: (value: string) => void;
  onGuestCode: (value: string) => void;
  onJoin: () => void;
  onReconnect: () => void;
}) {
  const connected = players.filter((p) => p.connected).length;
  const ready = players.length >= 2 && connected === seatCount;
  const hostCreated = Boolean(invite);

  return (
    <div className="lan screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="lan-back" onClick={onBack}>
          ← {t('lan.backHome')}
        </button>
        <div>
          <h1>{role === 'host' ? t('lan.hostTitle') : t('lan.guestTitle')}</h1>
          <p className="muted">{role === 'host' ? t('lan.hostDesc') : t('lan.guestDesc')}</p>
        </div>
        <span />
      </header>

      {role === 'guest' ? (
        <div className="lan__grid">
          <section className="panel lan__form">
            <div className="lan__badges">
              <span className="pill">{t('lan.onlyWifi')}</span>
              {guestRoom && <span className="pill">{t('lan.room')}: {guestRoom}</span>}
            </div>
            {guestSeat < 0 && (
              <>
                <label className="field">
                  <span className="field__label">{t('lan.name')}</span>
                  <input
                    className="input"
                    value={guestName}
                    maxLength={18}
                    onChange={(e) => onGuestName(e.target.value)}
                    data-testid="lan-guest-name"
                  />
                </label>
                <label className="field">
                  <span className="field__label">{t('lan.code')}</span>
                  <input
                    className="input"
                    value={guestCode}
                    maxLength={4}
                    inputMode="numeric"
                    onChange={(e) => onGuestCode(e.target.value)}
                    data-testid="lan-guest-code"
                  />
                </label>
              </>
            )}
            {guestSeat >= 0 ? (
              <div className="lan__waiting" data-testid="lan-guest-status">
                <strong>{t('lan.guestSeat', { seat: guestSeat + 1 })}</strong>
                <p>{guestStarted ? t('lan.starting') : t('lan.waitHost')}</p>
                {guestStarted && <p className="muted">{t('lan.openLobby')} →</p>}
                {error && <p className="error-text">{error}</p>}
                <div className="lan__actions">
                  {guestDisconnected && (
                    <Button variant="primary" onClick={onReconnect} disabled={guestConnecting}>
                      {guestConnecting ? t('lan.reconnecting') : t('lan.reconnect')}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="lan__actions">
                <Button
                  variant="primary"
                  onClick={onJoin}
                  disabled={guestConnecting || !guestName.trim()}
                  testId="lan-join"
                >
                  {guestConnecting ? t('lan.joining') : t('lan.join')}
                </Button>
              </div>
            )}
            {error && <p className="error-text" data-testid="lan-error">{error}</p>}
            <p className="hint-text">{t('lan.joinHint')}</p>
          </section>

          <aside className="panel lan__note">
            <span className="lan__glyph" aria-hidden>⌂</span>
            <h2>{t('lan.private')}</h2>
            <p>{t('lan.authority')}</p>
            <p className="muted">{t('lan.reconnectHint')}</p>
          </aside>
        </div>
      ) : (
        <div className="lan__grid">
          <section className="panel lan__host">
            {!hostCreated ? (
              <>
                <div className="field">
                  <span className="field__label">{t('lan.seats')}</span>
                  <Segmented
                    value={seatCount}
                    label={t('lan.seats')}
                    options={[
                      { value: 2, label: '2' },
                      { value: 3, label: '3' },
                      { value: 4, label: '4' },
                    ]}
                    onChange={(value) => onSeatCount(value as 2 | 3 | 4)}
                  />
                </div>
                <Button
                  variant="primary"
                  wide
                  onClick={onCreate}
                  disabled={busy}
                  testId="lan-create"
                >
                  {busy ? t('lan.creating') : t('lan.create')}
                </Button>
                <p className="hint-text">{t('lan.subtitle')}</p>
              </>
            ) : (
              <>
                <div className="lan__badges">
                  <span className="pill">{t('lan.onlyWifi')}</span>
                  <span className="pill" data-testid="lan-players">
                    {t('lan.peers', { n: connected, max: seatCount })}
                  </span>
                </div>
                <div className="lan__code-row">
                  <div>
                    <span className="field__label">{t('lan.code')}</span>
                    <div className="lan__code" data-testid="lan-code">{code}</div>
                  </div>
                  <span className="lan__status">{ready ? t('lan.ready') : t('lan.waiting')}</span>
                </div>
                <ul className="lan__seats" aria-label={t('lan.seats')}>
                  {Array.from({ length: seatCount }, (_, seat) => {
                    const player = players.find((p) => p.seat === seat);
                    return (
                      <li key={seat} className={player?.connected ? 'is-online' : ''}>
                        <span className="lan__seat-index">{seat + 1}</span>
                        <span>
                          <strong>{player?.name ?? t('lan.seatOpen')}</strong>
                          <small>{seat === 0 ? t('lan.host') : t('lan.guest')}</small>
                        </span>
                        <span className={`pill${player?.connected ? '' : ' pill--muted'}`}>
                          {player?.connected ? t('lan.connected') : t('lan.offline')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  variant="primary"
                  wide
                  onClick={onStart}
                  disabled={!ready || busy}
                  testId="lan-start"
                >
                  {busy ? t('lan.starting') : t('lan.start')}
                </Button>
                <Button wide onClick={onCopy} testId="lan-copy">
                  {t('lan.copy')}
                </Button>
              </>
            )}
            {error && <p className="error-text" data-testid="lan-error">{error}</p>}
          </section>

          <aside className="panel lan__qr-card">
            {qr ? (
              <>
                <img src={qr} alt={t('lan.scan')} data-testid="lan-qr" />
                <h2>{t('lan.scan')}</h2>
                <code data-testid="lan-invite">{invite.replace(/^https?:\/\//, '')}</code>
                <p className="muted">{t('lan.private')}</p>
              </>
            ) : (
              <>
                <span className="lan__glyph" aria-hidden>⌂</span>
                <h2>{t('lan.hostTitle')}</h2>
                <p className="muted">{t('lan.authority')}</p>
                <p className="muted">{lang === 'zh' ? '同一 Wi-Fi · 手机无需安装' : 'Same Wi-Fi · nothing to install on the phone'}</p>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
