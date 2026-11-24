# Pixel-Lernwelt

Browserbasiertes 2D-Pixel-Lernspiel für berufliche Schulen (IT-Ausbildungsberufe).
Lernende bewegen sich frei auf der **Bit-Insel** und betreten von dort aus Level mit Lernaufgaben.
Das System ist datensparsam gebaut (Pseudonyme statt Klarnamen, keine externen Dienste, kein Tracking).

> **Hinweis:** Die Lernstandsdaten dienen der Lernbegleitung und nicht der Notengebung.

Stand: **Meilenstein M7 (Datenschutz-Abschluss)**. Der Fahrplan steht in [`docs/PLAN.md`](docs/PLAN.md).

---

## Inhalt

1. [Lokal starten (Entwicklung)](#1-lokal-starten-entwicklung)
2. [Lokal mit Docker testen](#2-lokal-mit-docker-testen)
3. [Produktion (z. B. Oracle Cloud Free Tier)](#3-produktion-z-b-oracle-cloud-free-tier)
4. [Update](#4-update)
5. [Backup](#5-backup)
6. [Sicherheit & Abhängigkeiten](#6-sicherheit--abhängigkeiten)
7. [Projektstruktur & Befehle](#7-projektstruktur--befehle)

---

## 1. Lokal starten (Entwicklung)

Voraussetzung: **Node.js 22** (LTS) oder neuer.

```bash
npm install
```

```bash
npm run dev
```

- Spiel: <http://localhost:5173>
- API (über den Vite-Proxy): <http://localhost:5173/api/health>

**Test am Handy oder iPad im selben WLAN:** Vite zeigt beim Start eine „Network“-Adresse an, z. B.
`http://192.168.1.20:5173`. Diese Adresse im Gerät öffnen. Ab M2 ist dafür ggf. `COOKIE_SECURE=false`
in `.env` nötig, weil das keine `localhost`-Adresse ist. Das gilt nur in der Entwicklung, in Produktion ist es gesperrt.

### Steuerung (Standard, in den Einstellungen änderbar)

| Aktion                         | Tastatur           | Gamepad                    | Touch                     |
| ------------------------------ | ------------------ | -------------------------- | ------------------------- |
| Laufen                         | WASD / Pfeiltasten | linker Stick / Steuerkreuz | Joystick links            |
| Interagieren / Portal betreten | E / Leertaste      | A                          | Taste „A“                 |
| Pause / Menü                   | Esc / P            | Start                      | Menü-Symbol               |
| Weltkarte                      | M                  | Select                     | Karten-Symbol / Minikarte |

### Assets und Karte

Die Platzhalter-Grafiken und die Hub-Karte sind bereits im Repository. Neu erzeugen:

```bash
npm run assets
```

Die Karte (`hub.json`) wird dabei nur erzeugt, wenn sie fehlt. Details zur Bearbeitung mit Tiled und zum
Austausch von Grafiken stehen in [`docs/KARTE_BEARBEITEN.md`](docs/KARTE_BEARBEITEN.md).

## 2. Lokal mit Docker testen

So testen Sie den Produktions-Build ohne TLS lokal:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Danach <http://localhost:3000> öffnen. Die Daten liegen im Docker-Volume `dev-data`.

## 3. Produktion (z. B. Oracle Cloud Free Tier)

> Eine ausführliche Schritt-für-Schritt-Anleitung für Oracle folgt in M8. Vor dem Einsatz mit echten
> Schülerdaten bitte die Datenschutz-Checkliste in `docs/datenschutz/` mit Schulleitung und DSB abarbeiten.

Kurzfassung:

1. VM anlegen, **Region in der EU** wählen (z. B. Frankfurt). Ampere (ARM) und x86 funktionieren beide.
2. Firewall bzw. Security List: nur die Ports **80** und **443** (TCP, für HTTP/3 auch UDP 443) öffnen, dazu SSH für Sie.
3. Einen DNS-Eintrag (A-Record) für Ihre Domain auf die öffentliche IP der VM setzen.
4. Docker und das Docker-Compose-Plugin installieren, dann das Repository klonen.
5. Konfiguration anlegen:

   ```bash
   cp .env.example .env
   ```

   In `.env` die Werte `DOMAIN` und `PUBLIC_ORIGIN` eintragen.

6. Starten:

   ```bash
   docker compose up -d --build
   ```

Caddy besorgt automatisch ein Let's-Encrypt-Zertifikat. Die App ist nur über Caddy erreichbar (HTTPS),
der App-Port ist nicht nach außen freigegeben. Der Container läuft schreibgeschützt, ohne Root-Rechte
und ohne Linux-Capabilities.

**Logs:** Die App protokolliert keine IP-Adressen, Header, Request-Inhalte oder Query-Parameter.
Caddy schreibt keine Access-Logs. Docker rotiert die Logs nach Größe (3 × 10 MB).

## 4. Update

```bash
git pull
```

```bash
docker compose up -d --build
```

```bash
docker image prune -f
```

Vor jedem Update ein Backup anlegen (siehe unten). Ab M2 laufen Datenbank-Migrationen beim Start automatisch.

## 5. Backup

Verschlüsselte, konsistente Backups mit Rotation (30 Tage):

1. `age` auf dem Server installieren (`apt install age`).
2. Auf Ihrem **eigenen** Rechner ein Schlüsselpaar erzeugen: `age-keygen -o pixel-backup-key.txt`.
   Die Datei (privater Schlüssel) bleibt offline.
3. Den öffentlichen Schlüssel (`age1…`) in `.env` als `BACKUP_AGE_RECIPIENT` eintragen.
4. Backup ausführen bzw. per Cron täglich:

   ```bash
   scripts/backup.sh
   ```

Wiederherstellen:

```bash
scripts/restore.sh backups/pixel-JJJJMMTT-HHMMSS.db.age /pfad/zu/pixel-backup-key.txt
```

Backups gehören zusätzlich **außerhalb** der VM, denn Oracle kann ungenutzte Always-Free-Instanzen zurückfordern.

## 6. Sicherheit & Abhängigkeiten

- Abhängigkeiten regelmäßig prüfen:

  ```bash
  npm audit --omit=dev
  ```

  Behebbare Probleme aktualisieren:

  ```bash
  npm audit fix
  ```

  Danach `npm test` laufen lassen und neu deployen.

- Die CI (`.github/workflows/ci.yml`) führt bei jedem Push Lint, Formatprüfung, Typprüfung, Tests, Build und `npm audit` aus.
- **Keine Laufzeit-Abhängigkeiten nach außen:** keine CDNs, keine Web-Fonts, kein Tracking.
  Die Content-Security-Policy erlaubt ausschließlich die eigene Origin.
- **Cookies:** Ab M2 gibt es ausschließlich ein technisch notwendiges Session-Cookie
  (`HttpOnly`, `Secure`, `SameSite=Strict`). Ein Cookie-Banner ist deshalb nicht erforderlich
  (§ 25 Abs. 2 Nr. 2 TDDDG). Details stehen in `docs/datenschutz/`.

## 7. Projektstruktur & Befehle

```
shared/   gemeinsame Typen, zod-Schemas, Spielkonstanten (Client + Server)
server/   Fastify-API (Node 22, TypeScript)
client/   Spiel (Phaser 3) + HTML-Overlays (Preact), gebaut mit Vite
docs/     Plan, Anleitungen, Datenschutz-Entwürfe
scripts/  Asset-Generator, Kartenvorschau, später Backup
```

| Befehl              | Zweck                            |
| ------------------- | -------------------------------- |
| `npm run dev`       | Client und Server mit Hot-Reload |
| `npm test`          | alle Tests (Vitest)              |
| `npm run lint`      | ESLint                           |
| `npm run format`    | Prettier                         |
| `npm run typecheck` | TypeScript-Prüfung               |
| `npm run build`     | Produktions-Build                |
| `npm start`         | gebauten Server starten          |

Spieltitel, Weltname und Währungsname stehen zentral in `shared/src/game-config.ts`.
