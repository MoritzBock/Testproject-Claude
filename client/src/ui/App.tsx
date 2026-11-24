import { useEffect } from 'preact/hooks';
import { appState, closeOverlay } from '../core/app-state';
import { getSettings } from '../core/settings-store';
import { useStore } from '../core/store';
import { input } from '../input/input';
import { Caption, DialogBox, Hud, PortalInfoBox, Toasts, ZoneBanner } from './Hud';
import { Credits, Loading, PauseMenu, PrivacyInfo, RotateHint, TitleScreen } from './Menus';
import { LevelView } from './LevelView';
import { SettingsPanel } from './SettingsPanel';
import { TouchControls } from './TouchControls';
import { WorldMap } from './WorldMap';
import { bus } from '../core/bus';
import { LoginScreen } from './Login';
import { Wardrobe } from './Wardrobe';
import { Onboarding } from './Onboarding';
import './ui.css';

export function App() {
  const screen = useStore(appState, (s) => s.screen);
  const overlay = useStore(appState, (s) => s.overlay);

  // Close overlays with Esc / the pause key / the map key (for the map).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = appState.get();
      if (!s.overlay) return;
      const b = getSettings().controls.bindings;
      const isPause = e.code === 'Escape' || b.pause.includes(e.code);
      const isMap =
        (s.overlay === 'map' && b.map.includes(e.code)) ||
        (s.overlay === 'wardrobe' && b.wardrobe.includes(e.code));
      if (isPause || isMap) {
        e.preventDefault();
        if (s.overlay === 'level') bus.emit('levelClosed');
        closeOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Never keep keys "stuck" when a menu opens or closes.
  useEffect(() => input.reset(), [overlay]);

  return (
    <>
      {screen === 'loading' && <Loading />}
      {screen === 'title' && !overlay && <TitleScreen />}
      {screen === 'login' && !overlay && <LoginScreen />}
      {screen === 'onboarding' && <Onboarding />}
      {screen === 'game' && (
        <>
          <Hud />
          <PortalInfoBox />
          <DialogBox />
          <TouchControls />
        </>
      )}
      <ZoneBanner />
      <Toasts />
      <Caption />
      {overlay === 'pause' && <PauseMenu />}
      {overlay === 'settings' && <SettingsPanel />}
      {overlay === 'map' && <WorldMap />}
      {overlay === 'privacy' && <PrivacyInfo />}
      {overlay === 'credits' && <Credits />}
      {overlay === 'level' && <LevelView />}
      {overlay === 'wardrobe' && <Wardrobe />}
      <RotateHint />
    </>
  );
}
