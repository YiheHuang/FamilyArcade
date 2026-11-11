import { AbsoluteFill, Composition } from "remotion";
import { Soundtrack } from "./audio";
import { LangProvider } from "./lang";
import { Promo, TOTAL_FRAMES } from "./Promo";
import { PAPER } from "./theme";
import type { Lang } from "./copy";

// fonts must be registered before any scene renders
import "./fonts";

const PromoIn: React.FC<{ lang: Lang }> = ({ lang }) => (
  <LangProvider lang={lang}>
    <Promo />
  </LangProvider>
);

/** low-resolution composition with only the mix — for checking levels fast */
const SoundCheck: React.FC<{ lang: Lang }> = ({ lang }) => (
  <LangProvider lang={lang}>
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      <Soundtrack />
    </AbsoluteFill>
  </LangProvider>
);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BlokusPromoZH"
        component={() => <PromoIn lang="zh" />}
        durationInFrames={TOTAL_FRAMES}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="BlokusPromoEN"
        component={() => <PromoIn lang="en" />}
        durationInFrames={TOTAL_FRAMES}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="SoundCheckZH"
        component={() => <SoundCheck lang="zh" />}
        durationInFrames={TOTAL_FRAMES}
        fps={60}
        width={320}
        height={180}
      />
      <Composition
        id="SoundCheckEN"
        component={() => <SoundCheck lang="en" />}
        durationInFrames={TOTAL_FRAMES}
        fps={60}
        width={320}
        height={180}
      />
    </>
  );
};
