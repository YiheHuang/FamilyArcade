import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import { useLang } from "./lang";
import zh from "./data/narration.zh.json";
import en from "./data/narration.en.json";

const BGM_VOLUME = 0.5;
const DUCK = 0.42; // music level while the voice is speaking
const RAMP = 0.22; // seconds to duck/unduck

interface NarrationLine {
  at: number;
  file: string;
  duration: number;
  text?: string;
}

const LINES: Record<"zh" | "en", NarrationLine[]> = {
  zh: zh.lines as NarrationLine[],
  en: en.lines as NarrationLine[],
};

/** every sound effect, placed on the shared timeline */
const CUES: Array<{ at: number; file: string; volume: number }> = [
  { at: 0.05, file: "whoosh.wav", volume: 0.5 },
  { at: 3.15, file: "whoosh.wav", volume: 0.3 },
  { at: 4.58, file: "chime.wav", volume: 0.22 },
  { at: 7.72, file: "tick.wav", volume: 0.7 },
  { at: 8.42, file: "tick.wav", volume: 0.7 },
  { at: 9.12, file: "tick.wav", volume: 0.7 },
  { at: 11.4, file: "score.wav", volume: 0.3 },
  { at: 15.3, file: "gem-0.wav", volume: 0.9 },
  { at: 15.54, file: "gem-1.wav", volume: 0.8 },
  { at: 15.78, file: "gem-2.wav", volume: 0.75 },
  { at: 17.0, file: "gem-take.wav", volume: 0.7 },
  { at: 21.55, file: "buy.wav", volume: 0.6 },
  { at: 22.9, file: "whoosh.wav", volume: 0.3 },
  { at: 26.1, file: "score.wav", volume: 0.35 },
  { at: 30.45, file: "noble.wav", volume: 0.75 },
  { at: 32.7, file: "score.wav", volume: 0.3 },
  { at: 37.0, file: "join.wav", volume: 0.65 },
  { at: 41.1, file: "tick.wav", volume: 0.7 },
  { at: 45.35, file: "tick.wav", volume: 0.7 },
  { at: 46.15, file: "tick.wav", volume: 0.7 },
  { at: 47.0, file: "whoosh.wav", volume: 0.3 },
  { at: 50.55, file: "chime.wav", volume: 0.55 },
  { at: 52.9, file: "whoosh.wav", volume: 0.2 },
];

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

export const Soundtrack: React.FC = () => {
  const { fps } = useVideoConfig();
  const lines = LINES[useLang()];

  return (
    <>
      <Audio
        src={staticFile("audio/bgm.mp3")}
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
      {CUES.map((cue, i) => (
        <Sequence
          key={`sfx-${i}`}
          from={Math.round(cue.at * fps)}
          durationInFrames={Math.ceil(3 * fps)}
          layout="none"
        >
          <Audio src={staticFile(`audio/${cue.file}`)} volume={cue.volume} />
        </Sequence>
      ))}
    </>
  );
};
