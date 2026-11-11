import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import narrationZh from './data/narration.zh.json';
import narrationEn from './data/narration.en.json';
import type { Lang } from './copy';

interface Line {
  at: number;
  file: string;
  duration: number;
  text: string;
}

const LINES: Record<Lang, Line[]> = {
  zh: narrationZh.lines as Line[],
  en: narrationEn.lines as Line[],
};

export function Soundtrack({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const lines = LINES[lang];
  const speaking = lines.some((line) => time > line.at - 0.2 && time < line.at + line.duration + 0.2);
  const bgmVolume = speaking ? 0.055 : 0.16;

  return (
    <>
      <Audio src={staticFile('audio/bgm.wav')} volume={bgmVolume} />
      {lines.map((line, i) => (
        <Sequence
          key={i}
          from={Math.round(line.at * fps)}
          durationInFrames={Math.max(1, Math.ceil((line.duration + 0.35) * fps))}
          premountFor={fps}
        >
          <Audio src={staticFile(line.file)} volume={1} />
        </Sequence>
      ))}
      <Sequence from={Math.round(4.35 * fps)} durationInFrames={Math.round(0.5 * fps)} premountFor={fps}>
        <Audio src={staticFile('audio/tick.wav')} volume={0.4} />
      </Sequence>
      <Sequence from={Math.round(18 * fps)} durationInFrames={Math.round(0.5 * fps)} premountFor={fps}>
        <Audio src={staticFile('audio/place.wav')} volume={0.55} />
      </Sequence>
      <Sequence from={Math.round(31.2 * fps)} durationInFrames={Math.round(0.5 * fps)} premountFor={fps}>
        <Audio src={staticFile('audio/tick.wav')} volume={0.35} />
      </Sequence>
      <Sequence from={Math.round(43 * fps)} durationInFrames={Math.round(2.2 * fps)} premountFor={fps}>
        <Audio src={staticFile('audio/chime.wav')} volume={0.5} />
      </Sequence>
    </>
  );
}
