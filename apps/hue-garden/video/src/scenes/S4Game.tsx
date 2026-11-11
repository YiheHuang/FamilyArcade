import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { ACCENT, CARD, COLORS, INK, LINE, MUTED, SERIF, SANS } from '../theme';
import { Board, type Snapshot } from '../TileBoard';
import game from '../data/game.json';

const snapshots = game.snapshots as Snapshot[];
const facts = game.facts as {
  moves: number;
  tiles: number;
  scores: number[];
  blooms: number[];
  turns: number;
};

export function Game({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const sceneSeconds = 13.2;
  const progress = Math.min(1, t / sceneSeconds);
  const raw = Math.min(
    snapshots.length - 1,
    Math.floor(Math.pow(progress, 0.42) * snapshots.length),
  );
  const snapshot = snapshots[raw];
  const previous = snapshots[Math.max(0, raw - 1)];
  const prevCells = new Set(previous.board.map((tile) => `${tile.x},${tile.y}`));
  const highlight = snapshot.board
    .filter((tile) => !prevCells.has(`${tile.x},${tile.y}`))
    .map((tile) => ({ x: tile.x, y: tile.y }));
  const intro = interpolate(t, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });
  const scale = interpolate(t, [0, 13], [0.985, 1.01]);
  const names =
    lang === 'zh' ? ['林奶奶', '阿禾'] : ['Grandma Lin', 'Ahe'];
  const playerColors = [COLORS[0].hex, COLORS[1].hex];

  return (
    <AbsoluteFill style={{ padding: '0 100px', opacity: intro }}>
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: 112,
          transform: `scale(${scale})`,
          filter: 'drop-shadow(0 34px 52px rgba(48,35,20,.17))',
        }}
      >
        <Board snapshot={snapshot} width={900} height={900} highlight={highlight} />
      </div>

      <div style={{ position: 'absolute', left: 1040, top: 104, width: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: ACCENT, boxShadow: '0 0 0 6px rgba(176,138,79,.16)' }} />
          <span style={{ fontSize: 18, letterSpacing: '0.24em', color: ACCENT, textTransform: 'uppercase' }}>
            {copy.gameKicker}
          </span>
        </div>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: 72,
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
            margin: '18px 0 0',
            color: INK,
            fontWeight: 600,
          }}
        >
          {copy.gameTitle}
        </h2>
        <p style={{ fontFamily: SANS, fontSize: 26, color: MUTED, marginTop: 10 }}>{copy.gameCaption}</p>

        <div
          style={{
            marginTop: 30,
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 24,
            padding: '24px 28px',
            boxShadow: '0 18px 44px rgba(48,39,26,.08)',
          }}
        >
          {[0, 1].map((seat) => (
            <div key={seat} style={{ marginBottom: seat === 0 ? 22 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: playerColors[seat] }} />
                <span style={{ fontSize: 27, fontWeight: 600, color: INK }}>{names[seat]}</span>
                <span style={{ marginLeft: 'auto', fontSize: 20, color: MUTED }}>
                  {copy.blooms} {snapshot.blooms[seat]}
                </span>
                <span style={{ fontFamily: SERIF, fontSize: 32, color: INK, minWidth: 64, textAlign: 'right' }}>
                  {snapshot.scores[seat]}
                </span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(36,48,58,.08)', marginTop: 9, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (snapshot.scores[seat] / 240) * 100)}%`,
                    background: playerColors[seat],
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${LINE}`, marginTop: 20, paddingTop: 14 }}>
            <span style={{ fontSize: 16, letterSpacing: '0.16em', color: MUTED }}>{copy.turn}</span>
            <span style={{ fontSize: 19, color: INK, fontWeight: 600 }}>{snapshot.turn}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 34 }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 76, color: INK, lineHeight: 0.9 }}>{snapshot.moves}</span>
          <span style={{ fontSize: 17, letterSpacing: '0.2em', color: MUTED, textTransform: 'uppercase' }}>{copy.moves}</span>
          <span style={{ marginLeft: 'auto', fontSize: 17, color: MUTED, letterSpacing: '0.08em' }}>
            {lang === 'zh' ? '终局' : 'FINAL'} {facts.scores.join(' : ')}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
