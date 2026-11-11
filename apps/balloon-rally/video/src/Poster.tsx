import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Backdrop } from './Backdrop';
import { BalloonArt } from './BalloonArt';
import { COPY, type Lang } from './copy';
import { BALLOON, CARD, GOLD, INK, LINE, MUTED, SERIF, SANS, ACCENT } from './theme';

export function Poster({ lang }: { lang: Lang }) {
  const copy = COPY[lang];
  return (
    <Backdrop>
      <AbsoluteFill style={{ padding: '110px 120px' }}>
        <div style={{ width: 760 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ width: 48, height: 2, background: ACCENT }} />
            <span style={{ fontFamily: SANS, fontSize: 22, letterSpacing: '0.24em', color: ACCENT, fontWeight: 700 }}>
              {copy.endKicker}
            </span>
          </div>
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: lang === 'zh' ? 158 : 142,
              lineHeight: 0.94,
              letterSpacing: lang === 'zh' ? '-0.05em' : '-0.055em',
              color: INK,
              margin: '34px 0 0',
              fontWeight: 600,
            }}
          >
            {copy.endTitle}
          </h1>
          <div style={{ fontFamily: SANS, fontSize: 30, letterSpacing: '0.3em', color: GOLD, fontWeight: 700, marginTop: 22 }}>
            {copy.nameSub}
          </div>
          <p style={{ fontFamily: SERIF, fontSize: 54, lineHeight: 1.2, color: INK, marginTop: 34 }}>{copy.endTagline}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 32 }}>
            {copy.endFacts.map((fact) => (
              <span
                key={fact}
                style={{
                  fontFamily: SANS,
                  fontSize: 19,
                  fontWeight: 600,
                  color: MUTED,
                  border: `1px solid ${LINE}`,
                  background: CARD,
                  borderRadius: 999,
                  padding: '9px 17px',
                }}
              >
                {fact}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 54 }}>
            {BALLOON.map((balloon) => (
              <BalloonArt key={balloon.id} balloon={balloon} size={66} />
            ))}
          </div>
          <div style={{ marginTop: 48, fontFamily: SANS, fontSize: 17, color: MUTED }}>
            {lang === 'zh' ? '离线 · 无账号 · 无广告 · 真实截图' : 'Offline · No accounts · No ads · Real screenshots'}
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 110,
            top: 128,
            width: 880,
            rotate: '-1.2deg',
          }}
        >
          <div
            style={{
              background: CARD,
              border: `1px solid ${LINE}`,
              borderRadius: 30,
              padding: 16,
              boxShadow: '0 40px 90px rgba(62,49,31,0.18)',
            }}
          >
            <Img
              src={staticFile(`shots/${lang}/game.png`)}
              alt={lang === 'zh' ? '气球大赛真实对局' : 'A real Balloon Rally game'}
              style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 20 }}
            />
          </div>
          <div style={{ textAlign: 'center', marginTop: 18, fontFamily: SANS, fontSize: 19, color: MUTED }}>
            {lang === 'zh' ? '真实引擎 · 真实计分 · 1440×1000' : 'Real engine · real scores · 1440×1000'}
          </div>
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
}
