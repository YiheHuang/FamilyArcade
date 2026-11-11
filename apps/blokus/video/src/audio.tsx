import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import { useLang } from "./lang";
import narrationEn from "./data/narration.en.json";
import narrationZh from "./data/narration.zh.json";

const BGM_VOLUME = 0.62;
const DUCK = 0.38; // music level while the voice is speaking
const RAMP = 0.22; // seconds to duck/unduck

interface NarrationLine {
  at: number;
  file: string;
  duration: number;
  text?: string;
}

const LINES: Record<"zh" | "en", NarrationLine[]> = {
  zh: narrationZh.lines as NarrationLine[],
  en: narrationEn.lines as NarrationLine[],
};

/** music gain at a point in time: dips under every narration line */
function duckAt(lines: NarrationLine[], seconds: number): number {
  let gain = 1;
  for (const line of lines) {
    const a = line.at;
    const b = line.at + line.duration;
    if (seconds < a - RAMP || seconds > b + RAMP) continue;
    const f =
      seconds < a ? (seconds - (a - RAMP)) / RAMP : seconds <= b ? 1 : 1 - (seconds - b) / RAMP;
    gain = Math.min(gain, 1 - (1 - DUCK) * Math.max(0, Math.min(1, f)));
  }
  return gain;
}

/**
 * One score and one narrator for the whole film:
 * - generated BGM (48s, 80 BPM) ducked under each narration line
 * - seven short lines, timed per language in narration.{zh,en}.json
 */
export const Soundtrack: React.FC = () => {
  const { fps } = useVideoConfig();
  const lines = LINES[useLang()];

  return (
    <>
      <Audio
        src={staticFile("audio/bgm.wav")}
        volume={(frame) => BGM_VOLUME * duckAt(lines, frame / fps)}
      />
      {lines.map((line, i) => (
        <Sequence
          key={`voice-${i}`}
          from={Math.round(line.at * fps)}
          durationInFrames={Math.ceil(line.duration * fps)}
          layout="none"
        >
          <Audio src={staticFile(line.file)} volume={1} />
        </Sequence>
      ))}
    </>
  );
};
