import type { CSSProperties } from "react";
import { ACCENT_300, ACCENT_100, INK } from "../theme";
import { GEM } from "../theme";
import type { NobleDef } from "../types";

/** a noble tile: an amber-edged cream card with the "3" and its bonus chips */
export const NobleTile: React.FC<{
  noble: NobleDef;
  size?: number;
  highlight?: boolean;
  style?: CSSProperties;
}> = ({ noble, size = 80, highlight = false, style }) => {
  const reqs = (["white", "blue", "green", "red", "black"] as const).filter(
    (c) => noble.requirement[c] > 0,
  );
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.16,
        border: `${Math.max(1.5, size * 0.025)}px solid ${ACCENT_300}`,
        background: "#fffdf6",
        display: "grid",
        placeItems: "center",
        position: "relative",
        boxShadow: highlight
          ? `0 0 0 ${Math.max(3, size * 0.04)}px rgba(201,147,46,0.32), 0 ${size * 0.14}px ${size * 0.3}px -${size * 0.12}px rgba(38,48,62,0.42)`
          : `0 ${size * 0.03}px ${size * 0.08}px rgba(38,48,62,0.08)`,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: size * 0.05,
          left: size * 0.05,
          width: size * 0.22,
          height: size * 0.22,
          borderRadius: "50%",
          background: INK,
          color: ACCENT_300,
          display: "grid",
          placeItems: "center",
          fontSize: size * 0.12,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        3
      </span>
      <span
        style={{
          display: "flex",
          gap: size * 0.025,
          paddingTop: size * 0.12,
        }}
      >
        {reqs.map((c) => (
          <span
            key={c}
            style={{
              minWidth: size * 0.2,
              height: size * 0.2,
              padding: `0 ${size * 0.025}px`,
              borderRadius: size * 0.05,
              background: GEM[c].deep,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: size * 0.115,
              fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
              boxSizing: "border-box",
            }}
          >
            {noble.requirement[c]}
          </span>
        ))}
      </span>
    </div>
  );
};

/** the tiny badge shown after a noble joins a player's panel */
export const NobleBadge: React.FC<{ noble: NobleDef; w?: number }> = ({ noble, w = 22 }) => {
  const reqs = (["white", "blue", "green", "red", "black"] as const).filter(
    (c) => noble.requirement[c] > 0,
  );
  return (
    <span
      style={{
        width: w,
        height: w * 1.25,
        borderRadius: w * 0.18,
        border: `1.2px solid ${ACCENT_300}`,
        background: ACCENT_100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: w * 0.36, fontWeight: 800, color: INK, lineHeight: 1 }}>3</span>
      <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {reqs.map((c) => (
          <span
            key={c}
            style={{
              width: w * 0.46,
              height: Math.max(2, w * 0.06),
              borderRadius: 1,
              background: GEM[c].deep,
            }}
          />
        ))}
      </span>
    </span>
  );
};
