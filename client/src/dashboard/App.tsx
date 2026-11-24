import { useEffect, useState } from 'preact/hooks';
import QRCode from 'qrcode-generator';
import { PASSWORD_MIN, type MeResponse } from '@pixel/shared';
import { ApiError, get, post } from '../api/http';
import { useStore } from '../core/store';
import { dash, go } from './store';
import { LEARNING_NOTE, Toasts, showError } from './ui';
import { ClassesView } from './views/Classes';
import { ClassView } from './views/ClassView';
import { PersonView } from './views/Person';
import { AuditView } from './views/Audit';
import { TeachersView, GlobalSettingsView } from './views/Admin';

export function DashApp() {
  const me = useStore(dash, (s) => s.me);
  const [checked, setChecked] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => {
    Promise.all([
      get<MeResponse>('/api/auth/me').catch(() => null),
      get<{ needsSetup: boolean }>('/api/setup/status').catch(() => ({ needsSetup: false })),
    ]).then(([m, s]) => {
      dash.set({ me: m });
      setNeedsSetup(s.needsSetup);
      setChecked(true);
    });
  }, []);
  if (!checked) return <p class="dash-center">Lade …</p>;
  if (!me) return needsSetup ? <Setup /> : <Login />;
  if (me.role === 'student')
    return (
      <div class="dash-center">
        <p>Das Dashboard ist nur für Lehrkräfte.</p>
        <a class="btn btn-primary" href="/">
          Zum Spiel
        </a>
      </div>
    );
  if (me.mustChangePassword)
    return (
      <AuthCard title="Neues Passwort festlegen">
        <PasswordForm />
      </AuthCard>
    );
  if (me.privacyAckRequired) return <StaffPrivacy version={me.privacyVersion} />;
  if (me.totpSetupRequired)
    return (
      <AuthCard title="Zwei-Faktor-Anmeldung einrichten">
        <p>Für Ihr Konto ist die Zwei-Faktor-Anmeldung verpflichtend.</p>
        <TotpSetup />
      </AuthCard>
    );
  return <Layout me={me} />;
}

function Layout({ me }: { me: MeResponse }) {
  const route = useStore(dash, (s) => s.route);
  const parts = route.split('/').filter(Boolean);
  const nav =
    me.role === 'superadmin'
      ? [
          ['/lehrkraefte', 'Lehrkräfte'],
          ['/global', 'Globale Einstellungen'],
          ['/protokoll', 'Protokoll'],
          ['/konto', 'Mein Konto'],
        ]
      : [
          ['/klassen', 'Klassen'],
          ['/protokoll', 'Protokoll'],
          ['/konto', 'Mein Konto'],
        ];
  let view;
  if (me.role === 'superadmin') {
    if (parts[0] === 'global') view = <GlobalSettingsView />;
    else if (parts[0] === 'protokoll') view = <AuditView />;
    else if (parts[0] === 'konto') view = <AccountView me={me} />;
    else view = <TeachersView />;
  } else if (parts[0] === 'klasse' && parts[1])
    view = <ClassView classId={parts[1]} tab={parts[2] ?? 'lernende'} />;
  else if (parts[0] === 'person' && parts[1]) view = <PersonView studentId={parts[1]} />;
  else if (parts[0] === 'protokoll') view = <AuditView />;
  else if (parts[0] === 'konto') view = <AccountView me={me} />;
  else view = <ClassesView />;

  return (
    <div class="dash">
      <header class="dash-header">
        <a class="dash-brand" href="#/">
          Pixel-Lernwelt{' '}
          <span>{me.role === 'superadmin' ? 'Administration' : 'Lehrkraft-Dashboard'}</span>
        </a>
        <nav aria-label="Hauptnavigation">
          {nav.map(([r, l]) => (
            <a
              key={r}
              href={`#${r}`}
              class={`dash-nav ${route.startsWith(r!) ? 'dash-nav-active' : ''}`}
            >
              {l}
            </a>
          ))}
        </nav>
        <div class="dash-user">
          {me.role === 'teacher' && (
            <a class="btn btn-small" href="/" target="_blank" rel="noopener">
              Spiel öffnen
            </a>
          )}
          <span>{me.username}</span>
          <button
            class="btn btn-small"
            onClick={async () => {
              await post('/api/auth/logout').catch(() => {});
              dash.set({ me: null });
            }}
          >
            Abmelden
          </button>
        </div>
      </header>
      <p class="dash-note">{LEARNING_NOTE}</p>
      <main class="dash-main">{view}</main>
      <Toasts />
    </div>
  );
}

