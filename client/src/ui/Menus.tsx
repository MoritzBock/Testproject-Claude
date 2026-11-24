import { GAME } from '@pixel/shared';
import { appState, closeOverlay, openOverlay, openSettings } from '../core/app-state';
import { bus } from '../core/bus';
import { useStore } from '../core/store';
import { logout, proceed, sessionStore } from '../core/session';
import { playSfx, unlockAudio } from '../audio/sfx';
import { PrivacyText } from './PrivacyText';
import { starString } from '../game/portal-status';
import { Modal } from './Modal';

export const LEARNING_NOTE =
  'Die Lernstandsdaten dienen der Lernbegleitung und nicht der Notengebung.';

export function Loading() {
  const p = useStore(appState, (s) => s.loadProgress);
  return (
    <div class="screen-center">
      <p>Lade die Bit-Insel …</p>
      <div
        class="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p * 100)}
      >
        <div class="progress-bar" style={{ width: `${Math.round(p * 100)}%` }} />
      </div>
    </div>
  );
}

export function TitleScreen() {
  const me = useStore(sessionStore, (s) => s.me);
  return (
    <div class="title-screen">
      <div class="title-card">
        <h1>{GAME.title}</h1>
        <p class="subtitle">{GAME.worldName}</p>
        <nav class="menu" aria-label="Hauptmenü">
          <button
            class="btn btn-primary btn-big"
            onClick={() => {
              unlockAudio();
              playSfx('confirm');
              if (me) void proceed();
              else appState.set({ screen: 'login' });
            }}
          >
            {me ? `Weiterspielen als ${me.username}` : 'Anmelden'}
          </button>
          {me && (
            <button class="btn" onClick={() => void logout()}>
              Abmelden
            </button>
          )}
          <button class="btn" onClick={() => openSettings()}>
            Einstellungen
          </button>
          <button class="btn" onClick={() => openOverlay('privacy')}>
            Datenschutz
          </button>
          <button class="btn" onClick={() => openOverlay('credits')}>
            Mitwirkende
          </button>
        </nav>
        <p class="note">{LEARNING_NOTE}</p>
      </div>
    </div>
  );
}

export function PauseMenu() {
  return (
    <Modal title="Pause" onClose={closeOverlay}>
      <nav class="menu" aria-label="Pausenmenü">
        <button class="btn btn-primary" onClick={closeOverlay}>
          Weiterspielen
        </button>
        <button class="btn" onClick={() => openOverlay('map')}>
          Weltkarte
        </button>
        <button class="btn" onClick={() => openSettings()}>
          Einstellungen
        </button>
        <button class="btn" onClick={() => openOverlay('privacy')}>
          Datenschutz
        </button>
        <button class="btn" onClick={() => bus.emit('toTitle')}>
          Zum Titelbildschirm
        </button>
        <TeacherLink />
        <button class="btn" onClick={() => void logout()}>
          Abmelden
        </button>
      </nav>
      <details class="demo-tools">
        <summary>Testwerkzeuge (nur Platzhalter bis M4)</summary>
        <p>
          Der Spielfortschritt wird derzeit nur im Arbeitsspeicher gehalten und beim Neuladen
          verworfen.
        </p>
        <button class="btn" onClick={() => (bus.emit('demoResetProgress'), closeOverlay())}>
          Demo-Fortschritt zurücksetzen
        </button>
      </details>
      <p class="note">{LEARNING_NOTE}</p>
    </Modal>
  );
}

export function PrivacyInfo() {
  return (
    <Modal title="Datenschutz" onClose={closeOverlay} wide>
      <PrivacyText />
    </Modal>
  );
}

function TeacherLink() {
  const me = useStore(sessionStore, (s) => s.me);
  if (me?.role !== 'teacher') return null;
  return (
    <a class="btn" href="/dashboard.html" target="_blank" rel="noopener">
      Lehrkraft-Dashboard öffnen
    </a>
  );
}

export function Credits() {
  return (
    <Modal title="Mitwirkende" onClose={closeOverlay} wide>
      <div class="prose">
        <p>
          <strong>{GAME.title}</strong> – ein Lernspiel für IT-Ausbildungsberufe.
        </p>
        <h3>Grafik &amp; Klang</h3>
        <p>
          Alle Grafiken und Soundeffekte dieser Version werden vom Projekt selbst programmatisch
          erzeugt (siehe ASSETS_LICENSES.md).
        </p>
        <h3>Verwendete Bibliotheken</h3>
        <ul>
          <li>Phaser 3 – MIT-Lizenz</li>
          <li>Preact – MIT-Lizenz</li>
        </ul>
      </div>
    </Modal>
  );
}

/** PLACEHOLDER until M4: stands in for the real level view. */
export function LevelPlaceholder() {
  const level = useStore(appState, (s) => s.activeLevel);
  const close = () => {
    closeOverlay();
    bus.emit('levelClosed');
  };
  if (!level) return null;
  return (
    <Modal title={level.title} onClose={close} wide>
      <div class="prose">
        <p>{level.description}</p>
        <p class="hint-box">
          Hier erscheinen ab Meilenstein M4 die Aufgaben dieses Levels. Zum Testen der Freischaltung
          kannst du das Level jetzt mit einer Demo-Wertung abschließen.
        </p>
        <p>
          Bisher erreicht:{' '}
          <span aria-label={starString(level.stars).text}>{starString(level.stars).visual}</span>
        </p>
        <div class="menu-row">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              class="btn"
              onClick={() => {
                bus.emit('demoCompleteLevel', { levelId: level.levelId, stars: n });
                close();
              }}
            >
              Abschließen mit {starString(n).visual}
            </button>
          ))}
        </div>
        <button class="btn btn-primary" onClick={close}>
          Zurück zur Insel
        </button>
      </div>
    </Modal>
  );
}

export function RotateHint() {
  return (
    <div class="rotate-hint" aria-hidden="true">
      <p>Bitte halte dein Gerät quer, damit du mehr von der Insel siehst.</p>
    </div>
  );
}
