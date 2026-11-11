import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { enter } from '../scene-utils';
import { ACCENT, CARD, INK, LINE, MUTED, SERIF, SANS } from '../theme';

export function Rules({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const shotIn = enter(frame, fps, 0.35, 1);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 120, top: 118, width: 860 }}>
        <p style={{ fontFamily: SANS, fontSize: 20, letterSpacing: '0.24em', color: ACCENT, fontWeight: 700, margin: 0 }}>
          {lang === 'zh' ? '五句话里的三句' : 'THREE LINES, THEN FLY'}
        </p>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 92 : 90,
            lineHeight: 1.03,
            color: INK,
            margin: '16px 0 0',
            fontWeight: 600,
            opacity: enter(frame, fps, 0.1),
          }}
        >
          {copy.rulesTitle}
        </h2>

        <div style={{ marginTop: 52 }}>
          {copy.rules.map((rule, index) => {
            const progress = enter(frame, fps, 0.55 + index * 0.52, 0.7);
            return (
              <div
                key={rule.num}
                style={{
                  display: 'flex',
                  gap: 24,
                  alignItems: 'flex-start',
                  padding: '20px 0',
                  borderTop: index === 0 ? 'none' : `1px solid ${LINE}`,
                  opacity: progress,
                  translate: `${interpolate(progress, [0, 1], [-42, 0])}px 0`,
                }}
              >
                <span style={{ fontFamily: SERIF, fontSize: 42, color: ACCENT, minWidth: 64, lineHeight: 1 }}>
                  {rule.num}
                </span>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 38, color: INK, fontWeight: 600 }}>{rule.title}</div>
                  <p style={{ fontFamily: SANS, fontSize: 25, lineHeight: 1.45, color: MUTED, marginTop: 7, maxWidth: 720 }}>
                    {rule.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 1030,
          top: 150,
          width: 790,
          opacity: shotIn,
          scale: interpolate(shotIn, [0, 1], [0.93, 1]),
          rotate: '-1.4deg',
        }}
      >
        <div
          style={{
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 26,
            padding: 14,
            boxShadow: '0 34px 72px rgba(62,49,31,0.16)',
          }}
        >
          <Img
            src={staticFile(`shots/${lang}/game-select.png`)}
            alt={lang === 'zh' ? '真实游戏中的秘密支持面板' : 'The real secret support panel'}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16 }}
          />
        </div>
        <p style={{ fontFamily: SANS, fontSize: 18, color: MUTED, textAlign: 'center', marginTop: 16 }}>
          {lang === 'zh' ? '真实截图 · 第 3 / 4 轮 · 同屏热座' : 'Real screenshot · Round 3 of 4 · Hot-seat'}
        </p>
      </div>
    </AbsoluteFill>
  );
}
