import type { LanPublicPeer } from '@family-arcade/lan';
import { Button, SeatDot, Segmented, type T } from './components';

export type LanTab = 'host' | 'guest';

export interface HostLobby {
  name: string;
  playerCount: number;
  players: LanPublicPeer[];
  code: string;
  room: string;
  invite: string;
  qr: string;
  busy: boolean;
  error: string;
}

export interface GuestLobby {
  name: string;
  room: string;
  code: string;
  players: LanPublicPeer[];
  seat: number;
  connecting: boolean;
  joined: boolean;
  online: boolean;
  started: boolean;
  error: string;
}

function PlayerList({ players, t }: { players: LanPublicPeer[]; t: T }) {
  return (
    <div className="lan-player-list" data-testid="lan-players">
      {players.map((player) => (
        <div key={player.seat} className={`lan-player${player.connected ? ' is-online' : ''}`}>
          <SeatDot seat={player.seat} small />
          <span className="lan-player__name">
            {player.host && <span className="lan-host-mark" aria-label={t('lan.hostBadge')}>✦</span>}
            {player.name}
          </span>
          <span className="lan-player__seat">{t('lan.seat', { n: player.seat + 1 })}</span>
          <span className={`lan-player__state${player.connected ? ' is-online' : ''}`}>
            {player.connected ? `● ${t('lan.connected')}` : `○ ${t('lan.offline')}`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LanScreen({
  t,
  tab,
  host,
  guest,
  onTab,
  onHostName,
  onPlayerCount,
  onCreateHost,
  onStartHost,
  onCopyInvite,
  onGuestName,
  onGuestRoom,
  onGuestCode,
  onJoinGuest,
  onReconnectGuest,
  onBack,
}: {
  t: T;
  tab: LanTab;
  host: HostLobby;
  guest: GuestLobby;
  onTab: (tab: LanTab) => void;
  onHostName: (name: string) => void;
  onPlayerCount: (count: number) => void;
  onCreateHost: () => void;
  onStartHost: () => void;
  onCopyInvite: () => void;
  onGuestName: (name: string) => void;
  onGuestRoom: (room: string) => void;
  onGuestCode: (code: string) => void;
  onJoinGuest: () => void;
  onReconnectGuest: () => void;
  onBack: () => void;
}) {
  const connected = host.players.filter((player) => player.connected).length;
  const ready = connected >= host.playerCount && host.playerCount >= 2;
  const hostRoom = Boolean(host.code);
  const guestRoom = guest.joined;

  return (
    <div className="lan-screen screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="lan-back" onClick={onBack}>
          ← {t('lan.back')}
        </button>
        <div>
          <p className="eyebrow">{t('app.nameEn')} · {t('lan.onlyWifi')}</p>
          <h1>{t('lan.title')}</h1>
          <p className="muted">{t('lan.subtitle')}</p>
        </div>
        <span />
      </header>

      <div className="lan-tabs" role="tablist" aria-label={t('lan.title')}>
        <button
          type="button"
          className={`lan-tab${tab === 'host' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={tab === 'host'}
          data-testid="lan-tab-host"
          onClick={() => onTab('host')}
        >
          {t('lan.hostTab')}
        </button>
        <button
          type="button"
          className={`lan-tab${tab === 'guest' ? ' is-active' : ''}`}
          role="tab"
          aria-selected={tab === 'guest'}
          data-testid="lan-tab-guest"
          onClick={() => onTab('guest')}
        >
          {t('lan.guestTab')}
        </button>
      </div>

      {tab === 'host' ? (
        <div className="lan-grid">
          <section className="panel lan-panel">
            {!hostRoom ? (
              <>
                <p className="eyebrow">{t('lan.hostSetup')}</p>
                <h2>{t('lan.hostTab')}</h2>
                <div className="lan-form">
                  <label className="field">
                    <span className="field__label">{t('lan.hostName')}</span>
                    <input
                      className="input"
                      value={host.name}
                      maxLength={16}
                      onChange={(event) => onHostName(event.target.value)}
                      data-testid="lan-host-name"
                    />
                  </label>
                  <div className="field">
                    <span className="field__label">{t('lan.playerCount')}</span>
                    <Segmented
                      value={host.playerCount}
                      label={t('lan.playerCount')}
                      options={[2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) }))}
                      onChange={onPlayerCount}
                    />
                  </div>
                  <Button
                    variant="primary"
                    wide
                    onClick={onCreateHost}
                    disabled={host.busy || !host.name.trim()}
                    testId="lan-create"
                  >
                    {host.busy ? t('lan.starting') : t('lan.createRoom')} →
                  </Button>
                </div>
                {host.error && <p className="hint-text hint-text--warn">{host.error}</p>}
                <p className="lan-note">{t('lan.browserRelay')}</p>
              </>
            ) : (
              <>
                <div className="lan-room-head">
                  <div>
                    <p className="eyebrow">{t('lan.roomCode')}</p>
                    <div className="room-code" data-testid="lan-code">{host.code}</div>
                    <p className="muted">
                      {t('lan.room')} {host.room} · {t('lan.code')} {host.code}
                    </p>
                  </div>
                  <span className="pill pill--live">{t('lan.hostBadge')}</span>
                </div>
                <h2>{t('lan.seatStatus')}</h2>
                <PlayerList players={host.players.slice(0, host.playerCount)} t={t} />
                <p className="lan-progress">
                  {connected}/{host.playerCount} {t('lan.connected')}
                  {ready ? ` · ${t('lan.start')}` : ''}
                </p>
                <div className="lan-actions">
                  <Button
                    variant="primary"
                    onClick={onStartHost}
                    disabled={!ready}
                    testId="lan-start"
                  >
                    {t('lan.start')} →
                  </Button>
                  <Button variant="secondary" onClick={onCopyInvite} testId="lan-copy">
                    {t('lan.copy')}
                  </Button>
                </div>
                {!ready && <p className="hint-text">{t('lan.waitingPlayers')}</p>}
                {host.error && <p className="hint-text hint-text--warn">{host.error}</p>}
                <p className="lan-note">{t('lan.hostHint')}</p>
              </>
            )}
          </section>

          <aside className="panel lan-side">
            {hostRoom ? (
              <div className="lan-qr">
                <p className="eyebrow">{t('lan.scan')}</p>
                <img src={host.qr} alt={t('lan.qrAlt')} data-testid="lan-qr" />
                <p className="muted">{t('lan.openAddress')}</p>
                <code>{(() => {
                  const raw = host.invite.replace(/^https?:\/\//, '');
                  try {
                    return decodeURIComponent(raw);
                  } catch {
                    return raw;
                  }
                })()}</code>
                <p className="lan-privacy">{t('lan.hiddenInfo')}</p>
              </div>
            ) : (
              <div className="lan-empty">
                <span className="lan-illustration" aria-hidden>◌</span>
                <h3>{t('lan.onlyWifi')}</h3>
                <p>{t('lan.hostHint')}</p>
                <p className="lan-privacy">{t('lan.hiddenInfo')}</p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="lan-grid">
          <section className="panel lan-panel">
            {!guestRoom ? (
              <>
                <p className="eyebrow">{t('lan.guestSetup')}</p>
                <h2>{t('lan.guestTitle')}</h2>
                <div className="lan-form">
                  <label className="field">
                    <span className="field__label">{t('lan.room')}</span>
                    <input
                      className="input"
                      value={guest.room}
                      inputMode="numeric"
                      maxLength={8}
                      onChange={(event) => onGuestRoom(event.target.value)}
                      data-testid="lan-guest-room"
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">{t('lan.code')}</span>
                    <input
                      className="input"
                      value={guest.code}
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => onGuestCode(event.target.value)}
                      data-testid="lan-guest-code"
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">{t('lan.name')}</span>
                    <input
                      className="input"
                      value={guest.name}
                      maxLength={16}
                      onChange={(event) => onGuestName(event.target.value)}
                      data-testid="lan-guest-name"
                    />
                  </label>
                  <Button
                    variant="primary"
                    wide
                    onClick={onJoinGuest}
                    disabled={guest.connecting || !guest.room.trim() || !guest.name.trim()}
                    testId="lan-join"
                  >
                    {guest.connecting ? t('lan.joining') : t('lan.join')} →
                  </Button>
                </div>
                {guest.error && <p className="hint-text hint-text--warn">{guest.error}</p>}
                <p className="lan-note">{t('lan.browserRelay')}</p>
              </>
            ) : (
              <>
                <div className="lan-room-head">
                  <div>
                    <p className="eyebrow">{t('lan.joined')}</p>
                    <h2>{t('lan.guestSeatHint', { n: guest.seat + 1 })}</h2>
                    <p className="muted">
                      {t('lan.room')} {guest.room} · {t('lan.code')} {guest.code}
                    </p>
                  </div>
                  <span className={`pill${guest.online ? ' pill--live' : ' pill--muted'}`}>
                    {guest.online ? t('lan.online') : t('lan.offlineBadge')}
                  </span>
                </div>
                <PlayerList players={guest.players} t={t} />
                <p className="lan-progress">{t('lan.waitingHost')}</p>
                {!guest.online && (
                  <Button variant="primary" onClick={onReconnectGuest} testId="lan-reconnect">
                    {t('lan.reconnect')} →
                  </Button>
                )}
                {guest.error && <p className="hint-text hint-text--warn">{guest.error}</p>}
                <p className="lan-note">{t('lan.hiddenInfo')}</p>
              </>
            )}
          </section>

          <aside className="panel lan-side">
            <div className="lan-empty">
              <span className="lan-illustration" aria-hidden>◌</span>
              <h3>{t('lan.guestTitle')}</h3>
              <p>{t('lan.hiddenInfo')}</p>
              <p className="lan-privacy">{t('lan.onlyWifi')} · {t('app.nameEn')}</p>
            </div>
          </aside>
        </div>
      )}

      <p className="lan-footer">{t('lan.footer')}</p>
    </div>
  );
}
