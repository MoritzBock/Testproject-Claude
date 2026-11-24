# Pixel-Lernwelt – Architektur- und Umsetzungsplan

> Status: **Entwurf zur Freigabe** · Stand: 24.11.2026

---

## 0. Festgelegte Entscheidungen (aus den Rückfragen)

| #   | Thema           | Entscheidung                                                                                                                                                        |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Betrieb         | Oracle Cloud Free Tier (Ampere-ARM-VM, **EU-Region, z. B. Frankfurt**), betrieben von Ihnen. Zusätzlich lokal startbar (ohne Docker und mit Docker).                |
| 2   | Größe           | Pilot mit kleiner, freiwilliger Testgruppe, später 2–3 Klassen. SQLite reicht.                                                                                      |
| 3   | Multiplayer     | Eingebaut, Standard **aus**. Nur die Lehrkraft schaltet um: für einzelne Lernende, mehrere, Gruppen, Klassen oder alle (→ Policy-System, Abschnitt 4).              |
| 4   | Geräte          | Windows-PC, iPad, Smartphone → Touch-Steuerung und responsive Overlays sind **Pflicht** (ab M1).                                                                    |
| 5   | Löschung        | Automatisch **6 Monate nach letzter Aktivität**, mit Warnung im Dashboard. Lernende können ihren Account selbst löschen oder archivieren, Lehrkräfte ganze Klassen. |
| 6   | Rechtsgrundlage | Ziel: Pflichteinsatz (Art. 85 BayEUG). **Pilotphase ist freiwillig → Einwilligung** (siehe Abschnitt 9).                                                            |
| 7   | Thema           | IT-Ausbildungsberufe (FIAE, FISI, FIDP, FIDV, IT-SE, Kaufleute DM/ITSM).                                                                                            |
| 8   | Lootboxen       | Standard aus, per Policy aktivierbar. Pity-System erklärt in Abschnitt 6.                                                                                           |
| 9   | Rollen          | Superadmin: ja. Mehrere Lehrkräfte pro Klasse: ja.                                                                                                                  |
| 10  | 2FA             | TOTP optional, der Superadmin kann es per Konfiguration zur Pflicht machen.                                                                                         |
| 11  | Notiz           | Maximal 200 Zeichen mit Warnhinweis, nicht im Export, wird mit dem Account gelöscht.                                                                                |
| 12  | Ranglisten      | Mehrere Kriterien, Standard aus, die Lehrkraft aktiviert sie per Policy (Schutzmaßnahmen siehe Abschnitt 7).                                                        |
| 13  | Grafik          | 16×16-Tiles, Figuren 16×24, interne Auflösung 480×270, ganzzahlige Skalierung.                                                                                      |
| 14  | Gamepad         | Ja (Gamepad-API).                                                                                                                                                   |

---

## 1. Setting-Vorschlag (eigenständig, IT-Bezug)

**Welt: „Die Bit-Insel“.** Eine gemütliche Pixel-Insel, auf der Technik und Natur verschmelzen.

| Zone                     | Beschreibung                                            | Freischaltung                         |
| ------------------------ | ------------------------------------------------------- | ------------------------------------- |
| **Campus-Platz** (Start) | Dorfplatz mit Werkstatt, Shop und Brunnen               | sofort                                |
| **Platinenwald**         | Bäume mit Leiterbahn-Rinde, Glühwürmchen-LEDs           | sofort                                |
| **Datenstrand**          | Hafen mit „Port“-Stegen (Port 22, 80, 443 als Deko-Gag) | ab 3 Sternen gesamt, Brücke erscheint |
| **Serverberg**           | Rechenzentrum im Fels, Kühlwasserfall                   | Level-Kette A→B→C abgeschlossen       |

