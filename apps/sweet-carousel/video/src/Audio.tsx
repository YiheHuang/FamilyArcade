import { Audio } from '@remotion/media';
import { Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import narrationEn from './data/narration.en.json';
import narrationZh from './data/narration.zh.json';
import type { Lang } from './copy';

interface Line {
  at: number;
  duration: number;
  file?: string;
  text: string;
}

const LINES: Record<Lang, Line[]> = {
  en: narrationEn.lines as Line[],
  zh: narrationZh.lines as Line[],
};

export function Soundtrack({ lang }: { lang: Lang }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const lines = LINES[lang];
  const speaking = lines.some((line) => time > line.at - 0.1 && time < line.at + line.duration + 0.15);
  const bgmVolume = speaking ? 0.06 : 0.16;

  return (
    <>
      <Audio src={staticFile('audio/bgm.wav')} volume={bgmVolume} />
      {lines.map((line, index) =>
        line.file ? (
          <Sequence
            key={index}
            from={Math.round(line.at * fps)}
            durationInFrames={Math.max(1, Math.ceil((line.duration + 0.2) * fps))}
            premountFor={30}
          >
            <Audio src={staticFile(line.file)} volume={1} />
          </Sequence>
        ) : null,
      )}
    </>
  );
}

