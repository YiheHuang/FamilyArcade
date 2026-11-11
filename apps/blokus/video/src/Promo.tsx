import { AbsoluteFill } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Soundtrack } from "./audio";
import { PAPER } from "./theme";
import { S1Title } from "./scenes/S1Title";
import { S2Rules } from "./scenes/S2Rules";
import { S3Game } from "./scenes/S3Game";
import { S4Score } from "./scenes/S4Score";
import { S5Modes } from "./scenes/S5Modes";
import { S6Details } from "./scenes/S6Details";
import { S7End } from "./scenes/S7End";

const T = 12; // 0.2s crossfade

/**
 * 48.0s @60fps exactly.
 *
 * Only boundaries with the same visual layout crossfade (title -> rules,
 * game -> score, where the board stays put). Everything else is a hard cut on
 * the beat: crossfading two differently placed boards reads as double exposure.
 *
 * (216 + 564 + 648 + 324 + 456 + 312 + 384) - 2*12 = 2880
 */
export const SCENES = [
  { id: "title", duration: 216, Component: S1Title, fadeOut: true },
  { id: "rules", duration: 564, Component: S2Rules },
  { id: "game", duration: 648, Component: S3Game, fadeOut: true },
  { id: "score", duration: 324, Component: S4Score },
  { id: "modes", duration: 456, Component: S5Modes },
  { id: "details", duration: 312, Component: S6Details },
  { id: "end", duration: 384, Component: S7End },
] as const;

export const TOTAL_FRAMES =
  SCENES.reduce((sum, s) => sum + s.duration, 0) -
  SCENES.filter((s) => "fadeOut" in s && s.fadeOut).length * T;

export const Promo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Soundtrack />
      <TransitionSeries>
        {SCENES.map((scene, i) => {
          const items = [
            <TransitionSeries.Sequence key={scene.id} durationInFrames={scene.duration}>
              <scene.Component />
            </TransitionSeries.Sequence>,
          ];
          if (i < SCENES.length - 1 && "fadeOut" in scene && scene.fadeOut) {
            items.push(
              <TransitionSeries.Transition
                key={`t-${scene.id}`}
                presentation={fade()}
                timing={linearTiming({ durationInFrames: T })}
              />,
            );
          }
          return items;
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