- **Portale:** Terminal-Säulen, Rack-Tore, Router-Höhlen und Monitor-Rahmen (eigene Designs).
- **Währung:** „**Bytes**“, Icon ein leuchtender Chip, Anzeige z. B. „128 B“. Name und Icon liegen zentral in der Konfiguration.
- **Shop:** „Byte-Basar“, ein Händler-NPC mit Lötkolben-Schürze.

---

## 2. Architektur

```
 Browser (PC / iPad / Smartphone)
 ┌───────────────────────────────────────────────┐
 │ client/  Vite + TypeScript                     │
 │  ├─ Spiel:   Phaser 3 (Canvas, pixelArt)       │
 │  ├─ Overlays: Preact (HTML/CSS) – Menüs,       │
 │  │           Aufgaben, Garderobe, Shop, Konsole│
 │  └─ Dashboard: eigene Seite (Preact)           │
 └──────────────┬───────────────────┬────────────┘
                │ HTTPS (REST/JSON) │ WSS (Socket.IO)
 ┌──────────────▼───────────────────▼────────────┐
 │ Caddy (TLS, Security-Header, statische Files)  │
 └──────────────┬────────────────────────────────┘
 ┌──────────────▼────────────────────────────────┐
 │ server/  Node 22 + Fastify + TypeScript        │
 │  Module: auth · rbac · classes · policy ·      │
 │  character · inventory · economy · levels ·    │
 │  admin · dashboard · presence · privacy ·      │
 │  retention-jobs · audit                        │
 │  Drizzle ORM → SQLite (Datei im Volume)        │
 └────────────────────────────────────────────────┘
 shared/  zod-Schemas, Typen, Item-DB, Aufgabentyp-Definitionen
```

**Begründete Abweichungen und Präzisierungen gegenüber dem Vorschlag:**

- **Preact (≈4 KB)** für die HTML-Overlays und das Dashboard. Tabellen, Filter, Formulare und Barrierefreiheit lassen sich damit deutlich wartbarer bauen als mit reinem DOM-Code, und es gibt keine Laufzeit-Abhängigkeit nach außen.
- **`@node-rs/argon2`** statt `argon2`: Es bringt fertige Binärdateien für Linux-ARM64 (Oracle Ampere) mit, ein Compiler-Toolchain ist nicht nötig. Der Algorithmus ist Argon2id.
- **Caddy** als Reverse Proxy: automatisches Let's-Encrypt-Zertifikat, HSTS und eine einfache Konfiguration.
- **Schriften:** Es gibt keine Web-Fonts. Im Canvas verwende ich eine **programmatisch erzeugte Bitmap-Pixelschrift**, in den Overlays den System-Font-Stack. Damit sind Lizenzfragen und externe Downloads ausgeschlossen.
- **Lokaler Start:**
  - `npm install && npm run dev` startet Client und Server mit SQLite-Datei und Demo-Seed (Superadmin, Lehrkraft, Demo-Klasse, Demo-Lernende).
  - Über `http://localhost` funktionieren Secure-Cookies in Chrome, Edge und Firefox. Für Safari gibt es im Dev-Modus den Schalter `COOKIE_SECURE=false`, der in Produktion gesperrt ist.
  - Alternativ: `docker compose -f docker-compose.dev.yml up`.

---

## 3. Ordnerstruktur

