import { useEffect } from 'react';
import { Toasts, UndoBar } from './components/Modals';
import { AnimLayer } from './anim/AnimLayer';
import { UpdatePrompt } from './components/UpdatePrompt';
import { GameScreen } from './screens/GameScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { MenuScreen } from './screens/MenuScreen';
import { RecordsScreen } from './screens/RecordsScreen';
import { ReplayScreen } from './screens/ReplayScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { RulesScreen } from './screens/RulesScreen';
import { initSfxOnce, useGame } from './store';
import { installUiClickSounds } from './ui/sfx';
import { initMusic } from './ui/music';
import { configureMusic } from './ui/music';

export default function App() {
  const screen = useGame((s) => s.screen);
  const animations = useGame((s) => s.settings.animations);
  // 语言键：切换语言时整体重挂载，保证所有文案立即更新
  const langKey = useGame((s) => `${s.settings.lang}`);

  useEffect(() => {
    initSfxOnce();
    const stopClicks = installUiClickSounds();
    const stopMusic = initMusic();
    // 桌面壳（Tauri）里的界面已挂载回报：更新助手据此确认新版真的起来了
    const bridge = window.splendorDesktop as { ready?: () => void } | undefined;
    bridge?.ready?.();
    return () => {
      stopClicks();
      stopMusic();
    };
  }, []);

  // 音乐设置同步（独立于首次挂载）
  const music = useGame((s) => s.settings.music);
  const musicVolume = useGame((s) => s.settings.musicVolume);
  useEffect(() => {
    configureMusic({ music, musicVolume });
  }, [music, musicVolume]);

  return (
    <div key={langKey} className={`min-h-full ${animations ? '' : 'no-anim'}`}>
      {screen === 'menu' && <MenuScreen />}
      {screen === 'game' && <GameScreen />}
      {screen === 'library' && <LibraryScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'rules' && <RulesScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'records' && <RecordsScreen />}
      {screen === 'replay' && <ReplayScreen />}
      <Toasts />
      <UndoBar />
      <AnimLayer />
      <UpdatePrompt />
    </div>
  );
}
