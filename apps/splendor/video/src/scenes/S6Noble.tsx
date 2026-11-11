import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp } from "../anim";
import { Card, Pip } from "../board/Card";
import { GemIcon } from "../board/Gem";
import { NobleTile } from "../board/Noble";
import { PlayerPanel } from "../board/PlayerPanel";
import { cardOf, GAME, nobleOf } from "../data";
import { FONT_SANS, FONT_SERIF } from "../fonts";
import { useCopy } from "../lang";
import {
  ACCENT,
  ACCENT_100,
  ACCENT_300,
  ACCENT_700,
  INK,
  INK_400,
  INK_500,
  PAPER,
} from "../theme";
import type { Cost } from "../types";

const NOBLE = { x: 190, y: 276, size: 210 };
const PANEL = { x: 760, y: 190, w: 1000, h: 170 };

/** the noble visit: one missing bonus, three pips check, +3 prestige */
export const S6Noble: React.FC = () => {
  const copy = useCopy();
  const frame = useCurrentFrame();
  const demo = GAME.noble;
  const before = demo.before;
  const after = demo.after;
  const seat = demo.seat;
  const player = before.players[seat]!;
  const afterPlayer = after.players[seat]!;
  const noble = demo.nobleId == null ? null : nobleOf(demo.nobleId);
  const card = demo.card ? cardOf(demo.card.id) : null;
  if (!noble || !card) return null;

  const reqs = (["white", "blue", "green", "red", "black"] as const).filter(
    (c) => noble.requirement[c] > 0,
  );
  const bonusT = interpolate(frame, [86, 122], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bonuses: Cost = { ...player.bonuses };
  bonuses[card.bonus] =
    player.bonuses[card.bonus] +
    (afterPlayer.bonuses[card.bonus] - player.bonuses[card.bonus]) * bonusT;
  const purchased = frame >= 76 ? [...player.purchased, card.id] : player.purchased;
  const visit = frame >= 236;
  const nobles = visit ? afterPlayer.nobles : player.nobles;
  const score = Math.round(
    interpolate(frame, [240, 300], [demo.scoreBefore, demo.scoreAfter], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const check = interpolate(frame, [140, 168], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fly = interpolate(frame, [188, 236], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const flying = frame >= 188 && frame < 240;

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Backdrop opacity={0.04} fadeIn={24} />

      <div style={{ position: "absolute", left: 96, top: 100, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 34, height: 2, background: ACCENT }} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 25, fontWeight: 500, letterSpacing: "0.16em", color: INK_500 }}>
          {copy.s6.label}
        </span>
      </div>

      <FadeUp delay={4} duration={20} distance={14} style={{ position: "absolute", left: PANEL.x, top: PANEL.y }}>
        <PlayerPanel
          player={player}
          copy={copy}
          width={PANEL.w}
          focus
          pointsOverride={score}
          bonusesOverride={bonuses}
          purchasedOverride={purchased}
          noblesOverride={nobles}
        />
      </FadeUp>

      {/* the noble itself */}
      <div
        style={{
          position: "absolute",
          left: NOBLE.x - 150,
          top: NOBLE.y - 150,
          width: NOBLE.size + 300,
          height: NOBLE.size + 300,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(201,147,46,0.20) 0%, rgba(201,147,46,0.06) 38%, rgba(0,0,0,0) 68%)",
          opacity: interpolate(frame, [10, 40, 180, 220], [0, 1, 1, 0.35], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <FadeUp delay={10} duration={24} distance={18} style={{ position: "absolute", left: NOBLE.x, top: NOBLE.y, opacity: 1 - fly }}>
        <NobleTile noble={noble} size={NOBLE.size} highlight />
      </FadeUp>

      <div style={{ position: "absolute", left: NOBLE.x, top: NOBLE.y + NOBLE.size + 24 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "flex-end" }}>
          {reqs.map((c) => (
            <div key={c} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative" }}>
                <Pip color={c} count={noble.requirement[c]} size={52} />
                <div
                  style={{
                    position: "absolute",
                    right: -7,
                    top: -7,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: ACCENT,
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    opacity: check,
                    scale: interpolate(check, [0, 1], [0.5, 1]),
                  }}
                >
                  ✓
                </div>
              </div>
              <span style={{ fontSize: 14, color: INK_400, letterSpacing: "0.04em" }}>{copy.gems[c]}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 22,
            opacity: interpolate(frame, [140, 168], [0.4, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            color: ACCENT_700,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "0.12em",
          }}
        >
          {copy.s6.req}
        </div>
      </div>

      {/* the card that completed the bonus */}
      <FadeUp delay={34} duration={22} distance={12} style={{ position: "absolute", left: NOBLE.x, top: 690 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14 }}>
          <Card card={card} w={96} />
          <div style={{ paddingBottom: 8 }}>
            <div style={{ fontSize: 13, color: INK_400, letterSpacing: "0.08em" }}>{copy.s5.cardLabel}</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, color: INK_500, fontSize: 16 }}>
              <GemIcon color={card.bonus} size={18} />+1
            </div>
          </div>
        </div>
      </FadeUp>

      {/* the tile flies to the panel */}
      {flying && (
        <div
          style={{
            position: "absolute",
            left: NOBLE.x + (1510 - NOBLE.x) * fly,
            top: NOBLE.y + (216 - NOBLE.y) * fly,
            scale: 1 - 0.78 * fly,
            opacity: 1 - fly * fly,
            transformOrigin: "top left",
          }}
        >
          <NobleTile noble={noble} size={NOBLE.size} highlight />
        </div>
      )}

      <div
        style={{
          position: "absolute",
          left: NOBLE.x,
          top: NOBLE.y + 34,
          opacity: interpolate(frame, [236, 264], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [236, 264], [10, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        <div style={{ fontFamily: FONT_SERIF, fontSize: 30, fontWeight: 600, color: INK }}>{noble.name}</div>
        <div style={{ marginTop: 6, fontFamily: FONT_SANS, fontSize: 15, letterSpacing: "0.12em", color: INK_400 }}>
          {copy.s6.visit}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: NOBLE.x + NOBLE.size + 42,
          top: NOBLE.y + 24,
          opacity: interpolate(frame, [240, 258, 320, 340], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [240, 280], [10, -8], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      >
        <span
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: ACCENT_700,
            background: ACCENT_100,
            border: `1px solid ${ACCENT_300}`,
            borderRadius: 999,
            padding: "7px 16px",
          }}
        >
          {copy.s6.plus}
        </span>
      </div>
    </AbsoluteFill>
  );
};