```
/
├─ package.json                 # npm workspaces
├─ docker-compose.yml           # Produktion (caddy + app)
├─ docker-compose.dev.yml       # lokal
├─ Caddyfile
├─ .env.example
├─ README.md                    # Installation, lokal, Oracle-Setup, Backup, Update, npm audit
├─ ASSETS_LICENSES.md
├─ scripts/
│  ├─ backup.sh                 # SQLite-Online-Backup + age-Verschlüsselung + Rotation
│  ├─ restore.sh
│  └─ generate-assets.ts        # erzeugt Platzhalter-Pixelgrafiken (PNG) + Tiled-Tilesets
├─ shared/src/
│  ├─ schemas/                  # zod: API-Requests/-Responses
│  ├─ content/items.ts          # Item-Datenbank
│  ├─ content/rarities.ts       # Farbe + Symbol + Effekt pro Stufe
│  ├─ tasks/                    # Aufgabentyp-Definitionen (öffentlicher Teil)
│  ├─ unlock/                   # Freischaltungsgraph (reine Logik, getestet)
│  └─ policy/keys.ts            # Liste aller Policy-Schalter
├─ server/src/
│  ├─ app.ts, config.ts
│  ├─ db/schema.ts, db/migrations/, db/seed.ts
│  ├─ modules/<modul>/{routes,service,*.test}.ts
│  ├─ tasks/                    # Aufgabentyp-Evaluatoren (geheimer Teil)
│  ├─ jobs/retention.ts         # Löschfristen, Aggregation
│  └─ content/levels/*.json     # Level inkl. Lösungen – NIE an den Client
├─ client/
│  ├─ index.html, dashboard.html
│  ├─ public/assets/            # austauschbare Assets (generiert oder eigene/CC0)
│  │  ├─ tilesets/ sprites/ ui/ audio/
│  │  └─ maps/hub.json          # Tiled-JSON
│  └─ src/
│     ├─ game/scenes/           # Boot, Title, Hub, Transition, …
│     ├─ game/systems/          # Input (Tastatur/Touch/Gamepad), Paper-Doll, Audio, Kamera
│     ├─ ui/                    # Preact-Overlays
│     ├─ tasks/                 # Aufgabentyp-Renderer (Plugin-Registry)
│     └─ dashboard/
└─ docs/
   ├─ PLAN.md (dieses Dokument)
   ├─ LEVEL_ERSTELLEN.md
   ├─ SECURITY_CHECKLISTE.md
   └─ datenschutz/  (Entwürfe: Datenübersicht, VVT, Art.-13-Infos, Einwilligung, TOM, Betriebs-Checkliste)
```

---

## 4. Policy-System (Schalter mit Geltungsbereich)

Damit die Lehrkraft Funktionen für **einzelne, mehrere, Gruppen, Klassen oder alle** setzen kann, gibt es ein einheitliches Policy-System statt einzelner Spalten.

- **Schalter:**
  - `multiplayer.visible`
  - `multiplayer.emotes`
  - `economy.lootboxes`
  - `economy.shopRotation`
  - `leaderboard.enabled`
  - `leaderboard.criteria`
  - `freeze`, …
- **Geltungsbereiche:** `global` → `class` → `group` → `user`. Der spezifischere Bereich gewinnt.
- Gehört jemand mehreren Gruppen mit widersprüchlichen Werten an, gilt der **restriktivere** Wert (Privacy by Default).
- **Gruppen** sind frei definierbar, auch klassenübergreifend innerhalb der eigenen Klassen (z. B. „FISI-Gruppe A“, „Förderkurs“).
- **Dashboard-UI:** Mehrfachauswahl in der Klassentabelle (mit Filtern nach Klasse, Gruppe und Status), dann „Einstellung setzen für Auswahl“. Zusätzlich gibt es eine Konsolen-Variante, z. B. `set multiplayer on group:FISI-A`.
- **Global** darf nur der Superadmin ändern, eine Lehrkraft maximal „alle meine Klassen“.
- Jede Änderung landet im Audit-Log.

---

## 5. Datenmodell

**Grundsatz:** Auch pseudonyme Daten sind personenbezogen (Art. 4 Nr. 5 DSGVO). Deshalb sind **alle** Felder mit Bezug zu einem Account als personenbezogen markiert (**PB**). Es werden keine Klarnamen, E-Mail-Adressen, Geburtsdaten, Fotos, IP-Adressen oder User-Agents gespeichert.

Kategorien: **Z** = Zugang/Identität · **L** = Lernstand · **S** = Spielstand · **T** = Technisch · **A** = Verwaltung/Audit

