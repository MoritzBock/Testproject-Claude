# Neues Level und neuen Aufgabentyp anlegen

Lerninhalte sind **Daten** (JSON-Dateien) und liegen ausschließlich auf dem Server.
Die Lösungen verlassen den Server nie: Der Client bekommt nur Aufgabentext und Antwortmöglichkeiten.
Ausgewertet wird serverseitig.

```
server/content/
├─ world.json          # Zonen der Hub-Welt und ihre Voraussetzungen
└─ levels/
   ├─ demo-a.json      # ein Level = eine Datei
   └─ …
```

Nach einer Änderung den Server neu starten (`npm run dev` lädt automatisch neu, in Docker
`docker compose restart app`). Beim Start werden alle Dateien geprüft. Fehler werden mit Dateiname und Stelle
gemeldet, und der Server startet erst, wenn alles stimmt.

Zum Prüfen ohne Start: `npm test` (der Test `content/loader.test.ts` lädt alle Level).

---

## 1. Ein neues Level

Datei `server/content/levels/netz-1.json` anlegen:

```json
{
  "id": "netz-1",
  "title": "Netzwerke 1: Topologien",
  "subject": "LF 3 · Netzwerke",
  "description": "Stern, Ring, Bus – welche Topologie passt wann?",
  "icon": "terminal",
  "portal": { "x": 52, "y": 47 },
  "requires": { "level": "demo-a" },
  "stars": [0.5, 0.75, 0.95],
  "rewards": { "currencyPerStar": 15, "completionBonus": 20 },
  "tasks": [
    {
      "id": "stern",
      "type": "choice",
      "prompt": "Welche Topologie hat einen zentralen Verteiler?",
      "options": [{ "text": "Stern", "correct": true }, { "text": "Ring" }, { "text": "Bus" }],
      "hints": ["Denk an einen Switch in der Mitte."],
      "explanation": "In der Sterntopologie hängen alle Geräte an einem zentralen Switch."
    }
  ]
}
```

| Feld                              | Pflicht      | Bedeutung                                                                                                                         |
| --------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`                              | ja           | eindeutig, nur `a-z`, `0-9`, `-`                                                                                                  |
| `title`, `subject`, `description` | ja/nein/nein | Anzeige im Portal und in der Info-Box                                                                                             |
| `icon`                            | nein         | Portal-Aussehen: `terminal`, `rack`, `cave`, `frame`                                                                              |
| `portal`                          | nein         | Position (Kachel-Koordinaten). Alternativ ein `portal`-Objekt mit `levelId` in der Karte platzieren (siehe `KARTE_BEARBEITEN.md`) |
| `requires`                        | nein         | Voraussetzungen (siehe unten). Ohne Angabe ist das Level sofort verfügbar                                                         |
| `stars`                           | nein         | Anteil der Punkte für 1/2/3 Sterne (Standard `[0.5, 0.75, 0.95]`). Ab 1 Stern gilt das Level als abgeschlossen                    |
| `rewards`                         | nein         | Bytes pro **neu erreichtem** Stern und einmaliger Abschlussbonus                                                                  |
| `tasks`                           | ja           | Liste der Aufgaben (1–30)                                                                                                         |

Kachel-Koordinaten für `portal` finden Sie in Tiled unten links (Kachel x/y) oder mit `npm run map:preview`.
Das Portal steht mittig auf den Kacheln `x`/`x+1`, mit der Unterkante auf Zeile `y`.

### Voraussetzungen (`requires`)

```json
{ "level": "demo-a" }                              // Level abgeschlossen
{ "level": "demo-a", "minStars": 2 }               // … mit mind. 2 Sternen
{ "level": "demo-a", "status": "started" }         // nur begonnen
{ "starsTotal": 10 }                               // insgesamt 10 Sterne
{ "zone": "datenstrand" }                          // Zone ist offen
{ "teacherUnlock": true }                          // nur nach Freigabe durch die Lehrkraft
{ "all": [ … ] }  /  { "any": [ … ] }              // UND / ODER
```

Lehrkräfte können jedes Level zusätzlich pro Person, Gruppe oder Klasse freigeben oder sperren
(Dashboard oder Konsole `unlock|lock`). Kreisläufe wie „A braucht B, B braucht A“ erkennt der Server beim Start.

### Belohnungs-Items

Items vergeben Sie in der Item-Datenbank `shared/src/items.ts` über eine Quelle, zum Beispiel
`lvl('netz-1', 3)` (Item für 3 Sterne in `netz-1`). Jede Belohnung wird nur einmal ausgezahlt, auch wenn das
Level wiederholt wird.

---

## 2. Die vier Aufgabentypen

Gemeinsame Felder aller Aufgaben:

| Feld          | Standard | Bedeutung                                                                         |
| ------------- | -------- | --------------------------------------------------------------------------------- |
| `id`          | –        | eindeutig innerhalb des Levels                                                    |
| `prompt`      | –        | Aufgabenstellung                                                                  |
| `hints`       | `[]`     | bis zu 5 Hinweise. Jeder genutzte Hinweis kostet 20 % der Punkte (höchstens 60 %) |
| `points`      | `10`     | Höchstpunktzahl                                                                   |
| `maxAttempts` | `3`      | Versuche. Der 2. Versuch bringt 60 %, der 3. noch 30 % der Punkte                 |
| `feedback`    | –        | `{ "correct": "…", "wrong": "…" }`                                                |
| `explanation` | –        | Erklärung, sobald die Aufgabe erledigt ist                                        |

**Multiple Choice** (`"type": "choice"`). Sind mehrere Optionen `correct`, wird automatisch Mehrfachauswahl
angezeigt. Die Optionen werden gemischt (`"shuffle": false` schaltet das ab).

```json
{
  "id": "q1",
  "type": "choice",
  "prompt": "…",
  "options": [{ "text": "A", "correct": true }, { "text": "B" }]
}
```

**Lückentext** (`"type": "cloze"`). Lücken werden als `{{name}}` geschrieben. Mit `options` wird aus der Lücke eine
Auswahlliste. Groß-/Kleinschreibung und Leerzeichen werden ignoriert (außer bei `"caseSensitive": true`).

```json
{
  "id": "q2",
  "type": "cloze",
  "prompt": "Ergänze.",
  "text": "HTTPS nutzt Port {{p}}.",
  "gaps": { "p": { "accepted": ["443"] } }
}
```

**Zuordnen per Drag & Drop** (`"type": "match"`). Die rechten Karten werden gemischt. Es gibt Teilpunkte für
jede richtige Zuordnung.

```json
{
  "id": "q3",
  "type": "match",
  "prompt": "…",
  "pairs": [
    { "left": "22", "right": "SSH" },
    { "left": "80", "right": "HTTP" }
  ]
}
```

**Reihenfolge** (`"type": "order"`). `items` steht in der **richtigen** Reihenfolge und wird für die Anzeige
gemischt.

```json
{ "id": "q4", "type": "order", "prompt": "…", "items": ["Eingabe", "Verarbeitung", "Ausgabe"] }
```

Jede Aufgabe liefert dasselbe Ergebnisobjekt: richtig/falsch, Punkte, Versuch, benötigte Zeit (serverseitig
gemessen) und genutzte Hinweise. Daraus berechnet der Server die Sterne.

---

## 3. Einen neuen Aufgabentyp hinzufügen

Ein Aufgabentyp besteht aus zwei Plugins: dem **Auswerter** auf dem Server (kennt die Lösung) und der
**Darstellung** im Client (kennt sie nicht). Beispiel: ein Typ `number` („Gib eine Zahl ein, Toleranz erlaubt“).

### a) Server: `server/src/tasks/number.ts`

```ts
import { z } from 'zod';
import { TaskBaseSchema, registerTaskType } from './registry.js';

