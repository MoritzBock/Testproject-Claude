import { useState } from 'preact/hooks';
import { ACHIEVEMENT_BY_ID, type LevelMeta } from '@pixel/shared';
import { del, get, patch, post, put } from '../../api/http';
import { notify } from '../../core/app-state';
import { go } from '../store';
import {
  BarChart,
  Dialog,
  Meter,
  fmtDate,
  fmtDateTime,
  fmtMinutes,
  fmtMs,
  showError,
  useLoad,
} from '../ui';
import { LevelOverrideEditor, PolicyEditor, PrintList, statusLabel } from './ClassView';

interface Detail {
  student: {
    id: string;
    username: string;
    status: string;
    lastActiveAt: number;
    createdAt: number;
  };
  note: string;
  balance: { balance: number; totalEarned: number };
  items: number;
  achievements: string[];
  activity: Array<{ day: string; minutes: number }>;
  levels: Array<{
    levelId: string;
    title: string;
    status: string;
    bestStars: number;
    runs: number;
    totalTimeMs: number;
  }>;
  tasks: Array<{
    levelTitle: string;
    prompt: string;
    attempts: number;
    errors: number;
    hints: number;
    timeSumMs: number;
  }>;
  history: Array<{
    createdAt: number;
    levelTitle: string;
    prompt: string;
    attemptNo: number;
    correct: boolean;
    points: number;
    maxPoints: number;
    hintsUsed: number;
    durationMs: number;
  }>;
  historyRetentionDays: number;
}

function lastDays(activity: Detail['activity'], n: number) {
  const map = new Map(activity.map((a) => [a.day, a.minutes]));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
    out.push({
      label: d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
      value: map.get(key) ?? 0,
    });
  }
  return out;
}

function weekly(activity: Detail['activity']) {
  const weeks = new Map<string, number>();
  for (const a of activity) {
    const d = new Date(`${a.day}T12:00:00`);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    weeks.set(key, (weeks.get(key) ?? 0) + a.minutes);
  }
  return [...weeks.entries()].slice(-8).map(([label, value]) => ({ label: `ab ${label}`, value }));
}

