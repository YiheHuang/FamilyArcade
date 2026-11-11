import { AbsoluteFill, Sequence } from "remotion";
import { Soundtrack } from "./audio";
import { Subtitles } from "./Subtitles";
import { PAPER } from "./theme";
import { S1Hook } from "./scenes/S1Hook";
import { S2Title } from "./scenes/S2Title";
import { S3Rules } from "./scenes/S3Rules";
import { S4Take } from "./scenes/S4Take";
import { S5Buy } from "./scenes/S5Buy";
import { S6Noble } from "./scenes/S6Noble";
import { S7Together } from "./scenes/S7Together";
import { S8Details } from "./scenes/S8Details";
import { S9End } from "./scenes/S9End";

/**
 * 54.0 s at 60 fps. Every cut lands on a multiple of 0.75 s (one beat at 80 BPM)
 * so the synthesized score and the picture breathe together.
 */
export const SCENES = [
  { id: "hook", duration: 270, Component: S1Hook }, //  0.00 –  4.50
  { id: "title", duration: 180, Component: S2Title }, //  4.50 –  7.50
  { id: "rules", duration: 450, Component: S3Rules }, //  7.50 – 15.00
  { id: "take", duration: 360, Component: S4Take }, // 15.00 – 21.00
  { id: "buy", duration: 540, Component: S5Buy }, // 21.00 – 30.00
  { id: "noble", duration: 360, Component: S6Noble }, // 30.00 – 36.00
  { id: "together", duration: 540, Component: S7Together }, // 36.00 – 45.00
  { id: "details", duration: 315, Component: S8Details }, // 45.00 – 50.25
  { id: "end", duration: 225, Component: S9End }, // 50.25 – 54.00
] as const;

export const TOTAL_FRAMES = SCENES.reduce((sum, scene) => sum + scene.duration, 0);

export const Promo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Soundtrack />
      {SCENES.map((scene) => {
        const start = from;
        from += scene.duration;
        return (
          <Sequence key={scene.id} from={start} durationInFrames={scene.duration} name={scene.id}>
            <scene.Component />
          </Sequence>
        );
      })}
      <Subtitles />
    </AbsoluteFill>
  );
};
