import { useMemo, useState } from 'preact/hooks';
import {
  LEADERBOARD_CRITERIA,
  LEADERBOARD_LABELS,
  POLICIES,
  type LevelMeta,
  type PolicyKey,
} from '@pixel/shared';
import { del, get, patch, post, put } from '../../api/http';
import { notify } from '../../core/app-state';
import { Dialog, Meter, TriState, fmtDate, fmtMinutes, fmtMs, showError, useLoad } from '../ui';
import type { ClassInfo } from './Classes';

export interface StudentRow {
  id: string;
  username: string;
  status: string;
  online: boolean;
  lastActiveAt: number;
  levelsCompleted: number;
  stars: number;
  totalMinutes: number;
  attempts: number;
  successRate: number | null;
  groupIds: string[];
  note: string | null;
  deletionDueAt: number;
  deletionRequestedFor: number | null;
}
interface Overview {
  class: ClassInfo;
  students: StudentRow[];
  retentionDays: number;
  warnDays: number;
}
export interface Group {
  id: string;
  name: string;
  memberIds: string[];
}
type LevelInfo = LevelMeta & { tasks: Array<{ id: string; type: string; prompt: string }> };

const TABS: Array<[string, string]> = [
  ['lernende', 'Lernende'],
  ['anlegen', 'Konten anlegen'],
  ['gruppen', 'Gruppen'],
  ['auswertung', 'Auswertung'],
  ['einstellungen', 'Einstellungen & Export'],
];

export function ClassView({ classId, tab }: { classId: string; tab: string }) {
  const [ov, reload, error] = useLoad(
    () => get<Overview>(`/api/teacher/classes/${classId}/overview`),
    [classId],
  );
  const [groups, reloadGroups] = useLoad(() => get<Group[]>('/api/teacher/groups'));
  const [levels] = useLoad(() => get<LevelInfo[]>('/api/teacher/levels'));
  if (error) return <p class="warning">{error}</p>;
  if (!ov || !groups || !levels) return <p>Lade …</p>;
  return (
    <>
      <p>
        <a href="#/klassen">← Klassen</a>
      </p>
      <h1>
        {ov.class.name} <span class="note">· Klassencode {ov.class.joinCode}</span>
      </h1>
      <nav class="tabs" aria-label="Bereiche der Klasse">
        {TABS.map(([id, label]) => (
          <a
            key={id}
            href={`#/klasse/${classId}/${id}`}
            class={`tab ${tab === id ? 'tab-active' : ''}`}
          >
            {label}
          </a>
        ))}
      </nav>
      {tab === 'lernende' && (
        <StudentsTab
          ov={ov}
          groups={groups}
          levels={levels}
          reload={() => (reload(), reloadGroups())}
        />
      )}
      {tab === 'anlegen' && <CreateAccountsTab ov={ov} onDone={reload} />}
      {tab === 'gruppen' && (
        <GroupsTab students={ov.students} groups={groups} reload={reloadGroups} />
      )}
      {tab === 'auswertung' && <AnalysisTab classId={classId} />}
      {tab === 'einstellungen' && <ClassSettingsTab ov={ov} levels={levels} />}
    </>
  );
}

// --- students table ------------------------------------------------------------------------
type SortKey =
  | 'username'
  | 'status'
  | 'lastActiveAt'
  | 'levelsCompleted'
  | 'stars'
  | 'totalMinutes'
  | 'successRate';
const COLUMNS: Array<[SortKey, string]> = [
  ['username', 'Benutzername'],
  ['status', 'Status'],
  ['lastActiveAt', 'Letzte Aktivität'],
  ['levelsCompleted', 'Level'],
  ['stars', 'Sterne'],
  ['totalMinutes', 'Nutzung'],
  ['successRate', 'Erfolgsquote'],
];

