import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "../Backdrop";
import { FadeUp } from "../anim";
import { Card, Pip } from "../board/Card";
import { GemIcon } from "../board/Gem";
import { PlayerPanel } from "../board/PlayerPanel";
import { cardOf, GAME } from "../data";
import { FONT_SANS } from "../fonts";
import { useCopy } from "../lang";
import {
  ACCENT,
  ACCENT_100,
  ACCENT_300,
  ACCENT_700,
  INK_400,
  INK_500,
  PAPER,
  PAPER_200,
} from "../theme";
import type { Cost, Tokens } from "../types";

const CARD_POS = { x: 170, y: 210, w: 360 };
const PANEL = { x: 680, y: 136, w: 1040 };
const EQ = { x: 680, y: 372, w: 1040, h: 262 };

/** the hero mechanic: cost − discount = pay, then the card joins the tableau */
export const S5Buy: React.FC = () => {
  const copy = useCopy();
  const frame = useCurrentFrame();
  const demo = GAME.buy;
  const before = demo.before;
  const after = demo.after;
  const seat = demo.seat;
  const player = before.players[seat]!;
  const card = demo.card ? cardOf(demo.card.id) : null;
  if (!card) return null;

  const afterPlayer = after.players[seat]!;
  const fly = interpolate(frame, [200, 250], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const score = Math.round(
    interpolate(frame, [392, 456], [demo.scoreBefore, demo.scoreAfter], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const paidOut = frame >= 200;
  const tokens: Tokens = { ...player.tokens };
  for (const color of ["white", "blue", "green", "red", "black", "gold"] as const) {
    tokens[color] =
      player.tokens[color] + (afterPlayer.tokens[color] - player.tokens[color]) * fly;
  }
  const bonusT = interpolate(frame, [408, 436], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bonuses: Cost = { ...player.bonuses };
  bonuses[card.bonus] = player.bonuses[card.bonus] + (afterPlayer.bonuses[card.bonus] - player.bonuses[card.bonus]) * bonusT;
  const purchased = frame >= 486 ? [...player.purchased, card.id] : player.purchased;

  const highlightDiscount = interpolate(frame, [90, 112, 176, 194], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const showPay = interpolate(frame, [246, 262], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Backdrop opacity={0.04} fadeIn={24} />

      <div style={{ position: "absolute", left: 96, top: 100, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 34, height: 2, background: ACCENT }} />
        <span style={{ fontFamily: FONT_SANS, fontSize: 25, fontWeight: 500, letterSpacing: "0.16em", color: INK_500 }}>
          {copy.s5.label}
        </span>
      </div>

      <span
        style={{
          position: "absolute",
          left: CARD_POS.x,
          top: CARD_POS.y - 34,
          fontFamily: FONT_SANS,
          fontSize: 15,
          letterSpacing: "0.14em",
          color: INK_400,
        }}
      >
        {copy.s5.cardLabel}
      </span>

      <FadeUp delay={4} duration={20} distance={14} style={{ position: "absolute", left: PANEL.x, top: PANEL.y, zIndex: 3 }}>
        <PlayerPanel
          player={player}
          copy={copy}
          width={PANEL.w}
          focus
          pointsOverride={score}
          tokensOverride={tokens}
          bonusesOverride={bonuses}
          purchasedOverride={purchased}
        />
      </FadeUp>

      {/* the card that is being bought */}
      <div
        style={{
          position: "absolute",
          left: CARD_POS.x,
          top: CARD_POS.y,
          translate: `${interpolate(frame, [470, 520], [0, 1230], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px ${interpolate(frame, [470, 520], [0, -277], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
          scale: interpolate(frame, [0, 470, 520], [1, 1.04, 0.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          opacity: interpolate(frame, [468, 486], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          transformOrigin: "center",
          zIndex: 1,
        }}
      >
        <FadeUp delay={8} duration={22} distance={18}>
          <Card card={card} w={CARD_POS.w} highlight={frame < 468} />
        </FadeUp>
      </div>

      {/* cost − discount = pay */}
      <FadeUp delay={6} duration={22} distance={14} style={{ position: "absolute", left: EQ.x, top: EQ.y, zIndex: 3 }}>
        <div
          style={{
            width: EQ.w,
            height: EQ.h,
            borderRadius: 24,
            background: "#fff",
            border: `1px solid ${PAPER_200}`,
            boxShadow: "0 28px 50px -42px rgba(38,48,62,0.42)",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          <div style={{ position: "absolute", left: 46, top: 30 }}>
            <span style={{ fontSize: 15, letterSpacing: "0.16em", color: INK_400, fontWeight: 500 }}>
              {copy.s5.cost}
            </span>
            <div style={{ marginTop: 16, opacity: interpolate(frame, [30, 52], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              <Pip color="white" count={card.cost.white} size={64} />
            </div>
          </div>

          <div style={{ position: "absolute", left: 284, top: 84, fontSize: 40, color: INK_400 }}>−</div>

          <div
            style={{
              position: "absolute",
              left: 344,
              top: 30,
              padding: "10px 18px",
              borderRadius: 16,
              background: `rgba(248,238,216,${highlightDiscount})`,
              boxShadow: highlightDiscount > 0 ? "0 0 0 1px rgba(201,147,46,0.35)" : "none",
            }}
          >
            <span style={{ fontSize: 15, letterSpacing: "0.16em", color: ACCENT_700, fontWeight: 600 }}>
              {copy.s5.discount}
            </span>
            <div style={{ marginTop: 6, opacity: interpolate(frame, [90, 112], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
              <Pip color="white" count={demo.card?.discount ?? card.cost.white - (demo.paid?.white ?? 0) - 0} size={64} />
            </div>
          </div>

          <div style={{ position: "absolute", left: 624, top: 84, fontSize: 40, color: INK_400 }}>=</div>

          <div style={{ position: "absolute", left: 686, top: 30, opacity: showPay }}>
            <span style={{ fontSize: 15, letterSpacing: "0.16em", color: INK_400, fontWeight: 500 }}>
              {copy.s5.pay}
            </span>
            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              {(demo.paid?.white ?? 0) > 0 && <Pip color="white" count={demo.paid?.white ?? 0} size={64} />}
              {(demo.paid?.gold ?? 0) > 0 && <Pip color="gold" count={demo.paid?.gold ?? 0} size={64} />}
            </div>
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 7, color: ACCENT_700 }}>
              <GemIcon color="gold" size={20} />
              <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "0.03em" }}>{copy.s5.gold}</span>
            </div>
          </div>
        </div>
      </FadeUp>

      {/* the paid tokens leave the panel and settle on the card */}
      {paidOut &&
        (["white", "gold"] as const).map((color, i) => {
          const count = demo.paid?.[color] ?? 0;
          if (count === 0) return null;
          const startX = PANEL.x + 244 + (color === "gold" ? 5 : 0) * 52;
          const startY = PANEL.y + 38;
          const t = interpolate(frame, [200 + i * 10, 240 + i * 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          if (t <= 0 || t >= 1) return null;
          const targetX = CARD_POS.x + 250;
          const targetY = CARD_POS.y + 430;
          const x = startX + (targetX - startX) * t;
          const y = startY + (targetY - startY) * t - Math.sin(Math.PI * t) * 70;
          return (
            <div
              key={color}
              style={{
                position: "absolute",
                left: x,
                top: y,
                translate: "-50% -50%",
                opacity: interpolate(t, [0, 0.12, 0.85, 1], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                scale: 1.2 - 0.4 * t,
                filter: "drop-shadow(0 10px 14px rgba(38,48,62,0.25))",
                zIndex: 4,
              }}
            >
              <GemIcon color={color} size={46} />
            </div>
          );
        })}

      {/* +4 prestige */}
      <div
        style={{
          position: "absolute",
          left: PANEL.x + 140,
          top: PANEL.y + 48,
          zIndex: 4,
          opacity: interpolate(frame, [392, 408, 470, 490], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `0 ${interpolate(frame, [392, 430], [10, -8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
        }}
      >
        <span
          style={{
            fontSize: 26,
            fontWeight: 600,
            color: ACCENT_700,
            background: ACCENT_100,
            border: `1px solid ${ACCENT_300}`,
            borderRadius: 999,
            padding: "6px 14px",
          }}
        >
          +{demo.scoreAfter - demo.scoreBefore}
        </span>
      </div>

      {/* the permanent bonus that just joined the panel */}
      <div
        style={{
          position: "absolute",
          left: CARD_POS.x,
          top: CARD_POS.y + CARD_POS.w * 1.375 + 26,
          opacity: interpolate(frame, [430, 452], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          translate: `0 ${interpolate(frame, [430, 452], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: INK_500,
          fontSize: 18,
          fontWeight: 500,
          letterSpacing: "0.04em",
          zIndex: 4,
        }}
      >
        <span style={{ width: 34, height: 1, background: ACCENT }} />
        {copy.s5.bonus}
        <GemIcon color={card.bonus} size={22} />
      </div>
    </AbsoluteFill>
  );
};
