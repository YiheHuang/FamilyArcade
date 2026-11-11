import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { enter } from '../scene-utils';
import { ACCENT, CARD, INK, LINE, MUTED, SERIF, SANS } from '../theme';

export function Details({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const shotIn = enter(frame, fps, 0.5, 1);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 120, top: 115, width: 790 }}>
        <p style={{ fontFamily: SANS, fontSize: 20, letterSpacing: '0.24em', color: ACCENT, fontWeight: 700, margin: 0 }}>
          {lang === 'zh' ? '小事也照顾到' : 'SMALL THINGS, LOOKED AFTER'}
        </p>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 88 : 86,
            lineHeight: 1.03,
            color: INK,
            margin: '14px 0 0',
            fontWeight: 600,
            opacity: enter(frame, fps, 0.1),
          }}
        >
          {copy.detailsTitle}
        </h2>
        <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {copy.details.map((item, index) => {
            const progress = enter(frame, fps, 0.45 + index * 0.28);
            return (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  opacity: progress,
                  translate: `${interpolate(progress, [0, 1], [-24, 0])}px 0`,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    background: ACCENT,
                    color: '#fffdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 17,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </span>
                <span style={{ fontFamily: SANS, fontSize: 32, color: INK }}>{item}</span>
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: 'inline-flex',
            marginTop: 38,
            padding: '10px 16px',
            borderRadius: 999,
            background: 'rgba(93,129,100,0.12)',
            color: ACCENT,
            fontFamily: SANS,
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {copy.detailsFoot}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 100,
          top: 180,
          width: 900,
          opacity: shotIn,
          scale: interpolate(shotIn, [0, 1], [0.94, 1]),
          rotate: '1.1deg',
        }}
      >
        <div
          style={{
            background: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 26,
            padding: 14,
            boxShadow: '0 34px 74px rgba(62,49,31,0.15)',
          }}
        >
          <Img
            src={staticFile(`shots/${lang}/stats.png`)}
            alt={lang === 'zh' ? '家庭战绩与最爱气球' : 'Family record and favourite balloon'}
            style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 16 }}
          />
        </div>
        <p style={{ fontFamily: SANS, fontSize: 18, color: MUTED, textAlign: 'center', marginTop: 14 }}>
          {lang === 'zh' ? '真实截图 · 本地战绩 · 不含设备信息' : 'Real screenshot · local stats · no device data'}
        </p>
      </div>
    </AbsoluteFill>
  );
}