function StudentsTab({
  ov,
  groups,
  levels,
  reload,
}: {
  ov: Overview;
  groups: Group[];
  levels: LevelInfo[];
  reload: () => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'username', dir: 1 });
  const [q, setQ] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [status, setStatus] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<string | null>(null);
  const now = Date.now();

  const rows = useMemo(() => {
    const r = ov.students.filter(
      (s) =>
        s.username.toLowerCase().includes(q.toLowerCase()) &&
        (!groupFilter || s.groupIds.includes(groupFilter)) &&
        (!status || s.status === status) &&
        (!onlineOnly || s.online),
    );
    return r.sort((a, b) => {
      const va = a[sort.key] ?? -1;
      const vb = b[sort.key] ?? -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [ov, q, groupFilter, status, onlineOnly, sort]);

  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const selected = ov.students.filter((s) => sel.has(s.id));
  const warnBefore = ov.warnDays * 86_400_000;

  return (
    <>
      <div class="filters" role="search">
        <input
          type="search"
          placeholder="Suchen …"
          aria-label="Nach Benutzername suchen"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
        <select
          aria-label="Gruppe"
          value={groupFilter}
          onChange={(e) => setGroupFilter((e.target as HTMLSelectElement).value)}
        >
          <option value="">Alle Gruppen</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus((e.target as HTMLSelectElement).value)}
        >
          <option value="">Alle Status</option>
          <option value="active">aktiv</option>
          <option value="locked">gesperrt</option>
          <option value="archived">archiviert</option>
        </select>
        <label class="check-line">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly((e.target as HTMLInputElement).checked)}
          />{' '}
          nur online
        </label>
        <button class="btn btn-small" onClick={reload}>
          Aktualisieren
        </button>
      </div>

      {sel.size > 0 && (
        <div class="bulk-bar" role="toolbar" aria-label="Aktionen für Auswahl">
          <strong>{sel.size} ausgewählt</strong>
          <button class="btn btn-small" onClick={() => setAction('policy')}>
            Funktionen schalten
          </button>
          <button class="btn btn-small" onClick={() => setAction('level')}>
            Level freigeben/sperren
          </button>
          <button class="btn btn-small" onClick={() => setAction('group')}>
            Zu Gruppe
          </button>
          <button class="btn btn-small" onClick={() => setAction('status')}>
            Sperren/Archivieren
          </button>
          <button class="btn btn-small" onClick={() => setAction('reset')}>
            Passwort zurücksetzen
          </button>
          <button class="btn btn-small danger" onClick={() => setAction('delete')}>
            Löschen
          </button>
          <button class="btn btn-ghost btn-small" onClick={() => setSel(new Set())}>
            Auswahl aufheben
          </button>
        </div>
      )}

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Alle auswählen"
                  checked={allSelected}
                  onChange={() => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </th>
              {COLUMNS.map(([k, l]) => (
                <th
                  key={k}
                  aria-sort={
                    sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'
                  }
                >
                  <button
                    class="sort-btn"
                    onClick={() =>
                      setSort({ key: k, dir: sort.key === k ? (sort.dir === 1 ? -1 : 1) : 1 })
                    }
                  >
                    {l} {sort.key === k ? (sort.dir === 1 ? '▲' : '▼') : ''}
                  </button>
                </th>
              ))}
              <th>Gruppen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} class={sel.has(s.id) ? 'row-selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${s.username} auswählen`}
                    checked={sel.has(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                </td>
                <td>
                  <span
                    class={`online-dot ${s.online ? 'is-online' : ''}`}
                    title={s.online ? 'online' : 'offline'}
                    aria-label={s.online ? 'online' : 'offline'}
                  />{' '}
                  <a href={`#/person/${s.id}`}>{s.username}</a>
                  {s.note && (
                    <span class="note-mark" title={s.note}>
                      {' '}
                      ✎
                    </span>
                  )}
                </td>
                <td>
                  {statusLabel(s.status)}
                  {s.deletionRequestedFor && <span class="badge warn">Löschung beantragt</span>}
                  {!s.deletionRequestedFor && s.deletionDueAt - now < warnBefore && (
                    <span
                      class="badge warn"
                      title={`Automatische Löschung am ${fmtDate(s.deletionDueAt)}`}
                    >
                      Löschung {fmtDate(s.deletionDueAt)}
                    </span>
                  )}
                </td>
                <td>{fmtDate(s.lastActiveAt)}</td>
                <td>
                  {s.levelsCompleted}/{levels.length}
                </td>
                <td>{s.stars} ★</td>
                <td>{fmtMinutes(s.totalMinutes)}</td>
                <td>
                  <Meter value={s.successRate} label="Erfolgsquote" />
                </td>
                <td class="note">
                  {s.groupIds.map((g) => groups.find((x) => x.id === g)?.name).join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p class="note">Keine Einträge.</p>}
      <p class="note">
        Erfolgsquote = Anteil der richtigen Antworten an allen Versuchen. Konten werden{' '}
        {ov.retentionDays} Tage nach der letzten Aktivität automatisch gelöscht; ab {ov.warnDays}{' '}
        Tagen vorher erscheint ein Hinweis.
      </p>

      {action && (
        <BulkDialog
          action={action}
          students={selected}
          groups={groups}
          levels={levels}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            setSel(new Set());
            reload();
          }}
        />
      )}
    </>
  );
}

export const statusLabel = (s: string) =>
  ({ active: 'aktiv', locked: 'gesperrt', archived: 'archiviert' })[s] ?? s;

export const POLICY_UI: Array<[PolicyKey, string]> = [
  ['multiplayer.visible', 'Mitspielende in der Welt sehen'],
  ['multiplayer.emotes', 'Emotes'],
  ['economy.shop', 'Shop'],
  ['economy.lootboxes', 'Lootboxen'],
  ['leaderboard.enabled', 'Ranglisten'],
  ['frozen', 'Eingefroren'],
];

function BulkDialog(props: {
  action: string;
  students: StudentRow[];
  groups: Group[];
  levels: LevelInfo[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { action, students } = props;
  const ids = students.map((s) => s.id);
  const [key, setKey] = useState<PolicyKey>('multiplayer.visible');
  const [value, setValue] = useState<'on' | 'off' | 'std'>('on');
  const [levelId, setLevelId] = useState(props.levels[0]?.id ?? '');
  const [mode, setMode] = useState<'unlock' | 'lock' | 'std'>('unlock');
  const [groupId, setGroupId] = useState(props.groups[0]?.id ?? '');
  const [st, setSt] = useState<'active' | 'locked' | 'archived'>('locked');
  const [passwords, setPasswords] = useState<Array<{
    username: string;
    startPassword: string;
  }> | null>(null);
  const names = students.map((s) => s.username).join(', ');

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      notify(msg, 'success');
      props.onDone();
    } catch (e) {
      showError(e);
    }
  };

  if (passwords)
    return <PrintList title="Neue Startpasswörter" accounts={passwords} onClose={props.onDone} />;

  return (
    <Dialog title="Aktion für Auswahl" onClose={props.onClose}>
      <p class="note">Betrifft: {names}</p>
      {action === 'policy' && (
        <>
          <label class="form-field">
            Funktion
            <select
              value={key}
              onChange={(e) => setKey((e.target as HTMLSelectElement).value as PolicyKey)}
            >
              {POLICY_UI.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label class="form-field">
            Wert
            <select
              value={value}
              onChange={(e) =>
                setValue((e.target as HTMLSelectElement).value as 'on' | 'off' | 'std')
              }
            >
              <option value="on">An</option>
              <option value="off">Aus</option>
              <option value="std">Standard (wie Gruppe/Klasse)</option>
            </select>
          </label>
          <button
            class="btn btn-primary"
            onClick={() =>
              run(
                () =>
                  post('/api/teacher/policies', {
                    targets: ids.map((id) => ({ scopeType: 'user', scopeId: id })),
                    key,
                    value: value === 'std' ? null : value === 'on',
                  }),
                'Einstellung gesetzt.',
              )
            }
          >
            Übernehmen
          </button>
        </>
      )}
      {action === 'level' && (
        <>
          <label class="form-field">
            Level
            <select
              value={levelId}
              onChange={(e) => setLevelId((e.target as HTMLSelectElement).value)}
            >
              {props.levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
          <label class="form-field">
            Aktion
            <select
              value={mode}
              onChange={(e) =>
                setMode((e.target as HTMLSelectElement).value as 'unlock' | 'lock' | 'std')
              }
            >
              <option value="unlock">Freigeben</option>
              <option value="lock">Sperren</option>
              <option value="std">Standard (Freischaltungsregeln)</option>
            </select>
          </label>
          <button
            class="btn btn-primary"
            onClick={() =>
              run(
                () =>
                  post('/api/teacher/levels/overrides', {
                    targets: ids.map((id) => ({ scopeType: 'user', scopeId: id })),
                    levelId,
                    mode: mode === 'std' ? null : mode,
                  }),
                'Level-Freigabe gespeichert.',
              )
            }
          >
            Übernehmen
          </button>
        </>
      )}
      {action === 'group' && (
        <>
          {props.groups.length === 0 ? (
            <p>Noch keine Gruppen – legen Sie unter „Gruppen“ eine an.</p>
          ) : (
            <>
              <label class="form-field">
                Gruppe
                <select
                  value={groupId}
                  onChange={(e) => setGroupId((e.target as HTMLSelectElement).value)}
                >
                  {props.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                class="btn btn-primary"
                onClick={() => {
                  const g = props.groups.find((x) => x.id === groupId)!;
                  return run(
                    () =>
                      put(`/api/teacher/groups/${g.id}/members`, {
                        userIds: [...new Set([...g.memberIds, ...ids])],
                      }),
                    'Zur Gruppe hinzugefügt.',
                  );
                }}
              >
                Hinzufügen
              </button>
            </>
          )}
        </>
      )}
      {action === 'status' && (
        <>
          <label class="form-field">
            Neuer Status
            <select
              value={st}
              onChange={(e) =>
                setSt((e.target as HTMLSelectElement).value as 'active' | 'locked' | 'archived')
              }
            >
              <option value="locked">Gesperrt (kein Login)</option>
              <option value="archived">Archiviert (Daten bleiben, Löschfrist läuft weiter)</option>
              <option value="active">Aktiv</option>
            </select>
          </label>
          <button
            class="btn btn-primary"
            onClick={() =>
              run(
                () =>
                  Promise.all(
                    ids.map((id) => patch(`/api/teacher/students/${id}`, { status: st })),
                  ),
                'Status geändert.',
              )
            }
          >
            Übernehmen
          </button>
        </>
      )}
      {action === 'reset' && (
        <>
          <p>
            Für die ausgewählten Konten werden neue Startpasswörter erzeugt. Beim nächsten Login
            muss ein eigenes Passwort gewählt werden.
          </p>
          <button
            class="btn btn-primary"
            onClick={async () => {
              try {
                const res = [];
                for (const id of ids)
                  res.push(
                    await post<{ username: string; startPassword: string }>(
                      `/api/teacher/students/${id}/reset-password`,
                    ),
                  );
                setPasswords(res);
              } catch (e) {
                showError(e);
              }
            }}
          >
            Passwörter zurücksetzen
          </button>
        </>
      )}
      {action === 'delete' && (
        <>
          <p class="warning">{students.length} Konto/Konten mit allen Daten endgültig löschen?</p>
          <button
            class="btn danger"
            onClick={() =>
              run(
                () => Promise.all(ids.map((id) => del(`/api/teacher/students/${id}`))),
                'Konten gelöscht.',
              )
            }
          >
            Endgültig löschen
          </button>
        </>
      )}
    </Dialog>
  );
}

// --- printable access list -------------------------------------------------------------------
export function PrintList(props: {
  title: string;
  accounts: Array<{ username: string; startPassword: string }>;
  joinCode?: string;
  className?: string;
  onClose: () => void;
}) {
  return (
    <Dialog title={props.title} onClose={props.onClose} wide>
      <p class="warning">
        Die Startpasswörter werden nur jetzt angezeigt und nicht gespeichert. Drucken Sie die Liste
        aus, tragen Sie die Namen handschriftlich ein und bewahren Sie sie sicher auf (nicht digital
        mit Klarnamen speichern).
      </p>
      <div class="print-area">
        <h2>
          Zugangsliste {props.className ?? ''}{' '}
          {props.joinCode && <>– Klassencode {props.joinCode}</>}
        </h2>
        <p>Adresse: {location.origin}</p>
        <table class="data-table print-table">
          <thead>
            <tr>
              <th>Name (handschriftlich)</th>
              <th>Benutzername</th>
              <th>Startpasswort</th>
              {props.joinCode && <th>Klassencode</th>}
            </tr>
          </thead>
          <tbody>
            {props.accounts.map((a) => (
              <tr key={a.username}>
                <td class="write-in" />
                <td>{a.username}</td>
                <td>
                  <code>{a.startPassword}</code>
                </td>
                {props.joinCode && <td>{props.joinCode}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p class="note">Beim ersten Login muss das Startpasswort geändert werden.</p>
      </div>
      <div class="menu-row">
        <button class="btn btn-primary" onClick={() => window.print()}>
          Drucken
        </button>
        <button class="btn" onClick={props.onClose}>
          Fertig
        </button>
      </div>
    </Dialog>
  );
}

function CreateAccountsTab({ ov, onDone }: { ov: Overview; onDone: () => void }) {
  const [count, setCount] = useState(25);
  const [mode, setMode] = useState<'prefix' | 'random'>('random');
  const [prefix, setPrefix] = useState('schueler');
  const [result, setResult] = useState<{
    accounts: Array<{ username: string; startPassword: string }>;
    joinCode: string;
    className: string;
  } | null>(null);
  return (
    <section class="panel">
      <h2>Konten anlegen</h2>
      <p>
        Es werden <strong>keine Klarnamen</strong> gespeichert. Die Lernenden erhalten ein
        Pseudonym; die Zuordnung zur Person führen Sie auf der ausgedruckten Liste.
      </p>
      <form
        class="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setResult(
              await post(`/api/teacher/classes/${ov.class.id}/students`, {
                count,
                mode,
                prefix: mode === 'prefix' ? prefix : undefined,
              }),
            );
            onDone();
          } catch (err) {
            showError(err);
          }
        }}
      >
        <label class="form-field">
          Anzahl
          <input
            type="number"
            min={1}
            max={60}
            value={count}
            onInput={(e) => setCount(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label class="form-field">
          Benutzernamen
          <select
            value={mode}
            onChange={(e) => setMode((e.target as HTMLSelectElement).value as 'prefix' | 'random')}
          >
            <option value="random">Zufällige Pseudonyme (z. B. „SchlauerFuchs42“)</option>
            <option value="prefix">Präfix + Nummer (z. B. „fiae01“)</option>
          </select>
        </label>
        {mode === 'prefix' && (
          <label class="form-field">
            Präfix
            <input
              pattern="[A-Za-z0-9._-]{1,16}"
              value={prefix}
              onInput={(e) => setPrefix((e.target as HTMLInputElement).value)}
            />
          </label>
        )}
        <button class="btn btn-primary">Anlegen</button>
      </form>
      {result && (
        <PrintList
          title="Zugangsliste"
          accounts={result.accounts}
          joinCode={result.joinCode}
          className={result.className}
          onClose={() => setResult(null)}
        />
      )}
    </section>
  );
}

// --- groups -------------------------------------------------------------------------------------
function GroupsTab({
  students,
  groups,
  reload,
}: {
  students: StudentRow[];
  groups: Group[];
  reload: () => void;
}) {
  const [name, setName] = useState('');
  const [edit, setEdit] = useState<Group | null>(null);
  return (
    <>
      <section class="panel">
        <h2>Gruppen</h2>
        <p class="note">
          Gruppen dienen zum gemeinsamen Schalten von Funktionen und Level-Freigaben, auch
          klassenübergreifend.
        </p>
        <ul class="group-list">
          {groups.map((g) => (
            <li key={g.id}>
              <strong>{g.name}</strong> <span class="note">({g.memberIds.length} Mitglieder)</span>
              <button class="btn btn-small" onClick={() => setEdit(g)}>
                Mitglieder
              </button>
              <button
                class="btn btn-small danger"
                onClick={async () => {
                  if (!confirm(`Gruppe „${g.name}“ löschen?`)) return;
                  await del(`/api/teacher/groups/${g.id}`).catch(showError);
                  reload();
                }}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
        <form
          class="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            await post('/api/teacher/groups', { name }).catch(showError);
            setName('');
            reload();
          }}
        >
          <label class="form-field">
            Neue Gruppe
            <input
              required
              maxLength={40}
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </label>
          <button class="btn btn-primary">Anlegen</button>
        </form>
      </section>
      {edit && (
        <GroupMembersDialog
          group={edit}
          students={students}
          onClose={() => setEdit(null)}
          onDone={() => (setEdit(null), reload())}
        />
      )}
      {groups.length > 0 && <GroupSettings groups={groups} />}
    </>
  );
}

function GroupMembersDialog(props: {
  group: Group;
  students: StudentRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [ids, setIds] = useState(new Set(props.group.memberIds));
  const classIds = new Set(props.students.map((s) => s.id));
  return (
    <Dialog title={`Mitglieder von „${props.group.name}“`} onClose={props.onClose}>
      <div class="checklist">
        {props.students.map((s) => (
          <label key={s.id} class="check-line">
            <input
              type="checkbox"
              checked={ids.has(s.id)}
              onChange={() => {
                const n = new Set(ids);
                if (n.has(s.id)) n.delete(s.id);
                else n.add(s.id);
                setIds(n);
              }}
            />
            {s.username}
          </label>
        ))}
      </div>
      <p class="note">
        {[...ids].filter((i) => !classIds.has(i)).length} Mitglieder aus anderen Klassen bleiben
        erhalten.
      </p>
      <button
        class="btn btn-primary"
        onClick={async () => {
          try {
            await put(`/api/teacher/groups/${props.group.id}/members`, { userIds: [...ids] });
            props.onDone();
          } catch (e) {
            showError(e);
          }
        }}
      >
        Speichern
      </button>
    </Dialog>
  );
}

function GroupSettings({ groups }: { groups: Group[] }) {
  const [gid, setGid] = useState(groups[0]!.id);
  return (
    <section class="panel">
      <h2>Funktionen pro Gruppe</h2>
      <select
        aria-label="Gruppe"
        value={gid}
        onChange={(e) => setGid((e.target as HTMLSelectElement).value)}
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <PolicyEditor scopeType="group" scopeId={gid} />
    </section>
  );
}

// --- policies & level overrides ----------------------------------------------------------------
export function PolicyEditor({
  scopeType,
  scopeId,
}: {
  scopeType: 'class' | 'group' | 'user' | 'global';
  scopeId: string;
}) {
  const [values, reload] = useLoad(
    () =>
      get<Partial<Record<PolicyKey, unknown>>>(
        `/api/teacher/policies?scopeType=${scopeType}&scopeId=${scopeId}`,
      ),
    [scopeType, scopeId],
  );
  if (!values) return <p>Lade …</p>;
  const set = async (key: PolicyKey, value: unknown) => {
    try {
      await post('/api/teacher/policies', { targets: [{ scopeType, scopeId }], key, value });
      reload();
    } catch (e) {
      showError(e);
    }
  };
  const criteria = (values['leaderboard.criteria'] as string[] | undefined) ?? undefined;
  return (
    <div class="policy-editor">
      {POLICY_UI.map(([k, l]) => (
        <TriState
          key={k}
          label={l}
          value={values[k] as boolean | undefined}
          onChange={(v) => void set(k, v)}
          hint={`Standard: ${POLICIES[k].default ? 'an' : 'aus'}`}
        />
      ))}
      <fieldset>
        <legend>
          Ranglisten-Kriterien{' '}
          {criteria === undefined && <span class="note">(Standard: Sterne)</span>}
        </legend>
        {LEADERBOARD_CRITERIA.map((c) => (
          <label key={c} class="check-line">
            <input
              type="checkbox"
              checked={(criteria ?? ['stars']).includes(c)}
              onChange={(e) => {
                const cur = new Set(criteria ?? ['stars']);
                if ((e.target as HTMLInputElement).checked) cur.add(c);
                else cur.delete(c);
                void set('leaderboard.criteria', cur.size ? [...cur] : null);
              }}
            />
            {LEADERBOARD_LABELS[c]}
            {c === 'playtime' && (
              <small class="note"> – belohnt Vielspielen statt Lernen, bitte abwägen</small>
            )}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

export function LevelOverrideEditor({
  scopeType,
  scopeId,
  levels,
}: {
  scopeType: 'class' | 'group' | 'user';
  scopeId: string;
  levels: LevelInfo[];
}) {
  const [list, reload] = useLoad(
    () =>
      get<Array<{ levelId: string; mode: 'unlock' | 'lock' }>>(
        `/api/teacher/levels/overrides?scopeType=${scopeType}&scopeId=${scopeId}`,
      ),
    [scopeType, scopeId],
  );
  if (!list) return null;
  return (
    <table class="data-table">
      <tbody>
        {levels.map((l) => {
          const cur = list.find((x) => x.levelId === l.id)?.mode;
          return (
            <tr key={l.id}>
              <th scope="row">{l.title}</th>
              <td>
                <TriState
                  label=""
                  value={cur === undefined ? undefined : cur === 'unlock'}
                  onChange={async (v) => {
                    try {
                      await post('/api/teacher/levels/overrides', {
                        targets: [{ scopeType, scopeId }],
                        levelId: l.id,
                        mode: v === null ? null : v ? 'unlock' : 'lock',
                      });
                      reload();
                    } catch (e) {
                      showError(e);
                    }
                  }}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ClassSettingsTab({ ov, levels }: { ov: Overview; levels: LevelInfo[] }) {
  const [exporting, setExporting] = useState(false);
  const [teacher, setTeacher] = useState('');
  return (
    <div class="dash-grid">
      <section class="panel">
        <h2>Funktionen für die Klasse</h2>
        <p class="note">
          „Standard“ übernimmt die Voreinstellung. Einstellungen für Gruppen oder einzelne Lernende
          haben Vorrang.
        </p>
        <PolicyEditor scopeType="class" scopeId={ov.class.id} />
      </section>
      <section class="panel">
        <h2>Level für die ganze Klasse</h2>
        <p class="note">
          An = freigegeben, Aus = gesperrt, Standard = Freischaltungsregeln des Levels.
        </p>
        <LevelOverrideEditor scopeType="class" scopeId={ov.class.id} levels={levels} />
      </section>
      <section class="panel">
        <h2>Export</h2>
        <p>Lernstand der Klasse als CSV (für Tabellenkalkulation).</p>
        <button class="btn btn-primary" onClick={() => setExporting(true)}>
          CSV exportieren …
        </button>
      </section>
      <section class="panel">
        <h2>Klassencode & Lehrkräfte</h2>
        <p>
          Klassencode: <code class="join-code">{ov.class.joinCode}</code>
        </p>
        <button
          class="btn btn-small"
          onClick={async () => {
            if (!confirm('Neuen Klassencode erzeugen? Der alte gilt dann nicht mehr.')) return;
            const r = await post<{ joinCode: string }>(
              `/api/teacher/classes/${ov.class.id}/join-code`,
            ).catch(showError);
            if (r) notify(`Neuer Code: ${r.joinCode}`, 'success');
          }}
        >
          Neuen Code erzeugen
        </button>
        <form
          class="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await post(`/api/teacher/classes/${ov.class.id}/teachers`, { username: teacher });
              notify('Lehrkraft hinzugefügt.', 'success');
              setTeacher('');
            } catch (err) {
              showError(err);
            }
          }}
        >
          <label class="form-field">
            Weitere Lehrkraft (Benutzername)
            <input
              value={teacher}
              onInput={(e) => setTeacher((e.target as HTMLInputElement).value)}
            />
          </label>
          <button class="btn">Hinzufügen</button>
        </form>
        <p class="note">Lehrkräfte: {ov.class.teachers?.join(', ')}</p>
      </section>
      {exporting && (
        <Dialog title="Datenschutzhinweis zum Export" onClose={() => setExporting(false)}>
          <ul>
            <li>Die Datei enthält pseudonymisierte Lernstandsdaten Ihrer Klasse.</li>
            <li>
              Nur auf dienstlichen, geschützten Geräten speichern; nicht per privater E-Mail oder
              Cloud weitergeben.
            </li>
            <li>Keine Klarnamen ergänzen. Datei löschen, sobald sie nicht mehr benötigt wird.</li>
            <li>Nur zur Lernbegleitung verwenden, nicht zur Notengebung.</li>
            <li>Der Export wird protokolliert.</li>
          </ul>
          <a
            class="btn btn-primary"
            href={`/api/teacher/classes/${ov.class.id}/export.csv`}
            download
            onClick={() => setExporting(false)}
          >
            Verstanden – herunterladen
          </a>
        </Dialog>
      )}
    </div>
  );
}

// --- analysis -----------------------------------------------------------------------------------
interface Analysis {
  levels: Array<{
    levelId: string;
    title: string;
    started: number;
    completed: number;
    avgStars: number | null;
    avgTimeMs: number | null;
    tasks: Array<{
      taskId: string;
      type: string;
      prompt: string;
      attempts: number;
      errors: number;
      errorRate: number | null;
      avgTimeMs: number | null;
      hints: number;
      topWrong: Array<{ label: string; count: number }>;
    }>;
  }>;
  problemTasks: Array<{
    levelTitle: string;
    prompt: string;
    errorRate: number | null;
    attempts: number;
    topWrong: Array<{ label: string; count: number }>;
  }>;
}

function AnalysisTab({ classId }: { classId: string }) {
  const [a] = useLoad(() => get<Analysis>(`/api/teacher/classes/${classId}/analysis`), [classId]);
  if (!a) return <p>Lade …</p>;
  return (
    <>
      <section class="panel">
        <h2>Problemaufgaben</h2>
        {a.problemTasks.length === 0 ? (
          <p class="note">
            Keine Aufgabe mit mindestens 50 % Fehlversuchen (bei mind. 3 Versuchen).
          </p>
        ) : (
          <ul class="problem-list">
            {a.problemTasks.map((t, i) => (
              <li key={i}>
                <strong>{t.prompt}</strong> <span class="note">({t.levelTitle})</span>
                <div>
                  Fehlerquote <Meter value={t.errorRate} label="Fehlerquote" /> bei {t.attempts}{' '}
                  Versuchen
                </div>
                {t.topWrong.length > 0 && (
                  <div class="note">
                    Häufigster Fehler: {t.topWrong[0]!.label} ({t.topWrong[0]!.count}×)
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {a.levels.map((l) => (
        <section key={l.levelId} class="panel">
          <h2>{l.title}</h2>
          <p class="note">
            Begonnen: {l.started} · Abgeschlossen: {l.completed} · ⌀ Sterne:{' '}
            {l.avgStars?.toFixed(1).replace('.', ',') ?? '–'} · ⌀ Zeit pro Person:{' '}
            {fmtMs(l.avgTimeMs)}
          </p>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Aufgabe</th>
                  <th>Versuche</th>
                  <th>Fehlerquote</th>
                  <th>⌀ Zeit</th>
                  <th>Hinweise</th>
                  <th>Häufigste Fehler</th>
                </tr>
              </thead>
              <tbody>
                {l.tasks.map((t) => (
                  <tr key={t.taskId}>
                    <td>{t.prompt}</td>
                    <td>{t.attempts}</td>
                    <td>
                      <Meter value={t.errorRate} label="Fehlerquote" />
                    </td>
                    <td>{fmtMs(t.avgTimeMs)}</td>
                    <td>{t.hints}</td>
                    <td class="note">
                      {t.topWrong.map((w) => `${w.label} (${w.count}×)`).join('; ') || '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <p class="note">
        Ältere Einzelversuche werden nach der Löschfrist zusammengefasst; die Statistik bleibt dabei
        erhalten.
      </p>
    </>
  );
}
