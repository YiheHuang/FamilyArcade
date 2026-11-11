import { AbsoluteFill, Sequence } from 'remotion';
import { Backdrop } from './Backdrop';
import type { Lang } from './copy';
import { Soundtrack } from './Soundtrack';
import { Subtitles } from './Subtitles';
import { Hook } from './scenes/S1Hook';
import { Title } from './scenes/S2Title';
import { Rules } from './scenes/S3Rules';
import { Game } from './scenes/S4Game';
import { Modes } from './scenes/S5Modes';
import { Details } from './scenes/S6Details';
import { End } from './scenes/S7End';
import { FPS } from './theme';

const at = (seconds: number) => Math.round(seconds * FPS);

const SCENES = [
  { from: 0, duration: at(4.5), Component: Hook },
  { from: at(4.5), duration: at(4.0), Component: Title },
  { from: at(8.5), duration: at(9.5), Component: Rules },
  { from: at(18.0), duration: at(13.2), Component: Game },
  { from: at(31.2), duration: at(5.8), Component: Modes },
  { from: at(37.0), duration: at(6.0), Component: Details },
  { from: at(43.0), duration: at(7.0), Component: End },
];

export function Promo({ lang }: { lang: Lang }) {
  return (
    <Backdrop>
      {SCENES.map(({ from, duration, Component }, i) => (
        <Sequence key={i} from={from} durationInFrames={duration} premountFor={FPS}>
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