| Tabelle                            | Felder (Auszug)                                                                                                                                                                                                                                          | PB                                 | Kat. | Zweck                                           | Löschfrist                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `users`                            | id, role, **username** (Pseudonym), **password_hash** (Argon2id), must_change_pw, **totp_secret** (verschlüsselt), failed_logins, locked_until, status (active/locked/archived/deletion_pending), privacy_ack_version/at, **last_active_at**, created_at | ja                                 | Z    | Anmeldung, Rollen, Löschfrist-Berechnung        | 6 Monate nach `last_active_at` oder auf Antrag                                 |
| `sessions`                         | id (Hash des Tokens), user_id, expires_at, last_seen_at                                                                                                                                                                                                  | ja                                 | T    | Angemeldet bleiben                              | bei Logout oder Ablauf (Lernende 12 h, Lehrkräfte 8 h); stündliche Bereinigung |
| `classes`                          | id, name (z. B. „FIAE 10a“), school_year, join_code_hash, archived_at                                                                                                                                                                                    | nein                               | A    | Klassenverwaltung                               | durch die Lehrkraft                                                            |
| `class_teachers` / `class_members` | class_id, user_id                                                                                                                                                                                                                                        | ja                                 | A    | Zugriffskontrolle                               | mit dem Account                                                                |
| `groups` / `group_members`         | id, owner_teacher_id, name / group_id, user_id                                                                                                                                                                                                           | ja                                 | A    | Policy-Zielgruppen                              | mit dem Account bzw. der Gruppe                                                |
| `policies`                         | scope_type, scope_id, key, value, updated_by, updated_at                                                                                                                                                                                                 | ja (bei scope=user)                | A    | Funktionsschalter                               | mit dem Scope                                                                  |
| `teacher_notes`                    | user_id, **text** (≤ 200 Zeichen), author_id                                                                                                                                                                                                             | ja                                 | A    | Organisatorische Notiz                          | mit dem Account                                                                |
| `user_settings`                    | user_id, settings (JSON: Audio, Tasten, Barrierefreiheit, Ranglisten-Opt-out)                                                                                                                                                                            | ja                                 | S    | Einstellungen pro Account                       | mit dem Account                                                                |
| `characters`                       | user_id, skin_tone, equipped (JSON pro Slot), tints                                                                                                                                                                                                      | ja                                 | S    | Avatar                                          | mit dem Account                                                                |
| `inventory`                        | user_id, item_id, source, acquired_at                                                                                                                                                                                                                    | ja                                 | S    | Sammlung                                        | mit dem Account                                                                |
| `transactions`                     | id, user_id, amount, reason, ref_id, actor_id, created_at                                                                                                                                                                                                | ja                                 | S    | Anti-Cheat, nachvollziehbare Währung            | mit dem Account                                                                |
| `wallets`                          | user_id, balance (Cache, wird gegen `transactions` geprüft)                                                                                                                                                                                              | ja                                 | S    | Schneller Kontostand                            | mit dem Account                                                                |
| `lootbox_pity`                     | user_id, box_type, counter                                                                                                                                                                                                                               | ja                                 | S    | Pity-System                                     | mit dem Account                                                                |
| `level_progress`                   | user_id, level_id, status, best_stars, reward_claimed, first_started_at, completed_at, total_time_s                                                                                                                                                      | ja                                 | L    | Fortschritt, Freischaltung, Lernbegleitung      | mit dem Account                                                                |
| `level_overrides`                  | scope_type, scope_id, level_id, mode (unlock/lock), actor_id                                                                                                                                                                                             | ja (bei user)                      | A    | Freigabe durch die Lehrkraft                    | mit dem Scope                                                                  |
| `task_attempts`                    | user_id, level_id, task_id, attempt_no, correct, points, hints_used, duration_ms, **wrong_answer_key** (nur Options-IDs, bei Lückentext max. 40 Zeichen), created_at                                                                                     | ja                                 | L    | Detailansicht, Problemaufgaben                  | **nach 8 Wochen** aggregiert, dann gelöscht                                    |
| `task_stats_user`                  | user_id, task_id, attempts, errors, hints, time_sum_ms, last_at                                                                                                                                                                                          | ja                                 | L    | Langfristige Detailansicht ohne Einzelverlauf   | mit dem Account                                                                |
| `task_stats_anon`                  | class_id, task_id, attempts, errors, hints, time_sum, wrong_answer_counts                                                                                                                                                                                | **nein** (anonym, Mindestgruppe 5) | L    | Unterrichtsauswertung                           | mit der Klasse                                                                 |
| `activity_daily`                   | user_id, date, minutes                                                                                                                                                                                                                                   | ja                                 | L    | Nutzungsdauer (Heartbeat 60 s, nur Minuten/Tag) | 12 Monate, spätestens mit dem Account                                          |
| `audit_log`                        | actor_id, action, target_user_id, target_class_id, params, created_at                                                                                                                                                                                    | ja                                 | A    | Nachvollziehbarkeit von Admin-Aktionen          | 12 Monate; bei gelöschten Zielaccounts wird `target_user_id` auf NULL gesetzt  |
| `deletion_requests`                | user_id, requested_at, execute_at                                                                                                                                                                                                                        | ja                                 | A    | Selbstlöschung mit 7 Tagen Widerrufsfrist       | nach Ausführung                                                                |

