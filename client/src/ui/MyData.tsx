import { useEffect, useState } from 'preact/hooks';
import type { MeResponse } from '@pixel/shared';
import { del, get, post } from '../api/http';
import { closeOverlay, notify, openOverlay } from '../core/app-state';
import { logout, sessionStore } from '../core/session';
import { useStore } from '../core/store';
import { Modal } from './Modal';
import { LEARNING_NOTE } from './Menus';

type DataExport = Record<string, unknown> & {
  account: {
    username: string;
    class: { name: string } | null;
    createdAt: string;
    lastActiveAt: string;
  };
  whoCanSee: { teachersOfYourClass: string[]; administration: string; classmates: string };
  inventory: unknown[];
  transactions: unknown[];
  levelProgress: unknown[];
  taskAttempts: unknown[];
  taskSummary: unknown[];
  onlineMinutesPerDay: Array<{ minutes: number }>;
  achievements: unknown[];
  retention: {
    attemptsDays: number;
    activityDays: number;
    accountDeletedAfterInactiveDays: number;
    scheduledAutomaticDeletion: string | null;
  };
};

const date = (iso: string | number | null) =>
  iso ? new Date(iso).toLocaleDateString('de-DE') : '–';

/** "Meine Daten": access (Art. 15), download (Art. 20), deletion/archiving (Art. 17). */
export function MyData() {
  const me = useStore(sessionStore, (s) => s.me);
  const [data, setData] = useState<DataExport | null>(null);
  const [pw, setPw] = useState('');
  const [mode, setMode] = useState<null | 'delete' | 'archive'>(null);
  useEffect(() => {
    get<DataExport>('/api/me/data')
      .then(setData)
      .catch((e: Error) => notify(e.message, 'warning'));
  }, []);

  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meine-daten-${data.account.username}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const refreshMe = async () => sessionStore.set({ me: await get<MeResponse>('/api/auth/me') });

  const confirm = async () => {
    try {
      if (mode === 'delete') {
        const r = await post<{ deleted: boolean; executeAt?: number }>('/api/me/delete-request', {
          password: pw,
        });
        if (r.deleted) {
          notify('Dein Konto wurde gelöscht.', 'success');
          await logout();
          return;
        }
        notify(`Löschung beantragt für den ${date(r.executeAt ?? null)}.`, 'success');
        await refreshMe();
      } else if (mode === 'archive') {
        await post('/api/me/archive', { password: pw });
        notify('Dein Konto wurde archiviert.', 'success');
        await logout();
        return;
      }
      setMode(null);
      setPw('');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Fehler', 'warning');
    }
  };

  if (!me) return null;
  const minutes = data?.onlineMinutesPerDay.reduce((s, d) => s + d.minutes, 0) ?? 0;
  return (
    <Modal title="Meine Daten" onClose={closeOverlay} wide>
      <div class="prose">
        {!data ? (
          <p>Lade …</p>
        ) : (
          <>
            <h3>Was über dich gespeichert ist</h3>
            <ul>
              <li>
                Konto: <strong>{data.account.username}</strong>
                {data.account.class && <> in {data.account.class.name}</>} · angelegt{' '}
                {date(data.account.createdAt)} · zuletzt aktiv {date(data.account.lastActiveAt)}
              </li>
              <li>
                Spielstand: {data.levelProgress.length} Level begonnen · {data.inventory.length}{' '}
                Gegenstände · {data.achievements.length} Erfolge · {data.transactions.length}{' '}
                Bytes-Buchungen
              </li>
              <li>
                Lernstand: {data.taskSummary.length} Aufgaben bearbeitet ·{' '}
                {data.taskAttempts.length} einzelne Versuche (der letzten{' '}
                {Math.round(data.retention.attemptsDays / 7)} Wochen)
              </li>
              <li>Online-Zeit: {minutes} Minuten (nur Minuten pro Tag, keine Uhrzeiten)</li>
              <li>Deine Einstellungen und das Aussehen deiner Figur</li>
            </ul>
            <h3>Wer deine Daten sieht</h3>
            <ul>
              <li>
                Lehrkräfte deiner Klasse: {data.whoCanSee.teachersOfYourClass.join(', ') || '–'}
              </li>
              <li>Administration: {data.whoCanSee.administration}</li>
              <li>Mitspielende: {data.whoCanSee.classmates}</li>
            </ul>
            <h3>Wie lange</h3>
            <p>
              Dein Konto wird automatisch gelöscht, wenn du{' '}
              {Math.round(data.retention.accountDeletedAfterInactiveDays / 30.5)} Monate nicht aktiv
              warst (derzeit am {date(data.retention.scheduledAutomaticDeletion)}).
            </p>
            <div class="menu-row">
              <button class="btn btn-primary" onClick={download}>
                Alle Daten herunterladen (JSON)
              </button>
              <button class="btn" onClick={() => openOverlay('privacy')}>
                Datenschutzinformation
              </button>
            </div>
          </>
        )}

        <h3>Konto löschen oder archivieren</h3>
        {me.deletionRequestedFor ? (
          <p class="hint-box">
            Die Löschung deines Kontos ist für den <strong>{date(me.deletionRequestedFor)}</strong>{' '}
            geplant.{' '}
            <button
              class="btn btn-small"
              onClick={async () => {
                await del('/api/me/delete-request');
                await refreshMe();
                notify('Löschantrag zurückgenommen.', 'success');
              }}
            >
              Doch nicht löschen
            </button>
          </p>
        ) : (
          <p>
            Du kannst dein Konto selbst löschen (nach einer Bedenkzeit) oder archivieren (Anmeldung
            deaktiviert, Daten bleiben bis zur normalen Löschfrist). Du kannst dich auch an deine
            Lehrkraft wenden.
          </p>
        )}
        {mode ? (
          <div class="panel">
            <p>
              {mode === 'delete' ? 'Konto und alle Daten löschen' : 'Konto archivieren'} – bitte mit
              deinem Passwort bestätigen.
            </p>
            <label class="form-field">
              Passwort
              <input
                type="password"
                autoComplete="current-password"
                value={pw}
                onInput={(e) => setPw((e.target as HTMLInputElement).value)}
              />
            </label>
            <div class="menu-row">
              <button class="btn btn-primary" disabled={!pw} onClick={() => void confirm()}>
                Bestätigen
              </button>
              <button class="btn" onClick={() => setMode(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          me.role === 'student' &&
          !me.deletionRequestedFor && (
            <div class="menu-row">
              <button class="btn" onClick={() => setMode('delete')}>
                Konto löschen …
              </button>
              <button class="btn" onClick={() => setMode('archive')}>
                Konto archivieren …
              </button>
            </div>
          )
        )}
        <p class="note">{LEARNING_NOTE}</p>
      </div>
    </Modal>
  );
}
