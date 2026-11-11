import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BalloonArt } from '../BalloonArt';
import { COPY, type Lang } from '../copy';
import { enter } from '../scene-utils';
import { BALLOON, INK, MUTED, SERIF, SANS, ACCENT } from '../theme';

const PLACES = [
  { left: 80, top: 170, size: 168 },
  { left: 290, top: 40, size: 134 },
  { left: 470, top: 210, size: 190 },
  { left: 690, top: 60, size: 128 },
  { left: 390, top: 390, size: 150 },
];

export function Hook({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const textIn = enter(frame, fps, 0.15);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 130, top: 250, width: 820 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: textIn }}>
          <span style={{ width: 46, height: 2, background: ACCENT }} />
          <span style={{ fontFamily: SANS, fontSize: 22, letterSpacing: '0.24em', color: ACCENT, fontWeight: 700 }}>
            {copy.kicker}
          </span>
        </div>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 128 : 112,
            lineHeight: 1.02,
            letterSpacing: lang === 'zh' ? '-0.03em' : '-0.04em',
            color: INK,
            margin: '30px 0 0',
            fontWeight: 600,
            opacity: textIn,
            translate: `0 ${interpolate(textIn, [0, 1], [36, 0])}px`,
          }}
        >
          {copy.hookTop}
          <br />
          <span style={{ color: ACCENT }}>{copy.hookBottom}</span>
        </h1>
        <p
          style={{
            fontFamily: SANS,
            fontSize: 38,
            lineHeight: 1.45,
            color: MUTED,
            marginTop: 34,
            maxWidth: 700,
            opacity: enter(frame, fps, 0.55),
          }}
        >
          {lang === 'zh'
            ? '五只气球、四轮风、全桌一起猜。20–25 分钟，2–6 人。'
            : 'One table guessing together. 20–25 minutes for 2–6 players.'}
        </p>
      </div>

      <div style={{ position: 'absolute', left: 1020, top: 120, width: 800, height: 720 }}>
        {BALLOON.map((balloon, index) => {
          const place = PLACES[index];
          const progress = enter(frame, fps, 0.1 + index * 0.14, 1.1);
          const float = Math.sin(frame / 34 + index * 1.7) * 9;
          return (
            <div
              key={balloon.id}
              style={{
                position: 'absolute',
                left: place.left,
                top: place.top + float,
                opacity: progress,
                translate: `0 ${interpolate(progress, [0, 1], [260, 0])}px`,
                scale: interpolate(progress, [0, 1], [0.82, 1]),
                filter: 'drop-shadow(0 24px 24px rgba(62,49,31,0.12))',
              }}
            >
              <BalloonArt balloon={balloon} size={place.size} />
              <div
                style={{
                  position: 'absolute',
                  right: -8,
                  bottom: 28,
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: '#fffdf8',
                  border: `2px solid ${balloon.color}`,
                  color: INK,
                  fontFamily: SANS,
                  fontSize: 18,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {index + 1}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
