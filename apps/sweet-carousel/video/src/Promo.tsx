import { AbsoluteFill, Sequence } from 'remotion';
import { Soundtrack } from './Audio';
import { Backdrop } from './Backdrop';
import type { Lang } from './copy';
import { Subtitles } from './Subtitles';
import { Hook } from './scenes/S1Hook';
import { Title } from './scenes/S2Title';
import { Rules } from './scenes/S3Rules';
import { Game } from './scenes/S4Game';
import { Modes } from './scenes/S5Modes';
import { Details } from './scenes/S6Details';
import { End } from './scenes/S7End';

const FPS = 60;
const at = (seconds: number) => Math.round(seconds * FPS);

const SCENES = [
  { from: 0, duration: at(5.5), Component: Hook },
  { from: at(5.5), duration: at(4.3), Component: Title },
  { from: at(9.8), duration: at(15.2), Component: Rules },
  { from: at(25.0), duration: at(5.7), Component: Game },
  { from: at(30.7), duration: at(6.0), Component: Modes },
  { from: at(36.7), duration: at(6.6), Component: Details },
  { from: at(43.3), duration: at(5.2), Component: End },
];

export function Promo({ lang }: { lang: Lang }) {
  return (
    <Backdrop>
      {SCENES.map(({ from, duration, Component }, index) => (
        <Sequence key={index} from={from} durationInFrames={duration} premountFor={30}>
          <AbsoluteFill>
            <Component lang={lang} />
          </AbsoluteFill>
        </Sequence>
      ))}
      <Subtitles lang={lang} />
      <Soundtrack lang={lang} />
    </Backdrop>
  );
}