export function PersonView({ studentId }: { studentId: string }) {
  const [d, reload, error] = useLoad(
    () => get<Detail>(`/api/teacher/students/${studentId}/detail`),
    [studentId],
  );
  const [levels] = useLoad(() =>
    get<Array<LevelMeta & { tasks: Array<{ id: string; type: string; prompt: string }> }>>(
      '/api/teacher/levels',
    ),
  );
  const [note, setNote] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Array<{
    username: string;
    startPassword: string;
  }> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (error) return <p class="warning">{error}</p>;
  if (!d || !levels) return <p>Lade …</p>;
  const s = d.student;
  const total = d.activity.reduce((a, x) => a + x.minutes, 0);

  return (
    <>
      <p>
        <button class="btn btn-ghost btn-small" onClick={() => history.back()}>
          ← zurück
        </button>
      </p>
      <h1>
        {s.username} <span class="note">· {statusLabel(s.status)}</span>
      </h1>
      <div class="menu-row">
        <button
          class="btn btn-small"
          onClick={async () => {
            const r = await post<{ username: string; startPassword: string }>(
              `/api/teacher/students/${s.id}/reset-password`,
            ).catch(showError);
            if (r) setPasswords([r]);
          }}
        >
          Passwort zurücksetzen
        </button>
        <button
          class="btn btn-small"
          onClick={async () => {
            await patch(`/api/teacher/students/${s.id}`, {
              status: s.status === 'active' ? 'locked' : 'active',
            }).catch(showError);
            reload();
          }}
        >
          {s.status === 'active' ? 'Sperren' : 'Aktivieren'}
        </button>
        <button
          class="btn btn-small"
          onClick={async () => {
            await patch(`/api/teacher/students/${s.id}`, { status: 'archived' }).catch(showError);
            reload();
          }}
        >
          Archivieren
        </button>
        <button class="btn btn-small danger" onClick={() => setConfirmDelete(true)}>
          Konto löschen
        </button>
      </div>

      <div class="kpis">
        <div class="kpi">
          <span class="kpi-value">{d.levels.filter((l) => l.status === 'completed').length}</span>
          <span class="kpi-label">Level abgeschlossen</span>
        </div>
        <div class="kpi">
          <span class="kpi-value">{d.levels.reduce((a, l) => a + l.bestStars, 0)}</span>
          <span class="kpi-label">Sterne</span>
        </div>
        <div class="kpi">
          <span class="kpi-value">{fmtMinutes(total)}</span>
          <span class="kpi-label">Nutzung gesamt</span>
        </div>
        <div class="kpi">
          <span class="kpi-value">{fmtDate(s.lastActiveAt)}</span>
          <span class="kpi-label">Letzte Aktivität</span>
        </div>
      </div>

      <div class="dash-grid">
        <section class="panel">
          <BarChart
            title="Online-Minuten pro Tag (letzte 28 Tage)"
            data={lastDays(d.activity, 28)}
            unit="Min."
          />
          <BarChart
            title="Online-Minuten pro Woche"
            data={weekly(d.activity)}
            unit="Min."
            height={90}
          />
        </section>
        <section class="panel">
          <h2>Notiz</h2>
          <p class="warning small">
            Bitte keine sensiblen Daten eintragen (keine Klarnamen, Gesundheits- oder
            Familiendaten). Höchstens 200 Zeichen.
          </p>
          <textarea
            class="note-area"
            maxLength={200}
            value={note ?? d.note}
            onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)}
            aria-label="Notiz"
          />
          <button
            class="btn btn-small"
            onClick={async () => {
              await put(`/api/teacher/students/${s.id}/note`, { text: note ?? d.note }).catch(
                showError,
              );
              notify('Notiz gespeichert.', 'success');
            }}
          >
            Speichern
          </button>
          <p class="note">
            Bytes: {d.balance.balance} (insgesamt verdient {d.balance.totalEarned}) · Gegenstände:{' '}
            {d.items} · Erfolge:{' '}
            {d.achievements.map((a) => ACHIEVEMENT_BY_ID.get(a)?.name ?? a).join(', ') || '–'}
          </p>
        </section>
      </div>

      <section class="panel">
        <h2>Level</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Status</th>
                <th>Beste Sterne</th>
                <th>Durchgänge</th>
                <th>Zeit</th>
              </tr>
            </thead>
            <tbody>
              {d.levels.map((l) => (
                <tr key={l.levelId}>
                  <td>{l.title}</td>
                  <td>
                    {{ completed: 'abgeschlossen', started: 'begonnen', not_started: '–' }[
                      l.status
                    ] ?? l.status}
                  </td>
                  <td>{'★'.repeat(l.bestStars) + '☆'.repeat(3 - l.bestStars)}</td>
                  <td>{l.runs}</td>
                  <td>{fmtMs(l.totalTimeMs || null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>Aufgaben</h2>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Aufgabe</th>
                <th>Level</th>
                <th>Versuche</th>
                <th>Fehler</th>
                <th>Fehlerquote</th>
                <th>Hinweise</th>
                <th>Zeit gesamt</th>
              </tr>
            </thead>
            <tbody>
              {d.tasks.map((t, i) => (
                <tr key={i}>
                  <td>{t.prompt}</td>
                  <td class="note">{t.levelTitle}</td>
                  <td>{t.attempts}</td>
                  <td>{t.errors}</td>
                  <td>
                    <Meter value={t.attempts ? t.errors / t.attempts : null} label="Fehlerquote" />
                  </td>
                  <td>{t.hints}</td>
                  <td>{fmtMs(t.timeSumMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>Verlauf (letzte {Math.round(d.historyRetentionDays / 7)} Wochen)</h2>
        <p class="note">Ältere Einzelversuche werden automatisch zusammengefasst und gelöscht.</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Zeitpunkt</th>
                <th>Aufgabe</th>
                <th>Versuch</th>
                <th>Ergebnis</th>
                <th>Punkte</th>
                <th>Hinweise</th>
                <th>Dauer</th>
              </tr>
            </thead>
            <tbody>
              {d.history.map((h, i) => (
                <tr key={i}>
                  <td>{fmtDateTime(h.createdAt)}</td>
                  <td>
                    {h.prompt} <span class="note">({h.levelTitle})</span>
                  </td>
                  <td>{h.attemptNo}</td>
                  <td>{h.correct ? '✓ richtig' : '✗ falsch'}</td>
                  <td>
                    {h.points}/{h.maxPoints}
                  </td>
                  <td>{h.hintsUsed}</td>
                  <td>{fmtMs(h.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div class="dash-grid">
        <section class="panel">
          <h2>Funktionen nur für {s.username}</h2>
          <PolicyEditor scopeType="user" scopeId={s.id} />
        </section>
        <section class="panel">
          <h2>Level nur für {s.username}</h2>
          <LevelOverrideEditor scopeType="user" scopeId={s.id} levels={levels} />
        </section>
      </div>

      {passwords && (
        <PrintList
          title="Neues Startpasswort"
          accounts={passwords}
          onClose={() => setPasswords(null)}
        />
      )}
      {confirmDelete && (
        <Dialog title="Konto löschen" onClose={() => setConfirmDelete(false)}>
          <p class="warning">
            Das Konto „{s.username}“ und alle zugehörigen Daten werden endgültig gelöscht.
          </p>
          <button
            class="btn danger"
            onClick={async () => {
              try {
                await del(`/api/teacher/students/${s.id}`);
                notify('Konto gelöscht.', 'success');
                go('/klassen');
              } catch (e) {
                showError(e);
              }
            }}
          >
            Endgültig löschen
          </button>
        </Dialog>
      )}
    </>
  );
}
