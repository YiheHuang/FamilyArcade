import type { Lang } from '../i18n';
import { Button, SeatMark, Segmented, type T } from './components';

export interface LanSeatView {
  seat: number;
  name: string;
  connected: boolean;
  host: boolean;
}

function SeatList({
  t,
  seats,
  playerCount,
}: {
  t: T;
  seats: LanSeatView[];
  playerCount: number;
}) {
  return (
    <ul className="lan-seats" data-testid="lan-seats">
      {Array.from({ length: playerCount }, (_, seat) => {
        const row = seats.find((item) => item.seat === seat);
        const connected = Boolean(row?.connected);
        return (
          <li key={seat} className={`lan-seat${connected ? ' is-online' : ''}`} data-testid={`lan-seat-${seat}`}>
            <SeatMark seat={seat} size={22} />
            <span className="lan-seat__name">
              {row?.name || t('lan.waitingSeat')}
              {seat === 0 && <span className="pill pill--muted">{t('lan.hostBadge')}</span>}
            </span>
            <span className={`lan-seat__status${connected ? ' is-online' : ''}`}>
              <i aria-hidden />
              {connected ? t('lan.online') : t('lan.offline')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function LanHostScreen({
  t,
  lang,
  playerCount,
  onPlayerCount,
  hostName,
  onHostName,
  created,
  code,
  invite,
  qr,
  seats,
  busy,
  error,
  onCopy,
  onCreate,
  onStart,
  onClose,
  onBack,
}: {
  t: T;
  lang: Lang;
  playerCount: 2 | 3 | 4;
  onPlayerCount: (value: 2 | 3 | 4) => void;
  hostName: string;
  onHostName: (value: string) => void;
  created: boolean;
  code: string;
  invite: string;
  qr: string;
  seats: LanSeatView[];
  busy: boolean;
  error: string;
  onCopy: () => void;
  onCreate: () => void;
  onStart: () => void;
  onClose: () => void;
  onBack: () => void;
}) {
  const online = seats.filter((seat) => seat.connected).length;
  const ready = online >= playerCount;
  return (
    <div className="lan screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('lan.back')}
        </button>
        <div>
          <h1>{t('lan.titleHost')}</h1>
          <p className="muted">{t('lan.subtitleHost')}</p>
        </div>
        <span />
      </header>

      <div className="lan__grid">
        <section className="panel lan__main">
          {!created ? (
            <>
              <div className="field">
                <span className="field__label">{t('lan.players')}</span>
                <Segmented
                  value={playerCount}
                  label={t('lan.players')}
                  options={[
                    { value: 2, label: '2' },
                    { value: 3, label: '3' },
                    { value: 4, label: '4' },
                  ]}
                  onChange={onPlayerCount}
                />
              </div>
              <label className="field">
                <span className="field__label">{t('lan.hostName')}</span>
                <input
                  className="input"
                  value={hostName}
                  maxLength={18}
                  onChange={(event) => onHostName(event.target.value)}
                  aria-label={t('lan.hostName')}
                />
              </label>
              <div className="lan__notice">
                <strong>{t('lan.sameWifi')}</strong>
                <p>{t('lan.createHint')}</p>
              </div>
              {error && <p className="lan__error" data-testid="lan-error">{error}</p>}
              <Button variant="primary" wide testId="lan-create" onClick={onCreate} disabled={busy}>
                {busy ? t('lan.creating') : t('lan.create')} →
              </Button>
            </>
          ) : (
            <>
              <div className="lan-code-card">
                <div>
                  <span className="eyebrow">{t('lan.roomCode')}</span>
                  <div className="lan-code" data-testid="lan-code">{code}</div>
                  <p className="muted small">{t('lan.sameWifi')}</p>
                </div>
                {qr ? (
                  <img className="lan-qr" data-testid="lan-qr" src={qr} alt={t('lan.scan')} />
                ) : null}
              </div>
              <div className="lan-invite">
                <span className="eyebrow">{t('lan.invite')}</span>
                <code data-testid="lan-invite">{invite}</code>
                <Button onClick={onCopy} testId="lan-copy">{t('lan.copy')}</Button>
              </div>
              <div className="lan__seat-head">
                <span className="eyebrow">{t('lan.seats')}</span>
                <span className="muted small">
                  {t('lan.onlineCount', { n: online, total: playerCount })}
                </span>
              </div>
              <SeatList t={t} seats={seats} playerCount={playerCount} />
              {error && <p className="lan__error" data-testid="lan-error">{error}</p>}
              <div className="lan__actions">
                <Button variant="ghost" onClick={onClose}>{t('lan.close')}</Button>
                <Button
                  variant="primary"
                  testId="lan-start"
                  onClick={onStart}
                  disabled={!ready || busy}
                >
                  {t('lan.start')} →
                </Button>
              </div>
              {!ready && <p className="muted small">{t('lan.startHint')}</p>}
            </>
          )}
        </section>

        <aside className="lan__side">
          <section className="panel lan__steps">
            <p className="eyebrow">{lang === 'zh' ? '局域网三步' : 'LAN in three steps'}</p>
            <ol>
              <li>
                <strong>{lang === 'zh' ? '开房间' : 'Open a room'}</strong>
                <span>{lang === 'zh' ? '选人数，创建一个四位房间码。' : 'Pick a table size and get a 4-digit code.'}</span>
              </li>
              <li>
                <strong>{lang === 'zh' ? '让家人加入' : 'Bring the family in'}</strong>
                <span>{lang === 'zh' ? '扫码，或在中继页面输入房间码。' : 'Scan the QR, or enter the code on the relay page.'}</span>
              </li>
              <li>
                <strong>{lang === 'zh' ? '主机开始' : 'Host starts'}</strong>
                <span>{lang === 'zh' ? '所有人入座后由主机发牌。' : 'Once every seat is online, the host deals.'}</span>
              </li>
            </ol>
          </section>
          <section className="panel lan__side-note">
            <p className="eyebrow">{t('lan.room')}</p>
            <p className="muted small">{t('lan.reconnectHint')}</p>
            <p className="muted small">{t('home.lanDesc')}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export function LanGuestScreen({
  t,
  lang,
  room,
  code,
  name,
  onCode,
  onName,
  onJoin,
  onReconnect,
  onEnter,
  onLeave,
  connecting,
  joined,
  seat,
  seats,
  started,
  closed,
  error,
  onBack,
}: {
  t: T;
  lang: Lang;
  room: string;
  code: string;
  name: string;
  onCode: (value: string) => void;
  onName: (value: string) => void;
  onJoin: () => void;
  onReconnect: () => void;
  onEnter: () => void;
  onLeave: () => void;
  connecting: boolean;
  joined: boolean;
  seat: number;
  seats: LanSeatView[];
  started: boolean;
  closed: boolean;
  error: string;
  onBack: () => void;
}) {
  return (
    <div className="lan screen">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="back" onClick={onBack}>
          ← {t('lan.back')}
        </button>
        <div>
          <h1>{t('lan.titleGuest')}</h1>
          <p className="muted">{t('lan.subtitleGuest')}</p>
        </div>
        <span />
      </header>

      <div className="lan__grid">
        <section className="panel lan__main">
          {!joined ? (
            <>
              {room && (
                <div className="lan-room-banner">
                  <span className="eyebrow">{t('lan.room')}</span>
                  <strong>{room}</strong>
                </div>
              )}
              <label className="field">
                <span className="field__label">{t('lan.name')}</span>
                <input
                  className="input"
                  value={name}
                  maxLength={18}
                  onChange={(event) => onName(event.target.value)}
                  aria-label={t('lan.name')}
                />
              </label>
              <label className="field">
                <span className="field__label">{t('lan.code')}</span>
                <input
                  className="input input--code"
                  value={code}
                  maxLength={4}
                  inputMode="numeric"
                  onChange={(event) => onCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
                  aria-label={t('lan.code')}
                />
              </label>
              {error && <p className="lan__error" data-testid="lan-error">{error}</p>}
              <Button
                variant="primary"
                wide
                testId="lan-join"
                onClick={onJoin}
                disabled={connecting || !name.trim() || code.length !== 4}
              >
                {connecting ? t('lan.joining') : t('lan.join')} →
              </Button>
              <p className="muted small">{t('lan.guestHint')}</p>
            </>
          ) : (
            <>
              <div className="lan-guest-seat" data-testid="lan-guest-joined">
                <SeatMark seat={seat} size={34} />
                <div>
                  <span className="eyebrow">{t('lan.connected')}</span>
                  <strong>{t('lan.yourSeat', { n: seat + 1 })}</strong>
                  <p className="muted small">
                    {closed ? t('lan.connectionLost') : started ? t('lan.waitingStart') : t('lan.waitingHost')}
                  </p>
                </div>
              </div>
              <div className="lan__seat-head">
                <span className="eyebrow">{t('lan.seats')}</span>
                <span className="muted small">
                  {t('lan.onlineCount', {
                    n: seats.filter((row) => row.connected).length,
                    total: seats.length,
                  })}
                </span>
              </div>
              <SeatList t={t} seats={seats} playerCount={Math.max(2, seats.length)} />
              {error && <p className="lan__error" data-testid="lan-error">{error}</p>}
              <div className="lan__actions">
                <Button variant="ghost" onClick={onLeave}>{t('lan.leave')}</Button>
                {closed ? (
                  <Button variant="primary" testId="lan-reconnect" onClick={onReconnect}>
                    {t('lan.reconnect')} →
                  </Button>
                ) : started ? (
                  <Button variant="primary" testId="lan-enter" onClick={onEnter}>
                    {t('lan.enter')} →
                  </Button>
                ) : (
                  <span className="lan-waiting">{t('lan.waitingHost')}</span>
                )}
              </div>
              <p className="muted small">{t('lan.reconnectHint')}</p>
            </>
          )}
        </section>

        <aside className="lan__side">
          <section className="panel lan__steps">
            <p className="eyebrow">{lang === 'zh' ? '加入之前' : 'Before you join'}</p>
            <ol>
              <li>
                <strong>{lang === 'zh' ? '同一个 Wi-Fi' : 'Same Wi-Fi'}</strong>
                <span>{lang === 'zh' ? '手机和主机要在同一个局域网。' : 'Phone and host must be on the same network.'}</span>
              </li>
              <li>
                <strong>{lang === 'zh' ? '扫码或输码' : 'Scan or type'}</strong>
                <span>{lang === 'zh' ? '二维码会预填房间码；也可以手动输四位数字。' : 'The QR fills the room code; you can also type the 4 digits.'}</span>
              </li>
              <li>
                <strong>{lang === 'zh' ? '等主机开始' : 'Wait for the host'}</strong>
                <span>{lang === 'zh' ? '入座后主机发牌；断线后可以重连回原座位。' : 'The host deals once everyone is seated. Reconnect returns your seat.'}</span>
              </li>
            </ol>
          </section>
          <section className="panel lan__side-note">
            <p className="eyebrow">{t('lan.lanOnly')}</p>
            <p className="muted small">{t('lan.reconnectHint')}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
