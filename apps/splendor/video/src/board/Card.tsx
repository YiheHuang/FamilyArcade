import type { CSSProperties } from "react";
import { GEM, INK } from "../theme";
import { GemIcon } from "./Gem";
import type { CardDef, TokenColor } from "../types";

/** tier texture: dots / diagonal / cross-hatch, as in the app's card faces */
export function tierPattern(tier: number, color: string): CSSProperties {
  const c = `${color}22`;
  if (tier === 1) {
    return {
      backgroundImage: `radial-gradient(${c} 1.1px, transparent 1.2px)`,
      backgroundSize: "7px 7px",
    };
  }
  if (tier === 2) {
    return { backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 2px, transparent 2px 7px)` };
  }
  return {
    backgroundImage:
      `repeating-linear-gradient(45deg, ${c} 0 1.5px, transparent 1.5px 6px),` +
      `repeating-linear-gradient(-45deg, ${c} 0 1.5px, transparent 1.5px 6px)`,
  };
}

/** the app's cost pip: white pill, gem-deep outline, gem + count */
export const Pip: React.FC<{
  color: TokenColor;
  count: number;
  size?: number;
  style?: CSSProperties;
}> = ({ color, count, size = 26, style }) => {
  const hex = GEM[color];
  return (
    <span
      style={{
        height: size,
        minWidth: Math.round(size * 1.05),
        padding: `0 ${Math.round(size * 0.12)}px`,
        borderRadius: size / 2,
        background: "#fff",
        border: `${Math.max(1, Math.round(size * 0.06))}px solid ${hex.deep}`,
        boxShadow: "0 1px 1px rgba(28,39,58,0.10)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: Math.max(1, Math.round(size * 0.05)),
        boxSizing: "border-box",
        color: INK,
        fontSize: Math.round(size * 0.48),
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        ...style,
      }}
    >
      <GemIcon color={color} size={Math.round(size * 0.62)} plain />
      {count}
    </span>
  );
};

/** a development card with the app's anatomy, sized for video close-ups */
export const Card: React.FC<{
  card: CardDef;
  w?: number;
  highlight?: boolean;
  dim?: number;
  style?: CSSProperties;
}> = ({ card, w = 128, highlight = false, dim = 0, style }) => {
  const h = w * 1.375;
  const hex = GEM[card.bonus];
  const costs = (["white", "blue", "green", "red", "black"] as const).filter(
    (c) => card.cost[c] > 0,
  );
  const radius = Math.max(7, w * 0.085);
  const pip = Math.max(16, w * 0.165);

  return (
    <div
      style={{
        width: w,
        height: h,
        border: `${Math.max(2, Math.round(w * 0.015))}px solid ${hex.deep}`,
        borderRadius: radius,
        background: "#fff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: highlight
          ? `0 0 0 ${Math.max(3, w * 0.022)}px rgba(201,147,46,0.36), 0 ${w * 0.06}px ${w * 0.12}px -${w * 0.05}px rgba(38,48,62,0.35)`
          : `0 ${w * 0.012}px ${w * 0.03}px rgba(38,48,62,0.10)`,
        opacity: 1 - dim,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          height: "36%",
          flexShrink: 0,
          background: hex.soft,
          ...tierPattern(card.tier, hex.deep),
        }}
      >
        {card.points > 0 && (
          <span
            style={{
              position: "absolute",
              top: w * 0.045,
              left: w * 0.045,
              width: w * 0.19,
              height: w * 0.19,
              borderRadius: "50%",
              background: INK,
              color: "#ffd98a",
              display: "grid",
              placeItems: "center",
              fontSize: w * 0.115,
              fontWeight: 800,
              boxShadow: "0 1px 2px rgba(28,39,58,0.35)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {card.points}
          </span>
        )}
        <span style={{ position: "absolute", top: w * 0.04, right: w * 0.04 }}>
          <GemIcon color={card.bonus} size={w * 0.2} />
        </span>
        <span
          style={{
            position: "absolute",
            bottom: w * 0.055,
            left: w * 0.07,
            display: "flex",
            gap: w * 0.018,
          }}
        >
          {Array.from({ length: card.tier }).map((_, i) => (
            <span
              key={i}
              style={{
                width: Math.max(3, w * 0.03),
                height: Math.max(3, w * 0.03),
                borderRadius: "50%",
                background: hex.deep,
                opacity: 0.5,
              }}
            />
          ))}
        </span>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            opacity: 0.1,
          }}
        >
          <GemIcon color={card.bonus} size={w * 0.38} plain />
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: w * 0.022,
          padding: `0 ${w * 0.04}px ${w * 0.065}px`,
        }}
      >
        {costs.map((c) => (
          <Pip key={c} color={c} count={card.cost[c]} size={pip} />
        ))}
      </div>
    </div>
  );
};

/** the small card used inside player panels and the reserve pile */
export const MiniCard: React.FC<{ card: CardDef; w?: number; dim?: number }> = ({
  card,
  w = 26,
  dim = 0,
}) => {
  const h = w * 1.4;
  const hex = GEM[card.bonus];
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: Math.max(3, w * 0.18),
        border: `1.4px solid ${hex.deep}`,
        background: "#fff",
        overflow: "hidden",
        opacity: 1 - dim,
        flexShrink: 0,
        position: "relative",
      }}
    >
      <div style={{ height: "34%", background: hex.soft, ...tierPattern(card.tier, hex.deep) }} />
      <div style={{ position: "absolute", right: -w * 0.14, bottom: -w * 0.06, opacity: 0.9 }}>
        <GemIcon color={card.bonus} size={w * 0.52} plain />
      </div>
      {card.points > 0 && (
        <span
          style={{
            position: "absolute",
            top: w * 0.05,
            left: w * 0.08,
            color: INK,
            fontSize: w * 0.34,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          {card.points}
        </span>
      )}
    </div>
  );
};
