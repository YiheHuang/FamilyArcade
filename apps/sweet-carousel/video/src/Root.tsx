import { Composition } from 'remotion';
import { Promo } from './Promo';
import { DURATION, FPS, HEIGHT, WIDTH } from './theme';

const PromoEN = () => <Promo lang="en" />;
const PromoZH = () => <Promo lang="zh" />;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="SweetCarouselPromoEN"
        component={PromoEN}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="SweetCarouselPromoZH"
        component={PromoZH}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
}
