import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BalloonArt } from '../BalloonArt';
import { COPY, type Lang } from '../copy';
import { enter } from '../scene-utils';
import { BALLOON, CARD, INK, LINE, MUTED, SERIF, SANS, ACCENT, GOLD } from '../theme';

export function Title({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const titleIn = enter(frame, fps, 0.1, 0.9);
  const taglineIn = enter(frame, fps, 0.55);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 1420,
          borderRadius: 42,
          border: `1px solid ${LINE}`,
          background: 'rgba(255,253,248,0.76)',
          boxShadow: '0 30px 90px rgba(62,49,31,0.11)',
          padding: '62px 80px 58px',
          textAlign: 'center',
          scale: interpolate(titleIn, [0, 1], [0.94, 1]),
          opacity: titleIn,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', gap: 26, marginBottom: 12 }}>
          {BALLOON.map((balloon, index) => (
            <div
              key={balloon.id}
              style={{
                opacity: enter(frame, fps, 0.18 + index * 0.06),
                translate: `0 ${interpolate(enter(frame, fps, 0.18 + index * 0.06), [0, 1], [24, 0])}px`,
              }}
            >
              <BalloonArt balloon={balloon} size={64} />
            </div>
          ))}
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 156 : 144,
            lineHeight: 0.98,
            letterSpacing: lang === 'zh' ? '-0.05em' : '-0.055em',
            color: INK,
            fontWeight: 600,
          }}
        >
          {copy.wordmark}
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 30,
            letterSpacing: '0.34em',
            textTransform: 'uppercase',
            color: GOLD,
            marginTop: 24,
            fontWeight: 700,
          }}
        >
          {copy.nameSub}
        </div>
        <div style={{ width: 90, height: 2, background: ACCENT, margin: '34px auto 0', opacity: 0.6 }} />
        <p
          style={{
            fontFamily: SERIF,
            fontSize: 52,
            color: INK,
            marginTop: 24,
            opacity: taglineIn,
            translate: `0 ${interpolate(taglineIn, [0, 1], [18, 0])}px`,
          }}
        >
          {copy.tagline}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 28 }}>
          {['2–6', lang === 'zh' ? '20–25 分钟' : '20–25 min', lang === 'zh' ? '8 岁+' : 'Ages 8+', lang === 'zh' ? '离线' : 'Offline'].map(
            (item) => (
              <span
                key={item}
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
                {item}
              </span>
            ),
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}
