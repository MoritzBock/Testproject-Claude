import { useState } from 'preact/hooks';
import type { MeResponse } from '@pixel/shared';
import { ApiError, post } from '../api/http';
import { appState, openOverlay } from '../core/app-state';
import { proceed, sessionStore } from '../core/session';
import { playSfx, unlockAudio } from '../audio/sfx';

export function LoginScreen() {
  const [staff, setStaff] = useState(false);
  const [classCode, setClassCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      const me = await post<MeResponse>('/api/auth/login', {
        classCode: staff ? undefined : classCode,
        username,
        password,
        totp: needTotp ? totp : undefined,
      });
      playSfx('confirm');
      setPassword('');
      sessionStore.set({ me });
      await proceed();
    } catch (err) {
      playSfx('deny');
      if (err instanceof ApiError && err.code === 'totp_required') setNeedTotp(true);
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="title-screen">
      <form class="title-card login-card" onSubmit={submit} aria-label="Anmeldung">
        <h1>Anmelden</h1>
        <label class="check-line">
          <input
            type="checkbox"
            checked={staff}
            onChange={(e) => setStaff((e.target as HTMLInputElement).checked)}
          />
          Ich bin Lehrkraft / Administration
        </label>
        {!staff && (
          <label class="form-field">
            Klassencode
            <input
              value={classCode}
              onInput={(e) => setClassCode((e.target as HTMLInputElement).value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              required
              placeholder="z. B. K7M-Q2P"
            />
          </label>
        )}
        <label class="form-field">
          Benutzername
          <input
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
            autoComplete="username"
            autoCapitalize="off"
            required
          />
        </label>
        <label class="form-field">
          Passwort
          <input
            type="password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            autoComplete="current-password"
            required
          />
        </label>
        {needTotp && (
          <label class="form-field">
            Code aus der Authenticator-App
            <input
              value={totp}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              onInput={(e) => setTotp((e.target as HTMLInputElement).value)}
              required
            />
          </label>
        )}
        {error && (
          <p class="warning" role="alert">
            {error}
          </p>
        )}
        <button class="btn btn-primary btn-big" disabled={busy}>
          {busy ? 'Einen Moment …' : 'Anmelden'}
        </button>
        <div class="menu-row center">
          <button
            type="button"
            class="btn btn-ghost"
            onClick={() => appState.set({ screen: 'title' })}
          >
            Zurück
          </button>
          <button type="button" class="btn btn-ghost" onClick={() => openOverlay('privacy')}>
            Datenschutz
          </button>
        </div>
        <p class="note">Passwort vergessen? Deine Lehrkraft kann es zurücksetzen.</p>
        {import.meta.env.DEV && (
          <p class="note dev-note">
            Entwicklungsmodus – Demo: Klassencode DEMO-01, „Pixelfuchs“ / Schueler-Passwort-1 ·
            Lehrkraft: „lehrkraft“ / Lehrkraft-Passwort-1
          </p>
        )}
      </form>
    </div>
  );
}
