import { AbsoluteFill, Sequence } from 'remotion';
import { Backdrop } from './Backdrop';
import type { Lang } from './copy';
import { Soundtrack } from './Soundtrack';
import { Subtitles } from './Subtitles';
import { Details } from './scenes/S6Details';
import { End } from './scenes/S7End';
import { Game } from './scenes/S4Game';
import { Hook } from './scenes/S1Hook';
import { Modes } from './scenes/S5Modes';
import { Rules } from './scenes/S3Rules';
import { Title } from './scenes/S2Title';

const FPS = 60;
const at = (seconds: number) => Math.round(seconds * FPS);

const SCENES = [
  { from: at(0), duration: at(5), name: 'Hook', Component: Hook },
  { from: at(5), duration: at(3), name: 'Title', Component: Title },
  { from: at(8), duration: at(9), name: 'Rules', Component: Rules },
  { from: at(17), duration: at(10), name: 'Real round', Component: Game },
  { from: at(27), duration: at(6), name: 'Modes', Component: Modes },
  { from: at(33), duration: at(6), name: 'Details', Component: Details },
  { from: at(39), duration: at(6), name: 'End', Component: End },
];

export function Promo({ lang }: { lang: Lang }) {
  return (
    <Backdrop>
      {SCENES.map(({ from, duration, name, Component }) => (
        <Sequence key={name} from={from} durationInFrames={duration} premountFor={60} name={name}>
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
