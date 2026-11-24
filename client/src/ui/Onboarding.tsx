import { useState } from 'preact/hooks';
import { PASSWORD_MIN, type MeResponse } from '@pixel/shared';
import { post } from '../api/http';
import { logout, proceed, sessionStore } from '../core/session';
import { useStore } from '../core/store';
import { playSfx } from '../audio/sfx';
import { PrivacyText } from './PrivacyText';
import { CharacterCreator } from './CharacterCreator';

/** Mandatory first steps: new password → privacy notice → character. */
export function Onboarding() {
  const me = useStore(sessionStore, (s) => s.me);
  if (!me) return null;
  if (me.mustChangePassword) return <ChangePassword />;
  if (me.privacyAckRequired) return <PrivacyAck version={me.privacyVersion} />;
  if (me.totpSetupRequired)
    return (
      <Card title="Zwei-Faktor-Anmeldung erforderlich">
        <p>Bitte richte die Zwei-Faktor-Anmeldung im Lehrkraft-Dashboard ein.</p>
        <a class="btn btn-primary" href="/dashboard.html">
          Zum Dashboard
        </a>
      </Card>
    );
  if (!me.hasCharacter) return <CharacterCreator />;
  return null;
}

function Card(props: { title: string; wide?: boolean; children: preact.ComponentChildren }) {
  return (
    <div class="title-screen">
      <div
        class={`title-card onboarding-card ${props.wide ? 'wide' : ''}`}
        role="dialog"
        aria-label={props.title}
      >
        <h1>{props.title}</h1>
        {props.children}
      </div>
    </div>
  );
}

export function ChangePassword({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    if (next !== repeat) return setError('Die beiden neuen Passwörter stimmen nicht überein.');
    try {
      const me = await post<MeResponse>('/api/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      });
      playSfx('confirm');
      sessionStore.set({ me });
      if (onDone) onDone();
      else await proceed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    }
  };
  return (
    <Card title="Neues Passwort festlegen">
      <form onSubmit={submit}>
        <p>
          Bitte ersetze dein Startpasswort durch ein eigenes (mindestens {PASSWORD_MIN} Zeichen).
        </p>
        <label class="form-field">
          Bisheriges Passwort
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onInput={(e) => setCurrent((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="form-field">
          Neues Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            required
            value={next}
            onInput={(e) => setNext((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="form-field">
          Neues Passwort wiederholen
          <input
            type="password"
            autoComplete="new-password"
            required
            value={repeat}
            onInput={(e) => setRepeat((e.target as HTMLInputElement).value)}
          />
        </label>
        <p class="note">
          Tipp: Ein kurzer Satz ist leicht zu merken und schwer zu erraten, z. B.
          „Mein-Hund-mag-Kekse!“.
        </p>
        {error && (
          <p class="warning" role="alert">
            {error}
          </p>
        )}
        <button class="btn btn-primary btn-big">Speichern</button>
        <button type="button" class="btn btn-ghost" onClick={() => void logout()}>
          Abmelden
        </button>
      </form>
    </Card>
  );
}

function PrivacyAck({ version }: { version: number }) {
  const [checked, setChecked] = useState(false);
  const ack = async () => {
    const me = await post<MeResponse>('/api/auth/privacy-ack', { version });
    playSfx('confirm');
    sessionStore.set({ me });
    await proceed();
  };
  return (
    <Card title="Datenschutzinformation" wide>
      <div class="scroll-box" tabIndex={0}>
        <PrivacyText />
      </div>
      <label class="check-line">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked((e.target as HTMLInputElement).checked)}
        />
        Ich habe die Datenschutzinformation gelesen.
      </label>
      <div class="menu-row center">
        <button class="btn btn-primary btn-big" disabled={!checked} onClick={() => void ack()}>
          Bestätigen und weiter
        </button>
        <button class="btn btn-ghost" onClick={() => void logout()}>
          Abmelden
        </button>
      </div>
    </Card>
  );
}
