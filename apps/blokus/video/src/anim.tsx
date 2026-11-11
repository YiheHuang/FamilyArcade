import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE_OUT } from "./theme";

interface FadeUpProps {
  /** frames after the scene starts */
  delay?: number;
  duration?: number;
  distance?: number;
  opacityFrom?: number;
  children: ReactNode;
  style?: CSSProperties;
}

/** the one入场 animation used everywhere: fade + a short rise, slow-out easing */
export const FadeUp: React.FC<FadeUpProps> = ({
  delay = 0,
  duration = 24,
  distance = 28,
  opacityFrom = 0,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(frame, [delay, delay + duration], [opacityFrom, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        }),
        translate: interpolate(frame, [delay, delay + duration], [`0px ${distance}px`, "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** a block that fades in and back out over an explicit window */
export const FadeWindow: React.FC<{
  from: number;
  to: number;
  fade?: number;
  children: ReactNode;
  style?: CSSProperties;
}> = ({ from, to, fade = 14, children, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(frame, [from, from + fade, to - fade, to], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        }),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** horizontal hairline that draws itself from 0 to full width */
export const GrowingRule: React.FC<{
  delay?: number;
  duration?: number;
  width: number | string;
  color?: string;
  style?: CSSProperties;
}> = ({ delay = 0, duration = 24, width, color = "rgba(31,29,26,0.18)", style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width,
        height: 1,
        background: color,
        scale: interpolate(frame, [delay, delay + duration], ["0 1", "1 1"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE_OUT,
        }),
        transformOrigin: "left center",
        ...style,
      }}
    />
  );
};
