import { useState } from 'preact/hooks';
import { del, get, patch, post } from '../../api/http';
import { notify } from '../../core/app-state';
import { fmtDate, showError, useLoad } from '../ui';
import { PolicyEditor, PrintList } from './ClassView';

interface Teacher {
  id: string;
  username: string;
  status: string;
  totpEnabled: boolean;
  lastActiveAt: number;
  classCount: number;
}

export function TeachersView() {
  const [list, reload] = useLoad(() => get<Teacher[]>('/api/admin/teachers'));
  const [name, setName] = useState('');
  const [pw, setPw] = useState<Array<{ username: string; startPassword: string }> | null>(null);
  return (
    <>
      <h1>Lehrkräfte</h1>
      <p class="note">
        Die Administration verwaltet nur Lehrkraft-Konten und hat keinen Zugriff auf
        Lernstandsdaten.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Benutzername</th>
              <th>Status</th>
              <th>2FA</th>
              <th>Klassen</th>
              <th>Letzte Aktivität</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {list?.map((t) => (
              <tr key={t.id}>
                <td>{t.username}</td>
                <td>{t.status === 'active' ? 'aktiv' : 'gesperrt'}</td>
                <td>{t.totpEnabled ? '✓' : '–'}</td>
                <td>{t.classCount}</td>
                <td>{fmtDate(t.lastActiveAt)}</td>
                <td class="menu-row">
                  <button
                    class="btn btn-small"
                    onClick={async () => {
                      const r = await post<{ username: string; startPassword: string }>(
                        `/api/admin/teachers/${t.id}/reset-password`,
                      ).catch(showError);
                      if (r) setPw([r]);
                    }}
                  >
                    Passwort zurücksetzen
                  </button>
                  <button
                    class="btn btn-small"
                    onClick={async () => {
                      await patch(`/api/admin/teachers/${t.id}`, {
                        status: t.status === 'active' ? 'locked' : 'active',
                      }).catch(showError);
                      reload();
                    }}
                  >
                    {t.status === 'active' ? 'Sperren' : 'Entsperren'}
                  </button>
                  <button
                    class="btn btn-small danger"
                    onClick={async () => {
                      if (!confirm(`Lehrkraft „${t.username}“ löschen?`)) return;
                      try {
                        await del(`/api/admin/teachers/${t.id}`);
                        reload();
                      } catch (e) {
                        showError(e);
                      }
                    }}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section class="panel">
        <h2>Neue Lehrkraft</h2>
        <form
          class="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await post<{ username: string; startPassword: string }>(
                '/api/admin/teachers',
                { username: name },
              );
              setPw([r]);
              setName('');
              reload();
              notify('Konto angelegt.', 'success');
            } catch (err) {
              showError(err);
            }
          }}
        >
          <label class="form-field">
            Benutzername (Kürzel, kein Klarname nötig)
            <input
              required
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </label>
          <button class="btn btn-primary">Anlegen</button>
        </form>
      </section>
      {pw && <PrintList title="Startpasswort" accounts={pw} onClose={() => setPw(null)} />}
    </>
  );
}

export function GlobalSettingsView() {
  return (
    <>
      <h1>Globale Voreinstellungen</h1>
      <section class="panel">
        <p class="note">Gelten für alle Klassen, solange Lehrkräfte nichts anderes einstellen.</p>
        <PolicyEditor scopeType="global" scopeId="*" />
      </section>
    </>
  );
}
