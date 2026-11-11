import { Composition } from 'remotion';
import { Promo } from './Promo';
import { DURATION, FPS, HEIGHT, WIDTH } from './theme';

const PromoZH = () => <Promo lang="zh" />;
const PromoEN = () => <Promo lang="en" />;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="StarLeapPromoZH"
        component={PromoZH}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="StarLeapPromoEN"
        component={PromoEN}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
}
