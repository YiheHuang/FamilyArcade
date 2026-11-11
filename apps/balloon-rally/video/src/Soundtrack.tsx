import { Audio } from '@remotion/media';
import { Sequence, staticFile, useVideoConfig } from 'remotion';
import narrationEn from './data/narration.en.json';
import narrationZh from './data/narration.zh.json';
import type { Lang } from './copy';

interface VoiceLine {
  at: number;
  voDuration: number;
  file: string;
}

const LINES: Record<Lang, VoiceLine[]> = {
  en: narrationEn.lines as VoiceLine[],
  zh: narrationZh.lines as VoiceLine[],
};

export function Soundtrack({ lang }: { lang: Lang }) {
  const { fps } = useVideoConfig();
  const at = (seconds: number) => Math.round(seconds * fps);

  return (
    <>
      <Audio src={staticFile('audio/bed.wav')} volume={0.14} />
      {[5, 8, 17, 27, 33, 39].map((seconds, index) => (
        <Sequence
          key={seconds}
          from={at(seconds)}
          durationInFrames={at(1.6)}
          premountFor={30}
          name={`Chime ${index + 1}`}
        >
          <Audio src={staticFile('audio/chime.wav')} volume={seconds === 39 ? 0.22 : 0.28} />
        </Sequence>
      ))}
      <Sequence from={at(14.6)} durationInFrames={at(1.2)} premountFor={30} name="Wind card">
        <Audio src={staticFile('audio/wind.wav')} volume={0.45} />
      </Sequence>
      <Sequence from={at(17.4)} durationInFrames={at(1.2)} premountFor={30} name="Round reveal">
        <Audio src={staticFile('audio/wind.wav')} volume={0.3} />
      </Sequence>
      {LINES[lang].map((line, index) => (
        <Sequence
          key={`voice-${index}`}
          from={at(line.at)}
          durationInFrames={Math.ceil(line.voDuration * fps) + 6}
          premountFor={30}
          name={`Narration ${index + 1}`}
        >
          <Audio src={staticFile(line.file)} volume={1} />
        </Sequence>
      ))}
    </>
  );
}