function AuthCard({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <div class="dash-center">
      <div class="title-card onboarding-card wide">
        <h1>{title}</h1>
        {children}
      </div>
      <Toasts />
    </div>
  );
}

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    try {
      const me = await post<MeResponse>('/api/auth/login', {
        username,
        password,
        totp: needTotp ? totp : undefined,
      });
      dash.set({ me });
      if (me.role === 'superadmin') go('/lehrkraefte');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'totp_required') setNeedTotp(true);
      setError(err instanceof Error ? err.message : 'Fehler');
    }
  };
  return (
    <AuthCard title="Anmeldung Lehrkraft / Administration">
      <form onSubmit={submit}>
        <label class="form-field">
          Benutzername
          <input
            autoComplete="username"
            required
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="form-field">
          Passwort
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </label>
        {needTotp && (
          <label class="form-field">
            Code aus der Authenticator-App
            <input
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={totp}
              onInput={(e) => setTotp((e.target as HTMLInputElement).value)}
            />
          </label>
        )}
        {error && <p class="warning">{error}</p>}
        <button class="btn btn-primary btn-big">Anmelden</button>
        {import.meta.env.DEV && (
          <p class="note dev-note">
            Entwicklungsmodus – Demo: lehrkraft / Lehrkraft-Passwort-1 · admin / Admin-Passwort-1
          </p>
        )}
      </form>
    </AuthCard>
  );
}

function Setup() {
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    try {
      dash.set({ me: await post<MeResponse>('/api/setup', { token, username, password }) });
      go('/lehrkraefte');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    }
  };
  return (
    <AuthCard title="Ersteinrichtung">
      <form onSubmit={submit}>
        <p>
          Legen Sie das Administrationskonto an. Das einmalige Setup-Token steht beim ersten Start
          im Server-Log (<code>docker compose logs app</code>).
        </p>
        <label class="form-field">
          Setup-Token
          <input
            required
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="form-field">
          Benutzername der Administration
          <input
            required
            autoComplete="username"
            value={username}
            onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="form-field">
          Passwort (mind. {PASSWORD_MIN} Zeichen)
          <input
            type="password"
            required
            minLength={PASSWORD_MIN}
            autoComplete="new-password"
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
          />
        </label>
        {error && <p class="warning">{error}</p>}
        <button class="btn btn-primary btn-big">Einrichten</button>
      </form>
    </AuthCard>
  );
}

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const submit = async (e: Event) => {
    e.preventDefault();
    if (next !== repeat) return showError(new Error('Die neuen Passwörter stimmen nicht überein.'));
    try {
      dash.set({
        me: await post<MeResponse>('/api/auth/change-password', {
          currentPassword: current,
          newPassword: next,
        }),
      });
      setCurrent('');
      setNext('');
      setRepeat('');
      onDone?.();
    } catch (err) {
      showError(err);
    }
  };
  return (
    <form onSubmit={submit} class="narrow-form">
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
        Neues Passwort (mind. {PASSWORD_MIN} Zeichen)
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
        Wiederholen
        <input
          type="password"
          autoComplete="new-password"
          required
          value={repeat}
          onInput={(e) => setRepeat((e.target as HTMLInputElement).value)}
        />
      </label>
      <button class="btn btn-primary">Passwort ändern</button>
    </form>
  );
}

