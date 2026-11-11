import { Composition, Still } from 'remotion';
import { Promo } from './Promo';
import { Poster } from './Poster';
import { DURATION, FPS, HEIGHT, WIDTH } from './theme';

const PromoZH = () => <Promo lang="zh" />;
const PromoEN = () => <Promo lang="en" />;
const PosterZH = () => <Poster lang="zh" />;
const PosterEN = () => <Poster lang="en" />;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="HueGardenPromoZH"
        component={PromoZH}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="HueGardenPromoEN"
        component={PromoEN}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Still id="HueGardenPosterZH" component={PosterZH} width={WIDTH} height={HEIGHT} />
      <Still id="HueGardenPosterEN" component={PosterEN} width={WIDTH} height={HEIGHT} />
    </>
  );
}
