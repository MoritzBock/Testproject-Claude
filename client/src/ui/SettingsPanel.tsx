import { useEffect, useState } from 'preact/hooks';
import {
  ACTIONS,
  ACTION_LABELS,
  DEFAULT_BINDINGS,
  PIXEL_SCALES,
  TEXT_SCALES,
  assignKey,
  clearKey,
  cloneBindings,
  findConflicts,
  keyLabel,
  missingRequired,
  type Action,
  type Settings,
} from '@pixel/shared';
import { closeOverlay } from '../core/app-state';
import { resetSettings, settingsStore, updateSettings } from '../core/settings-store';
import { useStore } from '../core/store';
import { playSfx } from '../audio/sfx';
import { Modal } from './Modal';

type Tab = 'audio' | 'controls' | 'graphics' | 'a11y' | 'privacy';
const TABS: Array<[Tab, string]> = [
  ['audio', 'Audio'],
  ['controls', 'Steuerung'],
  ['graphics', 'Grafik'],
  ['a11y', 'Barrierefreiheit'],
  ['privacy', 'Privatsphäre'],
];

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('audio');
  const s = useStore(settingsStore, (x) => x.settings);
  return (
    <Modal title="Einstellungen" onClose={closeOverlay} wide>
      <div class="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            class={`tab ${tab === id ? 'tab-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class="tab-panel" role="tabpanel">
        {tab === 'audio' && <AudioTab s={s} />}
        {tab === 'controls' && <ControlsTab s={s} />}
        {tab === 'graphics' && <GraphicsTab s={s} />}
        {tab === 'a11y' && <A11yTab s={s} />}
        {tab === 'privacy' && <PrivacyTab s={s} />}
      </div>
      <div class="menu-row settings-footer">
        <button
          class="btn"
          onClick={() => {
            if (confirm('Alle Einstellungen auf die Standardwerte zurücksetzen?')) resetSettings();
          }}
        >
          Alles zurücksetzen
        </button>
        <span class="note">
          Nach der Anmeldung werden die Einstellungen an deinem Konto gespeichert.
        </span>
      </div>
    </Modal>
  );
}

function Slider(props: { label: string; value: number; onInput: (v: number) => void }) {
  return (
    <label class="field">
      <span>{props.label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(props.value * 100)}
        onInput={(e) => props.onInput(Number((e.target as HTMLInputElement).value) / 100)}
        onChange={() => playSfx('ui')}
      />
      <output>{Math.round(props.value * 100)} %</output>
    </label>
  );
}

function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label class="field field-toggle">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)}
      />
      <span>
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
    </label>
  );
}

function AudioTab({ s }: { s: Settings }) {
  return (
    <>
      <Slider
        label="Gesamtlautstärke"
        value={s.audio.master}
        onInput={(v) => updateSettings((x) => void (x.audio.master = v))}
      />
      <Slider
        label="Musik"
        value={s.audio.music}
        onInput={(v) => updateSettings((x) => void (x.audio.music = v))}
      />
      <Slider
        label="Effekte"
        value={s.audio.sfx}
        onInput={(v) => updateSettings((x) => void (x.audio.sfx = v))}
      />
      <Toggle
        label="Stummschalten"
        checked={s.audio.muted}
        onChange={(v) => updateSettings((x) => void (x.audio.muted = v))}
      />
      <p class="note">Musik und Klänge werden im Spiel erzeugt (keine Audiodateien).</p>
    </>
  );
}

