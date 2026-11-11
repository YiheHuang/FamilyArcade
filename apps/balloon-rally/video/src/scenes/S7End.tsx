import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BalloonArt } from '../BalloonArt';
import { COPY, type Lang } from '../copy';
import { enter } from '../scene-utils';
import { BALLOON, CARD, GOLD, INK, LINE, MUTED, SERIF, SANS, ACCENT } from '../theme';

export function End({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const titleIn = enter(frame, fps, 0.2, 0.9);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', top: 110, display: 'flex', gap: 34 }}>
        {BALLOON.map((balloon, index) => {
          const progress = enter(frame, fps, 0.05 + index * 0.09, 1.2);
          return (
            <div
              key={balloon.id}
              style={{
                opacity: progress,
                translate: `0 ${interpolate(progress, [0, 1], [180, Math.sin(frame / 36 + index) * 8])}px`,
                rotate: `${interpolate(progress, [0, 1], [index % 2 === 0 ? -7 : 7, index % 2 === 0 ? -1.5 : 1.5])}deg`,
              }}
            >
              <BalloonArt balloon={balloon} size={86} />
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 110 }}>
        <p style={{ fontFamily: SANS, fontSize: 20, letterSpacing: '0.26em', color: GOLD, fontWeight: 700, opacity: titleIn }}>
          {copy.endKicker}
        </p>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 176 : 160,
            lineHeight: 0.98,
            letterSpacing: lang === 'zh' ? '-0.05em' : '-0.055em',
            color: INK,
            margin: '20px 0 0',
            fontWeight: 600,
            opacity: titleIn,
            scale: interpolate(titleIn, [0, 1], [0.94, 1]),
          }}
        >
          {copy.endTitle}
        </h1>
        <p style={{ fontFamily: SERIF, fontSize: 50, color: INK, marginTop: 18, opacity: enter(frame, fps, 0.65) }}>
          {copy.endTagline}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 34, opacity: enter(frame, fps, 0.9) }}>
          {copy.endFacts.map((fact) => (
            <span
              key={fact}
              style={{
                fontFamily: SANS,
                fontSize: 18,
                fontWeight: 600,
                color: MUTED,
                border: `1px solid ${LINE}`,
                background: CARD,
                borderRadius: 999,
                padding: '8px 16px',
              }}
            >
              {fact}
            </span>
          ))}
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 38,
            borderTop: `1px solid ${LINE}`,
            paddingTop: 20,
            fontFamily: SANS,
            fontSize: 17,
            color: MUTED,
            opacity: enter(frame, fps, 1.25),
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, background: ACCENT }} />
          {copy.endNext}
        </div>
      </div>
    </AbsoluteFill>
  );
}
