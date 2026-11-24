import { get } from '../../api/http';
import { fmtDateTime, useLoad } from '../ui';

interface Entry {
  id: number;
  actorName: string;
  action: string;
  targetName: string | null;
  params: string;
  createdAt: number;
}

const ACTIONS: Record<string, string> = {
  'student.create': 'Konten angelegt',
  'student.resetPassword': 'Passwort zurückgesetzt',
  'student.update': 'Konto geändert',
  'student.delete': 'Konto gelöscht',
  'class.create': 'Klasse angelegt',
  'class.delete': 'Klasse gelöscht',
  'class.archive': 'Klasse archiviert',
  'policy.set': 'Funktion geschaltet',
  'level.unlock': 'Level freigegeben',
  'level.lock': 'Level gesperrt',
  'export.csv': 'CSV-Export',
};

export function AuditView() {
  const [list] = useLoad(() => get<Entry[]>('/api/teacher/audit'));
  return (
    <>
      <h1>Protokoll</h1>
      <p class="note">
        Alle Verwaltungs- und Konsolenaktionen (wer, was, wann, bei wem). Einträge werden nach 12
        Monaten gelöscht.
      </p>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Wer</th>
              <th>Aktion</th>
              <th>Bei wem</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {list?.map((e) => (
              <tr key={e.id}>
                <td>{fmtDateTime(e.createdAt)}</td>
                <td>{e.actorName}</td>
                <td>{ACTIONS[e.action] ?? e.action}</td>
                <td>{e.targetName ?? '–'}</td>
                <td class="note mono">{e.params === '{}' ? '' : e.params}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