**Nicht persistent** (nur im Arbeitsspeicher):

- Positionen in der Welt
- Online-Status
- Emotes
- Rate-Limit-Zähler (IP nur im RAM, maximal 15 Minuten)
- Durchsagen

**Server-Logs:** Der Fastify-Logger läuft ohne IP, ohne Request-Bodies und ohne Usernamen. Die Docker-Log-Rotation löscht nach 7 Tagen, Caddy-Access-Logs sind abgeschaltet.

**Lebenszyklus eines Lernenden-Accounts:**

- **Archivieren** (selbst oder durch die Lehrkraft): Der Account wird deaktiviert, die Daten bleiben eingefroren und sind für die Lehrkraft sichtbar. Die **6-Monats-Frist läuft weiter**, Archivieren verlängert also nichts. Eine Reaktivierung ist durch die Lehrkraft möglich.
- **Löschen** (selbst): 7 Tage Widerrufsfrist, die Lehrkraft sieht den Hinweis. Danach werden alle PB-Daten gelöscht, anonyme Klassenstatistiken bleiben.
- **Löschen** (durch die Lehrkraft): sofort, nach Bestätigung.
- **Automatisch:** Ab 5 Monaten ohne Aktivität erscheint eine Warnung im Dashboard und beim nächsten Login des Lernenden. Nach 6 Monaten wird gelöscht.
- **Klasse:** „Archivieren“ deaktiviert alle Accounts der Klasse. „Löschen“ löscht Klasse und Accounts mit einem Klick, nach Bestätigung durch Eingabe des Klassennamens.

---

## 6. Kernlogik (wird getestet)

- **Freischaltungsgraph:**
  - Voraussetzungen als Ausdrucksbaum: `{all:[…]}`, `{any:[…]}`, `{level:"A", status:"completed"}`, `{starsTotal:5}`, `{teacherUnlock:true}`.
  - Zyklen werden beim Laden der Level erkannt (Fehler beim Serverstart).
  - Zonen nutzen denselben Mechanismus.
  - Als Antwort kommt der Status plus eine Liste der **fehlenden** Bedingungen für die Info-Box.
- **Währung:**
  - Jede Buchung läuft in einer DB-Transaktion mit Ledger-Eintrag. Der Kontostand kann nie negativ werden.
  - Belohnungen sind idempotent: Ein `reward_claimed`-Flag plus ein eindeutiger `ref_id` verhindern Doppelauszahlung.
