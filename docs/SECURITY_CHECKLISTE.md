# Security-Review und Checkliste

Stand: Meilenstein M7 (24.11.2026). Prüfung durch Code-Review und automatisierte Tests.
Legende: ✅ umgesetzt und getestet · ☑️ umgesetzt (manuell geprüft) · ⚠️ offen / Hinweis

## Authentifizierung & Sitzungen

| Prüfpunkt                                                                                        | Status | Nachweis                                                      |
| ------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------- |
| Passwörter ausschließlich als Argon2id-Hash, nie im Klartext gespeichert oder geloggt            | ✅     | `lib/passwords.ts`, Test „never stores the plain password“    |
| Startpasswort muss beim ersten Login geändert werden, Mindestlänge 10                            | ✅     | `auth.test.ts` „first steps“                                  |
| Rate-Limit für Login und Setup, temporäre Sperre nach 5 Fehlversuchen                            | ✅     | Test „locks the account temporarily“                          |
| Keine Unterscheidung „Konto existiert nicht“ / „Passwort falsch“ (auch Laufzeit)                 | ✅     | gleicher Fehlertext + Dummy-Hash                              |
| Sitzung serverseitig, Token nur als Hash, Cookie `__Host-sid; HttpOnly; Secure; SameSite=Strict` | ✅     | Test prüft Cookie-Attribute                                   |
| Abmeldung und Passwortänderung beenden Sitzungen serverseitig                                    | ✅     | Tests „logout invalidates…“, „password reset … ends sessions“ |
| Leerlauf- und absolute Ablaufzeit                                                                | ✅     | Test „sessions expire after idle time“                        |
| Keine Tokens in `localStorage`/`sessionStorage`                                                  | ☑️     | ESLint-Regel gegen `document.cookie`; Code-Review             |
| 2FA (TOTP) für Lehrkräfte, Geheimnis verschlüsselt (AES-256-GCM)                                 | ✅     | Test „two-factor authentication“                              |
| Superadmin nur per einmaligem Setup-Token                                                        | ✅     | Test „setup“                                                  |
| Passwort-Reset nur durch Lehrkraft/Administration, kein E-Mail-Versand                           | ☑️     | keine E-Mail-Funktion vorhanden                               |

## Zugriffskontrolle

| Prüfpunkt                                                                                                  | Status | Nachweis                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| Jeder API-Endpunkt prüft Rolle/Berechtigung serverseitig (außer health, public/info, login, logout, setup) | ☑️     | automatischer Scan aller Routen im Review                      |
| Lehrkräfte sehen/ändern nur eigene Klassen, Lernende, Gruppen; fremde Objekte → 404                        | ✅     | `access.test.ts`, `admin.test.ts`, `levels.test.ts`            |
| Administration ohne Zugriff auf Lernstandsdaten                                                            | ✅     | Test „superadmin manages teachers but not classes or learners“ |
| Lernende sehen keine Daten anderer (außer Pseudonym/Avatar bei aktivem Multiplayer bzw. Rangliste)         | ✅     | Presence- und Ranglisten-Tests                                 |
| Konsolenbefehle werden serverseitig geparst und berechtigt, alle protokolliert                             | ✅     | `admin.test.ts`                                                |
| WebSocket: Origin-Prüfung, Sitzungs-Cookie, Rollen/Klassen-Filter, Rate-Limit                              | ✅     | Presence-Test                                                  |
| Fremde Level-Durchgänge nicht nutzbar                                                                      | ✅     | Test „other users cannot use someone else’s run“               |

## Spiel-Integrität (Anti-Cheat)

| Prüfpunkt                                                                                              | Status | Nachweis                                            |
| ------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------- |
| Lösungen nie an den Client (undurchsichtige, gemischte IDs; Geheimnis nur im Durchgang auf dem Server) | ✅     | `tasks.test.ts`, „delivers tasks without solutions“ |
| Auswertung, Punkte, Sterne, Zeitmessung serverseitig                                                   | ✅     | `levels.test.ts`                                    |
| Belohnungen idempotent (kein doppeltes Auszahlen)                                                      | ✅     | „pays rewards once…“                                |
| Währung nur serverseitig, Ledger + Konsistenzprüfung, kein negativer Kontostand                        | ✅     | `verifyLedger` in Tests                             |
| Lootbox-Ziehung serverseitig mit CSPRNG, veröffentlichte Chancen statistisch geprüft, Pity             | ✅     | `economy.test.ts`                                   |
| Gesperrte Level serverseitig nicht startbar                                                            | ✅     | „locked levels cannot be started“                   |