function StaffPrivacy({ version }: { version: number }) {
  const [ok, setOk] = useState(false);
  return (
    <AuthCard title="Hinweise zum Datenschutz">
      <div class="prose">
        <p>
          Sie verarbeiten im Dashboard pseudonymisierte Lernstandsdaten Ihrer Klassen. Bitte
          beachten Sie:
        </p>
        <ul>
          <li>Nutzen Sie die Daten ausschließlich zur Lernbegleitung, nicht zur Notengebung.</li>
          <li>
            Führen Sie die Zuordnung Pseudonym → Person nur außerhalb des Systems (z. B.
            ausgedruckte Liste).
          </li>
          <li>
            Tragen Sie in Notizen keine sensiblen Daten ein (keine Gesundheitsdaten, keine
            Klarnamen).
          </li>
          <li>
            Exporte nur auf dienstlichen, geschützten Geräten speichern und nach Gebrauch löschen.
          </li>
          <li>Alle Verwaltungsaktionen werden protokolliert.</li>
        </ul>
        <p class="note">Entwurf – Ergänzung durch Schulleitung / Datenschutzbeauftragte(n).</p>
      </div>
      <label class="check-line">
        <input
          type="checkbox"
          checked={ok}
          onChange={(e) => setOk((e.target as HTMLInputElement).checked)}
        />{' '}
        Ich habe die Hinweise gelesen.
      </label>
      <button
        class="btn btn-primary btn-big"
        disabled={!ok}
        onClick={async () =>
          dash.set({ me: await post<MeResponse>('/api/auth/privacy-ack', { version }) })
        }
      >
        Weiter
      </button>
    </AuthCard>
  );
}

export function TotpSetup() {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const start = async () => {
    try {
      setSetup(await post('/api/auth/totp/setup'));
    } catch (e) {
      showError(e);
    }
  };
  const qr = (() => {
    if (!setup) return '';
    const q = QRCode(0, 'M');
    q.addData(setup.uri);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  })();
  if (!setup)
    return (
      <button class="btn btn-primary" onClick={() => void start()}>
        Zwei-Faktor-Anmeldung einrichten
      </button>
    );
  return (
    <div class="totp">
      <p>
        Scannen Sie den QR-Code mit einer Authenticator-App (z. B. eine Open-Source-App auf dem
        Diensthandy).
      </p>
      <div class="qr" dangerouslySetInnerHTML={{ __html: qr }} />
      <p class="note">
        Manuelle Eingabe: <code>{setup.secret}</code>
      </p>
      <label class="form-field">
        6-stelliger Code zur Bestätigung
        <input
          inputMode="numeric"
          maxLength={6}
          value={code}
          onInput={(e) => setCode((e.target as HTMLInputElement).value)}
        />
      </label>
      <button
        class="btn btn-primary"
        onClick={async () => {
          try {
            dash.set({ me: await post<MeResponse>('/api/auth/totp/enable', { code }) });
            setSetup(null);
          } catch (e) {
            showError(e);
          }
        }}
      >
        Aktivieren
      </button>
    </div>
  );
}

function AccountView({ me }: { me: MeResponse }) {
  const [pw, setPw] = useState('');
  return (
    <div class="dash-grid">
      <section class="panel">
        <h2>Passwort ändern</h2>
        <PasswordForm />
      </section>
      <section class="panel">
        <h2>Zwei-Faktor-Anmeldung</h2>
        {me.totpEnabled ? (
          <>
            <p>✓ Aktiv.</p>
            {!me.totpSetupRequired && (
              <form
                class="narrow-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    dash.set({
                      me: await post<MeResponse>('/api/auth/totp/disable', { password: pw }),
                    });
                  } catch (err) {
                    showError(err);
                  }
                }}
              >
                <label class="form-field">
                  Zum Deaktivieren Passwort eingeben
                  <input
                    type="password"
                    value={pw}
                    onInput={(e) => setPw((e.target as HTMLInputElement).value)}
                  />
                </label>
                <button class="btn">Deaktivieren</button>
              </form>
            )}
          </>
        ) : (
          <TotpSetup />
        )}
      </section>
    </div>
  );
}