- **Lootbox:**
  - Gewichtete Ziehung serverseitig mit `crypto.randomInt`; für Tests ist der Zufallsgenerator injizierbar.
  - Duplikate werden in Bytes umgewandelt (Wert nach Seltenheit).
  - **Pity-System:** Pro Spieler und Boxtyp zählt ein Zähler die Öffnungen ohne mindestens „Selten“. Erreicht er 9, ist die 10. Box garantiert „Selten“ oder besser, danach wird der Zähler zurückgesetzt. So vermeiden wir Pechsträhnen. Die Schwelle ist konfigurierbar und wird zusammen mit den Drop-Chancen offen angezeigt.
- **Rechteprüfung:** zentrale Guards `requireRole()` und `requireClassAccess(userId)` bei jedem Request und jedem Socket-Event. Tests decken ab: Eine Lehrkraft fremder Klassen bekommt 403, Lernende greifen auf fremde Daten mit 403 zu.
- **Löschfristen:** Ein täglicher Job (im Server, ohne externen Cron) übernimmt Aggregation, Warnungen, Löschung, Session-Bereinigung und Audit-Rotation. Die Tests laufen mit einer simulierten Uhr.
- **Aufgaben:**
  - Der Client erhält die Aufgabe **ohne** Lösung.
  - Der Server bewertet sie und liefert `{correct, points, attempts, durationMs, hintsUsed, feedback}`.
  - Hinweise werden einzeln vom Server abgerufen und gezählt.
  - Sterne entstehen aus Punktquote plus Schwellen im Level-JSON.

---

## 7. Ranglisten – Schutzmaßnahmen

Ranglisten machen Lernstandsdaten für Mitschüler/innen sichtbar. Deshalb:

- Standard **aus**. Die Lehrkraft aktiviert sie pro Scope (siehe Abschnitt 4) und wählt die Kriterien:
  - Sterne / abgeschlossene Level
  - verdiente Bytes (nicht der Kontostand)
  - Sammlungsgröße
  - Spielzeit
- Gezeigt werden nur Pseudonym und Avatar, nur innerhalb des Scopes (z. B. der eigenen Klasse) und nur die Top 10 plus der eigene Rang.
- **Opt-out** für Lernende: „In Ranglisten anonym erscheinen“. Die Person erscheint dann als „Anonym“ und sieht ihren eigenen Platz trotzdem.
- **Spielzeit-Rangliste:** Hinweis im Dashboard, dass sie Vielspielen statt Lernen belohnen kann. Bitte mit der/dem DSB und pädagogisch abwägen.
- Der Hinweis „dient der Lernbegleitung, nicht der Notengebung“ steht auch an jeder Rangliste.
- Die Daten werden on-the-fly berechnet, es gibt keine zusätzliche Speicherung.

---

## 8. Sicherheit (Kurzfassung, Details in `SECURITY_CHECKLISTE.md`)

- **Passwörter:** Argon2id (m=19 MiB, t=2, p=1 nach OWASP), Mindestlänge 10, Wechsel beim ersten Login erzwungen, Startpasswörter aus einer verwechslungsfreien Wortliste.
- **Login-Schutz:** Rate-Limit pro IP (im RAM) und pro Account. Nach 5 Fehlversuchen wird der Account 15 Minuten gesperrt.
- **Sessions:** Cookie `__Host-sid` mit `HttpOnly; Secure; SameSite=Strict; Path=/`. Gegen CSRF zusätzlich eine Origin/Referer-Prüfung bei allen schreibenden Requests.
- **Security-Header:** CSP (`default-src 'self'`, keine Inline-Skripte), HSTS, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `frame-ancestors 'none'`.
- **Eingaben und Ausgaben:** zod bei jedem Endpoint und Socket-Event, Drizzle mit parametrisierten Queries, keine `innerHTML`-Nutzung bei Nutzerdaten (Preact escaped automatisch).
- **Admin-Konsole:** Befehle werden serverseitig geparst und berechtigt, nicht im Client.
- **Kommunikation:** kein freier Chat, nur eine feste Emote- und Sprechblasen-Liste.
- **Abhängigkeiten:** `npm audit` in CI und README, Lockfile ist committet.
- **Backups:** `sqlite3 .backup`, verschlüsselt mit `age` (Public Key auf dem Server, Private Key **offline** bei Ihnen), Rotation nach 30 Tagen, Kopie außerhalb der VM empfohlen.