function ControlsTab({ s }: { s: Settings }) {
  const [listening, setListening] = useState<{ action: Action; slot: 0 | 1 } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bindings = s.controls.bindings;

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const r = assignKey(bindings, listening.action, listening.slot, e.code);
      updateSettings((x) => void (x.controls.bindings = r.bindings));
      setNotice(
        r.swappedWith
          ? `„${keyLabel(e.code)}“ war „${ACTION_LABELS[r.swappedWith.action]}“ zugeordnet – die Belegungen wurden getauscht.`
          : null,
      );
      setListening(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [listening, bindings]);

  const missing = missingRequired(bindings);
  const conflicts = findConflicts(bindings);

  return (
    <>
      <table class="bindings">
        <thead>
          <tr>
            <th scope="col">Aktion</th>
            <th scope="col">Taste 1</th>
            <th scope="col">Taste 2</th>
          </tr>
        </thead>
        <tbody>
          {ACTIONS.map((a) => (
            <tr key={a}>
              <th scope="row">{ACTION_LABELS[a]}</th>
              {([0, 1] as const).map((slot) => {
                const active = listening?.action === a && listening.slot === slot;
                return (
                  <td key={slot}>
                    <button
                      class={`btn key-btn ${active ? 'key-listening' : ''}`}
                      onClick={() => setListening(active ? null : { action: a, slot })}
                      aria-label={`${ACTION_LABELS[a]}, Taste ${slot + 1}: ${keyLabel(bindings[a][slot])}. Zum Ändern klicken.`}
                    >
                      {active ? 'Taste drücken …' : keyLabel(bindings[a][slot])}
                    </button>
                    {bindings[a][slot] && !active && (
                      <button
                        class="btn btn-ghost btn-small"
                        aria-label={`Taste ${slot + 1} für ${ACTION_LABELS[a]} entfernen`}
                        onClick={() =>
                          updateSettings(
                            (x) => void (x.controls.bindings = clearKey(bindings, a, slot)),
                          )
                        }
                      >
                        ✕
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {listening && (
        <p class="hint-box">
          Drücke jetzt die gewünschte Taste.{' '}
          <button class="btn btn-small" onClick={() => setListening(null)}>
            Abbrechen
          </button>
        </p>
      )}
      {notice && <p class="hint-box">{notice}</p>}
      {conflicts.length > 0 && <p class="warning">Konflikt: Eine Taste ist mehrfach belegt.</p>}
      {missing.length > 0 && (
        <p class="warning">
          Ohne Taste: {missing.map((a) => ACTION_LABELS[a]).join(', ')}. Bitte belege diese
          Aktionen.
        </p>
      )}
      <div class="menu-row">
        <button
          class="btn"
          onClick={() =>
            updateSettings((x) => void (x.controls.bindings = cloneBindings(DEFAULT_BINDINGS)))
          }
        >
          Standard wiederherstellen
        </button>
      </div>
      <label class="field">
        <span>Touch-Steuerung</span>
        <select
          value={s.controls.touchControls}
          onChange={(e) =>
            updateSettings(
              (x) =>
                void (x.controls.touchControls = (e.target as HTMLSelectElement).value as
                  'auto' | 'on' | 'off'),
            )
          }
        >
          <option value="auto">Automatisch</option>
          <option value="on">Immer anzeigen</option>
          <option value="off">Ausblenden</option>
        </select>
      </label>
      <p class="note">
        Gamepad: linker Stick/Steuerkreuz bewegen, A interagieren, Start Pause, Select Weltkarte, B
        zurück. In Menüs bewegt das Steuerkreuz die Auswahl, A bestätigt.
      </p>
    </>
  );
}

function GraphicsTab({ s }: { s: Settings }) {
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return (
    <>
      {document.fullscreenEnabled && (
        <Toggle
          label="Vollbild"
          checked={fs}
          onChange={(v) =>
            void (
              v ? document.documentElement.requestFullscreen() : document.exitFullscreen()
            ).catch(() => {})
          }
        />
      )}
      <label class="field">
        <span>Pixel-Skalierung</span>
        <select
          value={String(s.graphics.pixelScale)}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            updateSettings((x) => void (x.graphics.pixelScale = v === 'auto' ? 'auto' : Number(v)));
          }}
        >
          {PIXEL_SCALES.map((p) => (
            <option key={p} value={String(p)}>
              {p === 'auto' ? 'Automatisch' : `${p}×`}
            </option>
          ))}
        </select>
      </label>
      <Toggle
        label="Bildschirmwackeln"
        checked={s.graphics.screenShake}
        onChange={(v) => updateSettings((x) => void (x.graphics.screenShake = v))}
      />
      <Toggle
        label="Effekte und Animationen der Umgebung"
        checked={s.graphics.effects}
        onChange={(v) => updateSettings((x) => void (x.graphics.effects = v))}
      />
      <Toggle
        label="Minikarte anzeigen"
        checked={s.graphics.showMinimap}
        onChange={(v) => updateSettings((x) => void (x.graphics.showMinimap = v))}
      />
    </>
  );
}

function A11yTab({ s }: { s: Settings }) {
  return (
    <>
      <label class="field">
        <span>Textgröße</span>
        <select
          value={String(s.a11y.textScale)}
          onChange={(e) =>
            updateSettings(
              (x) =>
                void (x.a11y.textScale = Number(
                  (e.target as HTMLSelectElement).value,
                ) as Settings['a11y']['textScale']),
            )
          }
        >
          {TEXT_SCALES.map((t) => (
            <option key={t} value={String(t)}>
              {Math.round(t * 100)} %
            </option>
          ))}
        </select>
      </label>
      <Toggle
        label="Reduzierte Animationen"
        hint="Kein Blinken, keine Überblendungen, kein Bildschirmwackeln."
        checked={s.a11y.reducedMotion}
        onChange={(v) => updateSettings((x) => void (x.a11y.reducedMotion = v))}
      />
      <Toggle
        label="Farbenblind-freundliche Markierungen"
        hint="Status zusätzlich als Text an Portalen und Gegenständen."
        checked={s.a11y.colorblindMarkers}
        onChange={(v) => updateSettings((x) => void (x.a11y.colorblindMarkers = v))}
      />
      <Toggle
        label="Untertitel für Sound-Hinweise"
        checked={s.a11y.subtitles}
        onChange={(v) => updateSettings((x) => void (x.a11y.subtitles = v))}
      />
    </>
  );
}

function PrivacyTab({ s }: { s: Settings }) {
  return (
    <>
      <Toggle
        label="In Ranglisten anonym erscheinen"
        hint="Andere sehen dann „Anonym“ statt deines Benutzernamens. Du selbst siehst deinen Platz trotzdem."
        checked={s.privacy.leaderboardAnonymous}
        onChange={(v) => updateSettings((x) => void (x.privacy.leaderboardAnonymous = v))}
      />
      <p class="note">
        Welche Daten über dich gespeichert sind, siehst du im Menü unter „Meine Daten“. Dort kannst
        du sie auch herunterladen.
      </p>
    </>
  );
}
