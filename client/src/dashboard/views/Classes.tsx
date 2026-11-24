import { useState } from 'preact/hooks';
import { del, get, patch, post } from '../../api/http';
import { notify } from '../../core/app-state';
import { go } from '../store';
import { Dialog, showError, useLoad } from '../ui';

export interface ClassInfo {
  id: string;
  name: string;
  schoolYear: string;
  joinCode: string;
  archivedAt: number | null;
  studentCount: number;
  teachers: string[];
}

function currentSchoolYear(): string {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

export function ClassesView() {
  const [list, reload] = useLoad(() => get<ClassInfo[]>('/api/teacher/classes'));
  const [name, setName] = useState('');
  const [year, setYear] = useState(currentSchoolYear());
  const [deleting, setDeleting] = useState<ClassInfo | null>(null);

  const create = async (e: Event) => {
    e.preventDefault();
    try {
      await post('/api/teacher/classes', { name, schoolYear: year });
      setName('');
      reload();
      notify('Klasse angelegt.', 'success');
    } catch (err) {
      showError(err);
    }
  };

  return (
    <>
      <h1>Meine Klassen</h1>
      <div class="class-cards">
        {list?.map((c) => (
          <article key={c.id} class={`panel class-card ${c.archivedAt ? 'archived' : ''}`}>
            <h2>
              <a href={`#/klasse/${c.id}/lernende`}>{c.name}</a>
            </h2>
            <p class="note">
              Schuljahr {c.schoolYear} · {c.studentCount} Lernende {c.archivedAt && '· archiviert'}
            </p>
            <p>
              Klassencode: <code class="join-code">{c.joinCode}</code>
            </p>
            {c.teachers.length > 1 && <p class="note">Lehrkräfte: {c.teachers.join(', ')}</p>}
            <div class="menu-row">
              <button
                class="btn btn-primary btn-small"
                onClick={() => go(`/klasse/${c.id}/lernende`)}
              >
                Öffnen
              </button>
              <button
                class="btn btn-small"
                onClick={async () => {
                  await patch(`/api/teacher/classes/${c.id}`, { archived: !c.archivedAt }).catch(
                    showError,
                  );
                  reload();
                }}
              >
                {c.archivedAt ? 'Reaktivieren' : 'Archivieren'}
              </button>
              <button class="btn btn-small danger" onClick={() => setDeleting(c)}>
                Löschen
              </button>
            </div>
          </article>
        ))}
        {list?.length === 0 && <p>Noch keine Klassen. Legen Sie unten die erste an.</p>}
      </div>

      <section class="panel">
        <h2>Neue Klasse</h2>
        <form class="inline-form" onSubmit={create}>
          <label class="form-field">
            Name (z. B. „FIAE 10a“)
            <input
              required
              maxLength={40}
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="form-field">
            Schuljahr
            <input
              required
              pattern="\d{4}/\d{2}"
              value={year}
              onInput={(e) => setYear((e.target as HTMLInputElement).value)}
            />
          </label>
          <button class="btn btn-primary">Anlegen</button>
        </form>
        <p class="note">
          „Archivieren“ deaktiviert alle Konten der Klasse; die automatischen Löschfristen laufen
          weiter. „Löschen“ entfernt die Klasse mit allen Konten und Daten endgültig.
        </p>
      </section>

      {deleting && (
        <DeleteClassDialog c={deleting} onClose={() => setDeleting(null)} onDone={reload} />
      )}
    </>
  );
}

function DeleteClassDialog({
  c,
  onClose,
  onDone,
}: {
  c: ClassInfo;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirmName, setConfirm] = useState('');
  return (
    <Dialog title={`Klasse „${c.name}“ löschen`} onClose={onClose}>
      <p class="warning">
        Alle {c.studentCount} Konten dieser Klasse und sämtliche zugehörigen Daten werden endgültig
        gelöscht. Das kann nicht rückgängig gemacht werden.
      </p>
      <label class="form-field">
        Zur Bestätigung den Klassennamen eingeben
        <input
          value={confirmName}
          onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
        />
      </label>
      <button
        class="btn danger"
        disabled={confirmName !== c.name}
        onClick={async () => {
          try {
            const r = await del<{ deletedAccounts: number }>(`/api/teacher/classes/${c.id}`, {
              confirmName,
            });
            notify(`Klasse gelöscht (${r.deletedAccounts} Konten).`, 'success');
            onClose();
            onDone();
          } catch (e) {
            showError(e);
          }
        }}
      >
        Endgültig löschen
      </button>
    </Dialog>
  );
}