---

## 9. Hinweise zu Betrieb und Recht (bitte mit DSB / Schulleitung klären)

Ich kann das nicht rechtlich bewerten, möchte aber auf folgende Punkte hinweisen, damit sie in den Doku-Entwürfen richtig adressiert werden:

1. **Verantwortlicher ist die Schule, nicht Sie privat.** Der Betrieb auf einem privat angemieteten Oracle-Server braucht für echte Schülerdaten voraussichtlich eine **Genehmigung der Schulleitung** und eine Prüfung durch die/den Datenschutzbeauftragte/n. Für den lokalen Test und den Test mit Demo-Accounts gilt das nicht.
2. **Oracle ist ein US-Konzern.** Folgende Punkte brauchen Sie:
   - EU-Region wählen (z. B. Frankfurt).
   - Das Oracle-Data-Processing-Agreement (AVV nach Art. 28 DSGVO) ist Teil der Vertragsbedingungen und gehört dokumentiert.
   - Den Drittlandbezug (CLOUD Act, EU-US Data Privacy Framework) bewertet die/der DSB.

   Die Datenminimierung hier (nur Pseudonyme) senkt das Risiko erheblich.

3. **Pilot freiwillig, später Pflicht:** Für den Pilot nehme ich die **Einwilligungsvorlage** als Standard. Lernende unterschreiben selbst, bei Minderjährigen zusätzlich die Erziehungsberechtigten. Die genaue Altersgrenze klärt die DSB. Für den späteren Pflichteinsatz gibt es die Variante nach Art. 85 BayEUG. Pflicht setzt in der Regel voraus, dass die Schule das Werkzeug offiziell einführt.
4. **Oracle Always Free** kann ungenutzte Instanzen zurückfordern. Deshalb gehören Backups **außerhalb** der VM, das steht in der Betriebs-Checkliste.
5. **ARM-Architektur:** Alle Docker-Images werden für `linux/arm64` und `linux/amd64` gebaut.

---

## 10. Meilensteine

Jeder Meilenstein endet lauffähig, mit Tests, einer Kurzanleitung zum Testen und einem Commit/Push auf den Entwicklungsbranch.