const Schema = TaskBaseSchema.extend({
  type: z.literal('number'),
  solution: z.number(),
  tolerance: z.number().min(0).default(0),
  unit: z.string().max(20).optional(),
});
type NumberTask = z.infer<typeof Schema>;

registerTaskType<NumberTask, null, { value: number }>({
  type: 'number',
  label: 'Zahl eingeben',
  schema: Schema as unknown as z.ZodType<NumberTask>,
  answerSchema: z.object({ value: z.number() }),
  // Nur was der Client sehen darf – NIE die Lösung
  toPublic: (task) => ({ view: { unit: task.unit ?? null }, secret: null }),
  evaluate: (task, answer) => {
    const ok = Math.abs(answer.value - task.solution) <= task.tolerance;
    return { score: ok ? 1 : 0, wrongKey: ok ? undefined : `v=${answer.value}` };
  },
});
```

Danach in `server/src/tasks/index.ts` die Zeile `import './number.js';` ergänzen.

`toPublic` darf zusätzlich ein `secret` zurückgeben (z. B. die Zuordnung gemischter IDs). Es bleibt im
Durchgang auf dem Server und wird an `evaluate` übergeben. `wrongKey` ist ein kurzer, nicht personenbezogener
Schlüssel für die Statistik „häufigste Fehler“.

### b) Client: `client/src/tasks/NumberTask.tsx`

```tsx
import { useState } from 'preact/hooks';
import { registerTaskRenderer, type TaskRendererProps } from './registry';

function NumberTask({ task, disabled, onChange }: TaskRendererProps<{ unit: string | null }>) {
  const [v, setV] = useState('');
  return (
    <label class="form-field">
      Deine Antwort {task.view.unit && `(${task.view.unit})`}
      <input
        inputMode="decimal"
        disabled={disabled}
        value={v}
        onInput={(e) => {
          const raw = (e.target as HTMLInputElement).value;
          setV(raw);
          const n = Number(raw.replace(',', '.'));
          onChange({ value: n }, raw.trim() !== '' && Number.isFinite(n));
        }}
      />
    </label>
  );
}
registerTaskRenderer('number', NumberTask);
```

Danach in `client/src/tasks/index.ts` `import './NumberTask';` ergänzen.

### c) Testen

Legen Sie in `server/src/tasks/tasks.test.ts` einen Test an. Vorlage sind die vorhandenen Tests: Prüfen Sie
mindestens, dass `toPublic` keine Lösung enthält und dass `evaluate` richtige und falsche Antworten korrekt
bewertet. Dann `npm test`.
