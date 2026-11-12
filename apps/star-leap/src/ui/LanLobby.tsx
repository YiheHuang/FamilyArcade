import type { LanPublicPeer } from '@family-arcade/lan';
import { Button, Segmented, type T } from './components';
import { seatTheme } from './theme';

function SeatMark({ seat }: { seat: number }) {
  const th = seatTheme(seat);
  return (
    <span className={`seat-dot seat-dot--${th.mark}`} style={{ background: th.color }} aria-hidden>
      <span className="seat-dot__mark" />
    </span>
  );
}

function seatName(players: LanPublicPeer[], seat: number, fallback: string): string {
  return players.find((player) => player.seat === seat)?.name || fallback;
}

export function LanSeatList({
  t,
  players,
  count,
  youSeat = null,
}: {
  t: T;
  players: LanPublicPeer[];
  count: number;
  youSeat?: number | null;
}) {
  return (
    <ol className="lan-seats" aria-label={t('lan.title')}>
      {Array.from({ length: count }, (_, seat) => {
        const player = players.find((item) => item.seat === seat);
        const online = seat === 0 || Boolean(player?.connected);
        return (
          <li key={seat} className={`lan-seat${online ? ' is-online' : ''}`} data-testid={`lan-seat-${seat}`}>
            <SeatMark seat={seat} />
            <span className="lan-seat__name">
              <strong>{seatName(players, seat, seat === 0 ? t('lan.hostSeat') : t('lan.waitingSeat'))}</strong>
              <small>{seat === 0 ? t('lan.hostSeat') : t('lan.seatShort', { n: seat + 1 })}</small>
            </span>
            {youSeat === seat && <span className="pill">{t('game.you')}</span>}
            <span className={`lan-seat__state${online ? ' is-online' : ''}`}>
              {online ? t('lan.online') : t('lan.waitingSeat')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function LanHostLobby({
  t,
  busy,
  error,
  code,
  room,
  invite,
  qr,
  players,
  count,
  canStart,
  missing,
  extra,
  onCount,
  onStart,
  onCopyInvite,
  onCopyCode,
  onRetry,
  onBack,
}: {
  t: T;
  busy: boolean;
  error: string;
  code: string;
  room: string;
  invite: string;
  qr: string;
  players: LanPublicPeer[];
  count: 2 | 3 | 4;
  canStart: boolean;
  missing: number;
  extra: number;
  onCount: (count: 2 | 3 | 4) => void;
  onStart: () => void;
  onCopyInvite: () => void;
  onCopyCode: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="lan screen" data-testid="lan-host-lobby">
      <header className="subhead">
        <button type="button" className="text-btn" onClick={onBack}>
          ← {t('lan.back')}
        </button>
        <div>
          <p className="eyebrow">FAMILY ARCADE · LAN</p>
          <h1>{t('lan.hostTitle')}</h1>
          <p className="muted">{t('lan.subtitle')}</p>
        </div>
        <span className="pill">{t('home.lanBadge')}</span>
      </header>

      {error && (
        <div className="notice notice--error" role="alert">
          <span>{error}</span>
          <Button onClick={onRetry}>{t('lan.retry')}</Button>
        </div>
      )}

      <div className="lan__grid">
        <section className="panel lan__setup">
          <div className="field">
            <span className="field__label">{t('lan.players')}</span>
            <Segmented
              value={count}
              label={t('lan.players')}
              options={[
                { value: 2 as const, label: '2' },
                { value: 3 as const, label: '3' },
                { value: 4 as const, label: '4' },
              ]}
              onChange={onCount}
            />
          </div>

          <div className="lan__section-head">
            <h2>{t('lan.hostSeat')}</h2>
            <span className="muted">{t('lan.online')}</span>
          </div>
          <LanSeatList t={t} players={players} count={count} youSeat={0} />

          {busy && <p className="hint-text">{t('lan.creating')}</p>}
          {!busy && missing > 0 && <p className="hint-text">{t('lan.needGuests', { n: missing })}</p>}
          {!busy && missing === 0 && <p className="hint-text">{t('lan.ready')}</p>}
          {extra > 0 && <p className="hint-text">{t('lan.extraWatching', { n: extra })}</p>}

          <Button testId="lan-start" variant="primary" wide onClick={onStart} disabled={!canStart || busy}>
            {t('lan.start')} →
          </Button>

          <div className="lan__help">
            <p>{t('lan.browserHint')}</p>
            <p>{t('lan.desktopHint')}</p>
            <p>{t('lan.firewallHint')}</p>
          </div>
        </section>

        <aside className="panel lan__invite">
          <p className="eyebrow">{t('lan.inviteTitle')}</p>
          <div className="lan-code">
            <span>{t('lan.roomCode')}</span>
            <strong data-testid="lan-room-code">{code || '····'}</strong>
            {room && room !== code && <small>{t('lan.room', { room })}</small>}
          </div>

          <div className="lan-qr" data-testid="lan-qr">
            {qr ? <img src={qr} alt={t('lan.scan')} width={320} height={320} /> : <div className="lan-qr__empty" aria-hidden />}
          </div>
          <p className="center muted">{qr ? t('lan.scan') : t('lan.creating')}</p>
          {invite && <code className="lan-url" data-testid="lan-invite-url">{invite.replace(/^https?:\/\//, '')}</code>}
          <div className="lan__copy">
            <Button onClick={onCopyInvite} disabled={!invite}>
              {t('lan.copyInvite')}
            </Button>
            <Button onClick={onCopyCode} disabled={!code}>
              {t('lan.copyCode')}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function LanGuestLobby({
  t,
  busy,
  error,
  room,
  code,
  name,
  token,
  players,
  seat,
  count,
  joined,
  started,
  onName,
  onCode,
  onToken,
  onJoin,
  onReconnect,
  onEnter,
  onCopyToken,
  onBack,
}: {
  t: T;
  busy: boolean;
  error: string;
  room: string;
  code: string;
  name: string;
  token: string;
  players: LanPublicPeer[];
  seat: number;
  count: number;
  joined: boolean;
  started: boolean;
  onName: (value: string) => void;
  onCode: (value: string) => void;
  onToken: (value: string) => void;
  onJoin: () => void;
  onReconnect: () => void;
  onEnter: () => void;
  onCopyToken: () => void;
  onBack: () => void;
}) {
  return (
    <div className="lan screen" data-testid="lan-guest-lobby">
      <header className="subhead">
        <button type="button" className="text-btn" onClick={onBack}>
          ← {t('lan.back')}
        </button>
        <div>
          <p className="eyebrow">FAMILY ARCADE · LAN</p>
          <h1>{t('lan.guestTitle')}</h1>
          <p className="muted">{room ? t('lan.room', { room }) : t('lan.joinDesc')}</p>
        </div>
        <span className="pill">{joined ? t('lan.joined') : t('home.lanBadge')}</span>
      </header>

      {error && (
        <div className="notice notice--error" role="alert">
          <span>{error}</span>
          {joined && <Button onClick={onReconnect}>{t('lan.reconnect')}</Button>}
        </div>
      )}

      <div className="lan__grid">
        <section className="panel lan__setup">
          {!joined ? (
            <>
              <p className="lede">{t('lan.joinDesc')}</p>
              <label className="field">
                <span className="field__label">{t('lan.name')}</span>
                <input className="input" value={name} maxLength={18} onChange={(e) => onName(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">{t('lan.code')}</span>
                <input
                  className="input"
                  value={code}
                  inputMode="numeric"
                  maxLength={8}
                  onChange={(e) => onCode(e.target.value.replace(/\D/g, ''))}
                />
              </label>
              <label className="field">
                <span className="field__label">{t('lan.tokenTitle')}</span>
                <input
                  className="input mono-input"
                  value={token}
                  maxLength={64}
                  onChange={(e) => onToken(e.target.value)}
                  data-testid="lan-token-input"
                />
              </label>
              <p className="hint-text">{t('lan.tokenHint')}</p>
              <Button testId="lan-join" variant="primary" wide onClick={onJoin} disabled={busy || !name.trim() || !room}>
                {busy ? t('lan.joining') : t('lan.join')} →
              </Button>
            </>
          ) : (
            <>
              <p className="lede">{t('lan.seatShort', { n: seat + 1 })}</p>

              <LanSeatList t={t} players={players} count={Math.max(count, 2)} youSeat={seat} />

              <div className="lan-token">
                <div>
                  <span className="field__label">{t('lan.tokenTitle')}</span>
                  <code data-testid="lan-token">{token || '—'}</code>
                </div>
                <Button onClick={onCopyToken} disabled={!token}>
                  {t('lan.copyToken')}
                </Button>
              </div>
              <p className="hint-text">{t('lan.tokenHint')}</p>

              {started ? (
                <Button testId="lan-enter" variant="primary" wide onClick={onEnter}>
                  {t('lan.enter')} →
                </Button>
              ) : (
                <p className="waiting-pulse" role="status">{t('lan.waitingHost')}</p>
              )}
              <Button onClick={onReconnect} disabled={busy}>
                {busy ? t('lan.joining') : t('lan.reconnect')}
              </Button>
            </>
          )}
        </section>

        <aside className="panel lan__invite lan__invite--guest">
          <p className="eyebrow">{t('lan.guestTitle')}</p>
          <div className="lan-code">
            <span>{t('lan.roomCode')}</span>
            <strong>{code || '····'}</strong>
            {room && room !== code && <small>{t('lan.room', { room })}</small>}
          </div>
          <div className="lan-guest-art" aria-hidden>
            <span className="lan-guest-art__ring" />
            <span className="lan-guest-art__ring" />
            <span className="lan-guest-art__ring" />
            <span className="lan-guest-art__star">✦</span>
          </div>
          <p className="center muted">{t('lan.browserHint')}</p>
          {!joined && <p className="center hint-text">{t('lan.noAnswer')}</p>}
        </aside>
      </div>
    </div>
  );
}
