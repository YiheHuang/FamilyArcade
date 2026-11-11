import type { LanPublicPeer } from '@family-arcade/lan';
import type { PlayerCount } from '../game/types';
import { Button, Segmented, type T } from './components';

export function LanHostSetup({
  t,
  playerCount,
  onPlayerCount,
  hostName,
  onHostName,
  busy,
  error,
  onCreate,
  onJoin,
  onBack,
}: {
  t: T;
  playerCount: PlayerCount;
  onPlayerCount: (count: PlayerCount) => void;
  hostName: string;
  onHostName: (name: string) => void;
  busy: boolean;
  error: string;
  onCreate: () => void;
  onJoin: () => void;
  onBack: () => void;
}) {
  return (
    <div className="lan-screen screen" data-testid="lan-host-setup">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="lan-back" onClick={onBack}>
          ← {t('lan.backHome')}
        </button>
        <div>
          <div className="eyebrow">FAMILY ARCADE · LAN</div>
          <h1>{t('lan.hostTitle')}</h1>
          <p className="muted">{t('lan.hostDesc')}</p>
        </div>
        <span />
      </header>

      <div className="lan-grid">
        <section className="panel lan-form">
          <div className="field">
            <span className="field__label">{t('lan.players')}</span>
            <Segmented
              value={playerCount}
              label={t('lan.players')}
              testId="lan-count"
              options={[2, 3, 4, 5].map((value) => ({ value, label: String(value) }))}
              onChange={(value) => onPlayerCount(value as PlayerCount)}
            />
          </div>
          <div className="field">
            <span className="field__label">{t('lan.hostName')}</span>
            <input
              className="input"
              value={hostName}
              maxLength={16}
              placeholder={t('lan.hostNamePlaceholder')}
              onChange={(event) => onHostName(event.target.value)}
              data-testid="lan-host-name"
            />
            <span className="hint-text">{t('lan.hostNameHint')}</span>
          </div>
          {error && <div className="hint-box hint-box--warn">{error}</div>}
          <div className="lan-form-actions">
            <Button testId="lan-create" variant="primary" onClick={onCreate} disabled={busy || !hostName.trim()}>
              {busy ? t('lan.starting') : t('lan.create')} →
            </Button>
            <Button testId="lan-join-link" onClick={onJoin}>
              {t('lan.joinLink')}
            </Button>
          </div>
          <p className="privacy-note">
            <span aria-hidden>◐</span> {t('lan.secure')}
          </p>
        </section>

        <aside className="panel lan-explainer">
          <div className="eyebrow">{t('lan.lobby')}</div>
          <h2>{t('lan.secure')}</h2>
          <ol className="lan-steps">
            <li>{t('lan.hostHint')}</li>
            <li>{t('lan.copyHint')}</li>
            <li>{t('lan.lanOnly')}</li>
            <li>{t('lan.reconnectHint')}</li>
          </ol>
          <div className="lan-mini-row">
            <span className="pill">2–5</span>
            <span className="pill">Wi-Fi</span>
            <span className="pill">QR</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SeatRow({
  t,
  seat,
  player,
  isHostSeat,
}: {
  t: T;
  seat: number;
  player: LanPublicPeer | undefined;
  isHostSeat: boolean;
}) {
  const connected = Boolean(player?.connected);
  return (
    <div className={`lan-seat${connected ? ' is-online' : ''}`} data-testid={`lan-seat-${seat}`}>
      <span className={`lan-seat__dot${connected ? ' is-online' : ''}`} aria-hidden />
      <span className="lan-seat__name">
        {player?.name ?? (isHostSeat ? t('lan.hostSeat') : t('lan.seat', { n: seat + 1 }))}
        {isHostSeat && <span className="pill">{t('lan.hostBadge')}</span>}
      </span>
      <span className="lan-seat__state">
        {connected ? t('lan.online') : t('lan.seatOpen')}
      </span>
    </div>
  );
}

export function LanHostLobby({
  t,
  room,
  code,
  invite,
  qr,
  players,
  playerCount,
  busy,
  error,
  onStart,
  onCopy,
  onClose,
}: {
  t: T;
  room: string;
  code: string;
  invite: string;
  qr: string;
  players: LanPublicPeer[];
  playerCount: PlayerCount;
  busy: boolean;
  error: string;
  onStart: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const connected = players.filter((player) => player.connected).length;
  const ready = connected >= playerCount;
  return (
    <div className="lan-screen screen" data-testid="lan-host-lobby">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="lan-back" onClick={onClose}>
          ← {t('lan.backHome')}
        </button>
        <div>
          <div className="eyebrow">{t('lan.lobby')}</div>
          <h1>{t('lan.hostTitle')}</h1>
          <p className="muted">{t('lan.hostDesc')}</p>
        </div>
        <span />
      </header>

      <div className="lan-grid">
        <section className="panel lan-room-card">
          <div className="lan-code-row">
            <div>
              <span className="field__label">{t('lan.room')}</span>
              <strong className="room-code" data-testid="lan-room">
                {room}
              </strong>
            </div>
            <div>
              <span className="field__label">{t('lan.code')}</span>
              <strong className="room-code" data-testid="lan-code">
                {code}
              </strong>
            </div>
          </div>

          <div className="lan-share">
            <div className="lan-qr">
              {qr ? (
                <img src={qr} width={190} height={190} alt={t('lan.qrAlt')} data-testid="lan-qr" />
              ) : (
                <span className="hint-text">{t('lan.waitQr')}</span>
              )}
            </div>
            <div className="lan-share__copy">
              <div className="eyebrow">{t('lan.scan')}</div>
              <p className="hint-text">{t('lan.copyHint')}</p>
              <code className="lan-invite" data-testid="lan-invite">
                {invite}
              </code>
              <Button testId="lan-copy" onClick={onCopy}>
                {t('lan.copy')}
              </Button>
            </div>
          </div>

          <p className="privacy-note">
            <span aria-hidden>◐</span> {t('lan.secure')}
          </p>
          <p className="hint-text">{t('lan.lanOnly')}</p>
        </section>

        <aside className="panel lan-seats-panel">
          <div className="lan-seats-head">
            <div>
              <div className="eyebrow">{t('lan.seatsTitle')}</div>
              <h2>{t('lan.playersConnected', { n: connected, m: playerCount })}</h2>
            </div>
            <span className={`pill${ready ? ' is-ready' : ''}`}>{ready ? t('lan.ready') : t('lan.waiting')}</span>
          </div>

          <div className="lan-seats">
            {Array.from({ length: playerCount }, (_, seat) => (
              <SeatRow
                key={seat}
                t={t}
                seat={seat}
                player={players.find((player) => player.seat === seat)}
                isHostSeat={seat === 0}
              />
            ))}
          </div>

          {error && <div className="hint-box hint-box--warn">{error}</div>}
          <p className="hint-text">{ready ? t('lan.startHint') : t('lan.startWhenReady')}</p>
          <Button testId="lan-start" variant="primary" onClick={onStart} disabled={!ready || busy}>
            {t('lan.start')} →
          </Button>
          <p className="hint-text">{t('lan.reconnectHint')}</p>
        </aside>
      </div>
    </div>
  );
}

export function LanGuestJoin({
  t,
  room,
  onRoom,
  code,
  onCode,
  name,
  onName,
  busy,
  error,
  onJoin,
  onHost,
  onBack,
}: {
  t: T;
  room: string;
  onRoom: (value: string) => void;
  code: string;
  onCode: (value: string) => void;
  name: string;
  onName: (value: string) => void;
  busy: boolean;
  error: string;
  onJoin: () => void;
  onHost: () => void;
  onBack: () => void;
}) {
  return (
    <div className="lan-screen screen" data-testid="lan-guest-join">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="lan-back" onClick={onBack}>
          ← {t('lan.backHome')}
        </button>
        <div>
          <div className="eyebrow">FAMILY ARCADE · LAN</div>
          <h1>{t('lan.joinTitle')}</h1>
          <p className="muted">{t('lan.joinDesc')}</p>
        </div>
        <span />
      </header>

      <div className="lan-grid">
        <section className="panel lan-form">
          <div className="lan-field-grid">
            <label className="field">
              <span className="field__label">{t('lan.room')}</span>
              <input
                className="input"
                value={room}
                onChange={(event) => onRoom(event.target.value)}
                placeholder={t('lan.roomPlaceholder')}
                inputMode="numeric"
                maxLength={8}
                data-testid="lan-room-input"
              />
            </label>
            <label className="field">
              <span className="field__label">{t('lan.code')}</span>
              <input
                className="input"
                value={code}
                onChange={(event) => onCode(event.target.value)}
                placeholder={t('lan.codePlaceholder')}
                inputMode="numeric"
                maxLength={6}
                data-testid="lan-code-input"
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">{t('lan.name')}</span>
            <input
              className="input"
              value={name}
              onChange={(event) => onName(event.target.value)}
              placeholder={t('lan.namePlaceholder')}
              maxLength={16}
              data-testid="lan-name-input"
            />
          </label>
          {error && <div className="hint-box hint-box--warn">{error}</div>}
          <div className="lan-form-actions">
            <Button
              testId="lan-join"
              variant="primary"
              onClick={onJoin}
              disabled={busy || !room.trim() || !name.trim()}
            >
              {busy ? t('lan.connecting') : t('lan.join')} →
            </Button>
            <Button testId="lan-host-link" onClick={onHost}>
              {t('lan.hostLink')}
            </Button>
          </div>
          <p className="hint-text">{t('lan.roomCodeHint')}</p>
          <p className="privacy-note">
            <span aria-hidden>◐</span> {t('lan.joinHint')}
          </p>
        </section>

        <aside className="panel lan-explainer">
          <div className="eyebrow">{t('lan.connection')}</div>
          <h2>{t('lan.secure')}</h2>
          <ol className="lan-steps">
            <li>{t('lan.joinHint')}</li>
            <li>{t('lan.guestControls')}</li>
            <li>{t('lan.reconnectStatus')}</li>
            <li>{t('lan.spectatorGap')}</li>
          </ol>
          <div className="lan-mini-row">
            <span className="pill">Wi-Fi</span>
            <span className="pill">QR</span>
            <span className="pill">LAN</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function LanGuestLobby({
  t,
  room,
  code,
  seat,
  players,
  onClose,
}: {
  t: T;
  room: string;
  code: string;
  seat: number;
  players: LanPublicPeer[];
  onClose: () => void;
}) {
  return (
    <div className="lan-screen screen" data-testid="lan-guest-lobby">
      <header className="subhead">
        <button type="button" className="text-btn" data-testid="lan-back" onClick={onClose}>
          ← {t('lan.backHome')}
        </button>
        <div>
          <div className="eyebrow">{t('lan.lobby')}</div>
          <h1>{t('lan.joinTitle')}</h1>
          <p className="muted">{t('lan.roomAndCode', { room, code })}</p>
        </div>
        <span />
      </header>

      <div className="lan-grid">
        <section className="panel lan-room-card">
          <div className="lan-code-row">
            <div>
              <span className="field__label">{t('lan.room')}</span>
              <strong className="room-code">{room}</strong>
            </div>
            <div>
              <span className="field__label">{t('lan.yourSeat')}</span>
              <strong className="room-code">{seat + 1}</strong>
            </div>
          </div>
          <div className="lan-wait-card">
            <span className="thinking-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            <h2>{t('lan.waitingHost')}</h2>
            <p className="hint-text">{t('lan.guestWaitingForStart')}</p>
          </div>
          <p className="hint-text">{t('lan.reconnectHint')}</p>
        </section>

        <aside className="panel lan-seats-panel">
          <div className="lan-seats-head">
            <div>
              <div className="eyebrow">{t('lan.seatsTitle')}</div>
              <h2>{t('lan.playersConnected', { n: players.filter((player) => player.connected).length, m: players.length || '—' })}</h2>
            </div>
            <span className="pill">{t('lan.youAreGuest')}</span>
          </div>
          <div className="lan-seats">
            {players.map((player) => (
              <SeatRow key={player.seat} t={t} seat={player.seat} player={player} isHostSeat={player.seat === 0} />
            ))}
          </div>
          <p className="hint-text">{t('lan.startWhenReady')}</p>
        </aside>
      </div>
    </div>
  );
}
