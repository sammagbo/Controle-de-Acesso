import {Composition} from 'remotion';
import {Intro} from './Intro';
import {Outro} from './Outro';
import {Demo1_Login} from './Demo1_Login';
import {Demo2_Dashboard} from './Demo2_Dashboard';
import {Demo3_Admin} from './Demo3_Admin';

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

export const Root: React.FC = () => {
  return (
    <>
      <Composition id="Intro" component={Intro} durationInFrames={15 * FPS} fps={FPS} width={WIDTH} height={HEIGHT} />
      <Composition id="Demo1Login" component={Demo1_Login} durationInFrames={10 * FPS} fps={FPS} width={WIDTH} height={HEIGHT} />
      <Composition id="Demo2Dashboard" component={Demo2_Dashboard} durationInFrames={12 * FPS} fps={FPS} width={WIDTH} height={HEIGHT} />
      <Composition id="Demo3Admin" component={Demo3_Admin} durationInFrames={15 * FPS} fps={FPS} width={WIDTH} height={HEIGHT} />
      <Composition id="Outro" component={Outro} durationInFrames={8 * FPS} fps={FPS} width={WIDTH} height={HEIGHT} />
    </>
  );
};
