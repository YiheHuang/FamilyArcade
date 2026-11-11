import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Board } from '../Board';
import { COPY, type Lang } from '../copy';
import game from '../data/game.json';
import { ACCENT, CARD, INK, LINE, MUTED, SEATS } from '../theme';

const snapshots = game.snapshots as Parameters<typeof Board>[0]['snapshot'][];
const facts = game.facts as { moves: number; home: number[] };

export function Game({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const copy = COPY[lang];
  const videoSnapshots = snapshots.slice(1);
  const sceneSeconds = 10.6;
  const index = Math.min(videoSnapshots.length - 1, Math.floor((t / sceneSeconds) * videoSnapshots.length));
  const snap = videoSnapshots[index];
  const local = t - (index * sceneSeconds) / videoSnapshots.length;
  const boardOpacity = interpolate(local, [0, 0.35], [0.55, 1], { extrapolateRight: 'clamp' });
  const names = lang === 'zh' ? ['蓝方', '金方'] : ['Blue', 'Gold'];

  return (
    <AbsoluteFill style={{ padding: '0 120px' }}>
      <div style={{ position: 'absolute', left: 100, top: 80, opacity: boardOpacity, filter: 'drop-shadow(0 30px 50px rgba(20,28,40,.24))' }}>
        <Board snapshot={snap} width={800} height={800} />
      </div>

      <div style={{ position: 'absolute', left: 1040, top: 120, width: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: ACCENT, boxShadow: '0 0 0 6px rgba(176,138,79,.16)' }} />
          <span style={{ fontSize: 18, letterSpacing: '0.24em', color: ACCENT, textTransform: 'uppercase' }}>{copy.gameLabel}</span>
        </div>
        <h2
          style={{
            fontFamily: '"Iowan Old Style", "Noto Serif SC", "Songti SC", "SimSun", Georgia, serif',
            fontSize: 76,
            lineHeight: 1.05,
            letterSpacing: '-0.035em',
            margin: '18px 0 0',
            color: INK,
            fontWeight: 600,
          }}
        >
          {lang === 'zh' ? '一局真实的棋。' : 'A real game.'}
        </h2>
        <p style={{ fontSize: 27, color: MUTED, marginTop: 12 }}>{copy.gameCaption}</p>

        <div
          style={{
            marginTop: 34,
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 24,
            padding: '26px 28px',
            boxShadow: '0 18px 44px rgba(48,39,26,.08)',
          }}
        >
          {[0, 1].map((seat) => (
            <div key={seat} style={{ marginBottom: seat === 0 ? 24 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: SEATS[seat].color, boxShadow: '0 2px 5px rgba(0,0,0,.2)' }} />
                <span style={{ fontSize: 28, fontWeight: 600, color: INK }}>{names[seat]}</span>
                <span style={{ marginLeft: 'auto', fontSize: 20, color: MUTED }}>
                  {copy.home} {snap.home[seat]} / 10
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(29,36,48,.08)', marginTop: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(snap.home[seat] / 10) * 100}%`, background: SEATS[seat].color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${LINE}`, marginTop: 22, paddingTop: 16 }}>
            <span style={{ fontSize: 18, letterSpacing: '0.16em', color: MUTED }}>{copy.turn}</span>
            <span style={{ fontSize: 20, color: INK, fontWeight: 600 }}>{snap.turn}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 40 }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 82, color: INK, lineHeight: 0.9 }}>{snap.moves}</span>
          <span style={{ fontSize: 18, letterSpacing: '0.2em', color: MUTED, textTransform: 'uppercase' }}>
            {lang === 'zh' ? '手' : 'MOVES'}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 18, color: MUTED, letterSpacing: '0.08em' }}>
            {lang === 'zh' ? '终局' : 'FINAL'} {facts.home[0]} : {facts.home[1]}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
}
