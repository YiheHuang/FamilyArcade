import { AbsoluteFill, Sequence } from 'remotion';
import { Soundtrack } from './Audio';
import { Backdrop } from './Backdrop';
import type { Lang } from './copy';
import { Subtitles } from './Subtitles';
import { Game } from './scenes/S4Game';
import { Details } from './scenes/S6Details';
import { End } from './scenes/S7End';
import { Hook } from './scenes/S1Hook';
import { Modes } from './scenes/S5Modes';
import { Rules } from './scenes/S3Rules';
import { Title } from './scenes/S2Title';

export interface PromoProps {
  lang: Lang;
}

const F = 60;
const at = (seconds: number) => Math.round(seconds * F);

const SCENES = [
  { from: 0, duration: at(4.5), Component: Hook },
  { from: at(4.5), duration: at(3.5), Component: Title },
  { from: at(8), duration: at(10), Component: Rules },
  { from: at(18), duration: at(10.6), Component: Game },
  { from: at(28.6), duration: at(5.4), Component: Modes },
  { from: at(34), duration: at(5), Component: Details },
  { from: at(39), duration: at(9), Component: End },
];

export function Promo({ lang }: PromoProps) {
  return (
    <Backdrop>
      {SCENES.map(({ from, duration, Component }, i) => (
        <Sequence key={i} from={from} durationInFrames={duration} premountFor={30}>
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
