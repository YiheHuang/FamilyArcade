import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COPY, type Lang } from '../copy';
import { enter } from '../scene-utils';
import { ACCENT, CARD, GOLD, INK, LINE, MUTED, SERIF, SANS } from '../theme';

export function Modes({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[lang];
  const phoneIn = enter(frame, fps, 0.55);

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 120, top: 100, width: 1160 }}>
        <p style={{ fontFamily: SANS, fontSize: 20, letterSpacing: '0.24em', color: ACCENT, fontWeight: 700, margin: 0 }}>
          {lang === 'zh' ? '怎么坐下都能玩' : 'ANY TABLE'}
        </p>
        <h2
          style={{
            fontFamily: SERIF,
            fontSize: lang === 'zh' ? 86 : 84,
            lineHeight: 1.03,
            color: INK,
            margin: '14px 0 0',
            fontWeight: 600,
            opacity: enter(frame, fps, 0.1),
          }}
        >
          {copy.modesTitle}
        </h2>

        <div style={{ display: 'flex', gap: 20, marginTop: 50 }}>
          <div
            style={{
              width: 550,
              background: CARD,
              border: `1px solid ${LINE}`,
              borderRadius: 24,
              padding: '30px 34px',
              boxShadow: '0 18px 40px rgba(62,49,31,0.08)',
              opacity: enter(frame, fps, 0.35),
              translate: `0 ${interpolate(enter(frame, fps, 0.35), [0, 1], [28, 0])}px`,
            }}
          >
            <div style={{ fontFamily: SANS, fontSize: 16, letterSpacing: '0.15em', color: MUTED, fontWeight: 700 }}>
              01
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 50, color: INK, marginTop: 4 }}>{copy.solo}</div>
            <p style={{ fontFamily: SANS, fontSize: 23, lineHeight: 1.45, color: MUTED, marginTop: 10 }}>{copy.soloBody}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
              {copy.aiLevels.map((level) => (
                <span
                  key={level}
                  style={{
                    fontFamily: SANS,
                    fontSize: 15,
                    fontWeight: 700,
                    color: ACCENT,
                    background: 'rgba(93,129,100,0.12)',
                    borderRadius: 999,
                    padding: '5px 11px',
                  }}
                >
                  {level}
                </span>
              ))}
            </div>
          </div>

          <div
            style={{
              width: 550,
              background: CARD,
              border: `1px solid ${LINE}`,
              borderRadius: 24,
              padding: '30px 34px',
              boxShadow: '0 18px 40px rgba(62,49,31,0.08)',
              opacity: enter(frame, fps, 0.6),
              translate: `0 ${interpolate(enter(frame, fps, 0.6), [0, 1], [28, 0])}px`,
            }}
          >
            <div style={{ fontFamily: SANS, fontSize: 16, letterSpacing: '0.15em', color: MUTED, fontWeight: 700 }}>
              02
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 50, color: INK, marginTop: 4 }}>{copy.hotseat}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
              <span style={{ fontFamily: SERIF, fontSize: 76, color: ACCENT, lineHeight: 1 }}>2–6</span>
              <span style={{ fontFamily: SANS, fontSize: 18, color: MUTED }}>{lang === 'zh' ? '人' : 'players'}</span>
            </div>
            <p style={{ fontFamily: SANS, fontSize: 23, lineHeight: 1.45, color: MUTED, marginTop: 10 }}>{copy.hotseatBody}</p>
          </div>
        </div>

        <div
          style={{
            marginTop: 22,
            width: 1120,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            border: `1px dashed ${LINE}`,
            borderRadius: 16,
            padding: '16px 22px',
            opacity: enter(frame, fps, 0.95),
          }}
        >
          <span style={{ fontFamily: SERIF, fontSize: 28, color: INK }}>{copy.lan}</span>
          <span
            style={{
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: 700,
              color: GOLD,
              background: '#fbf0d2',
              borderRadius: 5,
              padding: '4px 8px',
              letterSpacing: '0.04em',
            }}
          >
            {copy.next}
          </span>
          <span style={{ fontFamily: SANS, fontSize: 19, color: MUTED }}>{copy.soon}</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 130,
          top: 120,
          width: 370,
          opacity: phoneIn,
          translate: `0 ${interpolate(phoneIn, [0, 1], [36, 0])}px`,
          rotate: '1.5deg',
        }}
      >
        <div
          style={{
            width: 370,
            height: 760,
            borderRadius: 44,
            border: `9px solid ${INK}`,
            background: CARD,
            overflow: 'hidden',
            boxShadow: '0 40px 80px rgba(32,42,46,0.24)',
          }}
        >
          <Img
            src={staticFile(`shots/${lang}/game-mobile.png`)}
            alt={lang === 'zh' ? '手机竖屏的秘密支持面板' : 'Secret support panel on a portrait phone'}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
          />
        </div>
        <p style={{ fontFamily: SANS, fontSize: 17, color: MUTED, textAlign: 'center', marginTop: 16 }}>
          {lang === 'zh' ? '手机竖屏 · 真实截图' : 'Portrait phone · real screenshot'}
        </p>
      </div>
    </AbsoluteFill>
  );
}