| MS                           | Inhalt                                                                                                                                                                                                                                                                                                                                                                                                                                            | Abnahme („So testen Sie“)                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **M0 Setup**                 | Workspaces client/server/shared, TS strict, ESLint, Prettier, Vitest, GitHub-Actions-CI (Lint, Test, Audit), Docker Compose (prod und dev), Caddyfile, README-Grundgerüst, `.env.example`                                                                                                                                                                                                                                                         | `npm run dev`: Startseite und `/api/health` antworten; `npm test` ist grün |
| **M1 Hub-Welt**              | Asset-Generator (Tiles, Spieler, NPCs, Portale), Tiled-JSON-Map mit 4 Zonen, Bewegung in 4 Richtungen mit Animation, Kollision, Kamera, animiertes Wasser, NPC-Sprechblasen, Platzhalter-Portale mit Info-Box, Titelbildschirm, Pausenmenü, Einstellungen (vorerst lokal gespeichert), **Touch-Steuerkreuz**, Gamepad, Mini-Map                                                                                                                   | im Browser und am Handy (gleiches WLAN) herumlaufen                        |
| **M2 Backend & Accounts**    | DB-Schema und Migrationen, Auth (Argon2id, Sessions, Rate-Limit, Sperre, Passwortwechsel-Pflicht, TOTP), Rollen und Guards, Klassen, Gruppen, Policy-System, Login mit Klassencode, Datenschutzinfo bestätigen, Einstellungen am Account, Security-Header, Superadmin-Einrichtung über Setup-Token, Seed                                                                                                                                          | Login als Demo-Lehrkraft und Demo-Schüler/in; Rechte-Tests grün            |
| **M3 Charakter**             | Charakter-Editor bei der ersten Anmeldung, Paper-Doll mit 8 Ebenen und Palette-Swap, Item-DB (≈ 40 Platzhalter-Items, 5 Seltenheiten mit Farbe, Symbol und Glitzer), Inventar mit Sammlungszähler, Garderobe mit Filtern und Silhouetten                                                                                                                                                                                                          | Charakter anlegen und umziehen                                             |
| **M4 Level-Framework**       | Aufgabentyp-Registry (Client-Renderer und Server-Evaluator), 4 Typen (MC einfach/mehrfach, Lückentext, Zuordnen per Drag & Drop inkl. Touch, Reihenfolge), Hinweise, Feedback, Sterne, idempotente Belohnungen, Freischaltungsgraph inkl. Zonen und Brücke, 5 Platzhalter-Level (Kette A→B→C + 2 freie), `LEVEL_ERSTELLEN.md`                                                                                                                     | Level A→B→C durchspielen, Brücke erscheint                                 |
| **M5 Wirtschaft**            | Ledger, Shop-NPC mit festen Items und Rotation, Lootboxen nach Kategorie, offene Drop-Chancen, Pity, Duplikat-Umwandlung, überspringbare Animation, Policy-Schalter                                                                                                                                                                                                                                                                               | Items kaufen; Lootbox nur nach Aktivierung durch die Lehrkraft             |
| **M6 Admin**                 | Admin-Charakter (Aura und Abzeichen), Teleport, Unsichtbarkeit, Konsole (alle Befehle, `help`, Autovervollständigung, Historie, `set …` für Policies), Audit-Log, Presence/Multiplayer mit Emotes, Dashboard (Klassenübersicht, Detailansicht, Auswertung pro Level/Aufgabe, Problemaufgaben, Klassen-/Gruppenverwaltung, Sammel-Anlage mit druckbarer Zugangsliste, Mehrfachauswahl für Policies), CSV-Export mit Datenschutzhinweis, Ranglisten | als Lehrkraft Befehle ausführen, Dashboard prüfen                          |
| **M7 Datenschutz-Abschluss** | Retention-Jobs (Aggregation, Warnung, Löschung), Selbstlöschung und Archivierung, „Meine Daten“-Seite mit JSON-Export, alle Entwürfe in `docs/datenschutz/`, Security-Review mit Checkliste, Backup- und Restore-Skripte                                                                                                                                                                                                                          | Uhr vorstellen (Test-Kommando), Löschung prüfen                            |
| **M8 Feinschliff**           | Chiptune pro Zone, Shop und Level (Web Audio), Soundeffekte mit Untertiteln, Übergänge, Barrierefreiheit-Feinschliff, Performance-Check (Ziel: 60 FPS auf schwachem Laptop, ≥ 30 FPS auf älterem iPad; Bundle < 2 MB), Oracle-Installationsanleitung Schritt für Schritt                                                                                                                                                                          | Abschlusstest auf allen Geräten                                            |

---

## 11. Annahmen (bitte bestätigen oder korrigieren)

- A1: Ein Lernender gehört genau **einer** Klasse an. Gruppen sind zusätzlich und können klassenübergreifend sein.
- A2: Die Selbstlöschung durch Lernende hat eine **7-tägige Widerrufsfrist**, die Lehrkraft wird informiert.
- A3: Der Pilot läuft mit Einwilligung (siehe Abschnitt 9.3).
- A4: Setting „Bit-Insel“, Währung „Bytes“.
- A5: Preact für Overlays und Dashboard.