## Web-Sicherheit

| Prüfpunkt                                                                                     | Status | Nachweis                                                    |
| --------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| HTTPS/TLS (Caddy), HSTS                                                                       | ☑️     | `Caddyfile`, `security.ts`                                  |
| CSP ohne externe Quellen und ohne Inline-Skripte; `frame-ancestors 'none'`                    | ✅     | `app.test.ts`; Produktions-Build ohne CSP-Verstöße getestet |
| CSRF: SameSite=Strict + Origin-Prüfung                                                        | ✅     | Test „rejects … foreign origin“                             |
| Eingabevalidierung mit zod, parametrisierte SQL-Abfragen (Drizzle)                            | ☑️     | Code-Review                                                 |
| XSS: Preact escaped; eigene HTML-Labels über `escapeHtml`; nur statische SVGs per `innerHTML` | ☑️     | Code-Review                                                 |
| CSV-Export gegen Formel-Injection geschützt                                                   | ☑️     | `dashboard.ts` `csvCell`                                    |
| Request-Größe begrenzt (256 KB API, 4 KB WebSocket)                                           | ☑️     | `app.ts`, `presence.ts`                                     |
| Fehlerantworten ohne interne Details                                                          | ☑️     | zentraler Error-Handler                                     |

## Datenschutz-Technik

| Prüfpunkt                                                                                | Status | Nachweis                                              |
| ---------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| Keine IP-Adressen, Header, Bodies oder Query-Parameter in Logs                           | ✅     | `logger.ts`, Test                                     |
| Löschfristen automatisch (Aggregation, Konten, Minuten, Audit, Durchgänge, Löschanträge) | ✅     | `retention.test.ts`                                   |
| Kontolöschung entfernt alle personenbezogenen Daten (FK-Cascade + explizite Bereinigung) | ✅     | Test „deletes learner accounts … with all their data“ |
| Auskunft/Export „Meine Daten“ ohne Passwort-Hashes                                       | ✅     | Test „Meine Daten …“                                  |
| SQLite `secure_delete`                                                                   | ☑️     | `db/client.ts`                                        |
| Verschlüsselte Backups mit Rotation                                                      | ☑️     | `scripts/backup.sh` (age)                             |
| Container ohne Root, read-only, ohne Capabilities                                        | ☑️     | `docker-compose.yml`, getestet in M0                  |

## Abhängigkeiten

| Prüfpunkt                                                                                          | Status | Nachweis                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit --omit=dev`: 0 Schwachstellen                                                           | ✅     | Stand 24.11.2026                                                                                                                       |
| ⚠️ `npm audit` (inkl. Entwicklungswerkzeuge): 4× „moderate“ in `esbuild` ≤ 0.24 über `drizzle-kit` | ⚠️     | betrifft nur den esbuild-Dev-Server, der nicht verwendet wird; nicht im Produktions-Image. Bei neuer drizzle-kit-Version aktualisieren |

## Offene Punkte / Empfehlungen

- ⚠️ Rate-Limits liegen im Arbeitsspeicher (reicht für eine Instanz; bei mehreren Instanzen Redis o. Ä.).
- ⚠️ Kein Penetrationstest durch Dritte. Vor Produktivbetrieb mit echten Daten empfohlen, mindestens ein
  OWASP-ZAP-Baseline-Scan gegen die Testinstanz.
- ⚠️ `REQUIRE_STAFF_2FA=true` im Produktivbetrieb setzen.
- ⚠️ Der Betrieb des Hosts (SSH-Härtung, Updates, Firewall) liegt außerhalb dieses Repositories (siehe
  `docs/datenschutz/07_Checkliste_Betrieb.md`).

## Regelmäßig

```bash
npm audit --omit=dev
```

```bash
npm test
```
