# Technische und organisatorische Maßnahmen (Art. 32 DSGVO) – ENTWURF

## 1. Vertraulichkeit

| Maßnahme                 | Umsetzung                                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pseudonymisierung        | Konten ohne Klarnamen; Zuordnung nur offline durch die Lehrkraft; zufällige Pseudonyme möglich                                                                                                                                                                   |
| Datenminimierung         | keine E-Mail, kein Geburtsdatum, keine Fotos, keine IP-Speicherung, keine Positionsspeicherung, kein Freitext-Chat                                                                                                                                               |
| Zugangskontrolle         | Login mit Klassencode + Pseudonym + Passwort; Passwörter nur als **Argon2id**-Hash (m=19 MiB, t=2, p=1); Mindestlänge 10; Startpasswort muss geändert werden                                                                                                     |
| Schutz vor Rateangriffen | Rate-Limit (IP, nur im Arbeitsspeicher) und temporäre Kontosperre nach 5 Fehlversuchen (15 Min.); gleiche Antwortzeit bei unbekannten Konten                                                                                                                     |
| Zwei-Faktor-Anmeldung    | TOTP für Lehrkräfte (optional, per `REQUIRE_STAFF_2FA` verpflichtend); Geheimnis AES-256-GCM-verschlüsselt                                                                                                                                                       |
| Sitzungen                | serverseitig, Token nur als SHA-256-Hash gespeichert; Cookie `__Host-sid` mit `HttpOnly`, `Secure`, `SameSite=Strict`; Ablauf nach 8 h (Lehrkräfte) / 12 h (Lernende), 2 h Inaktivität; Abmeldung beendet die Sitzung serverseitig                               |
| Zugriffskontrolle        | Rollen (Lernende, Lehrkraft, Administration) und Klassenzuordnung werden **bei jeder Anfrage serverseitig** geprüft; Lehrkräfte sehen nur eigene Klassen; die Administration sieht keine Lerndaten; fremde Datensätze werden wie nicht vorhanden behandelt (404) |
| Lösungsschutz            | Aufgabenlösungen verlassen den Server nie; Auswertung, Punkte, Währung und Lootbox-Ziehung ausschließlich serverseitig                                                                                                                                           |
| Transportverschlüsselung | HTTPS/TLS über Caddy (Let's Encrypt), HSTS                                                                                                                                                                                                                       |
| Browser-Sicherheit       | Content-Security-Policy nur eigene Origin, keine Inline-Skripte, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Permissions-Policy`; keine externen Ressourcen (CDN, Fonts, Analytics)                                                               |
| CSRF-Schutz              | `SameSite=Strict` + Origin-Prüfung aller schreibenden Anfragen und WebSocket-Verbindungen                                                                                                                                                                        |
| Eingabevalidierung       | zod-Schemas an allen Schnittstellen; parametrisierte Datenbankabfragen (Drizzle); keine HTML-Ausgabe von Nutzerdaten ohne Escaping; CSV-Export gegen Formel-Injection geschützt                                                                                  |

## 2. Integrität

| Maßnahme              | Umsetzung                                                                               |
| --------------------- | --------------------------------------------------------------------------------------- |
| Audit-Protokoll       | alle Verwaltungs- und Konsolenaktionen (wer, was, wann, bei wem), 12 Monate             |
| Transaktionsprotokoll | jede Währungsbuchung im Ledger; idempotente Belohnungen; Konsistenzprüfung              |
| Container-Härtung     | App-Container ohne Root, schreibgeschützt, ohne Linux-Capabilities, `no-new-privileges` |
| Abhängigkeiten        | Lockfile; `npm audit` in CI und vor jedem Update                                        |

## 3. Verfügbarkeit und Belastbarkeit

| Maßnahme          | Umsetzung                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Backups           | konsistente Online-Sicherung, **mit age verschlüsselt** (privater Schlüssel offline), Rotation 30 Tage, Kopie außerhalb des Servers |
| Wiederherstellung | `scripts/restore.sh`; Wiederherstellung [halbjährlich] testen                                                                       |
| Updates           | dokumentierter Update-Prozess (README)                                                                                              |

## 4. Löschung und Speicherbegrenzung

Automatischer Job (Start + alle 6 h): Aggregation/Löschung von Einzelversuchen nach 8 Wochen, Löschung von
Online-Minuten und Audit nach 12 Monaten, Löschung inaktiver Lernkonten nach 6 Monaten, Ausführung von
Löschanträgen. SQLite `secure_delete` überschreibt gelöschte Daten physisch.

## 5. Organisatorische Maßnahmen [von der Schule zu ergänzen]

- Freigabe des Einsatzes durch die Schulleitung; Information/Einwilligung vor Nutzung
- Unterweisung der Lehrkräfte (Hinweise im Dashboard: keine sensiblen Notizen, Exporte nur auf Dienstgeräten)
- Zugangslisten mit Klarnamen nur ausgedruckt und verschlossen aufbewahren; Vernichtung am Schuljahresende
- Zuständigkeit für Betrieb, Updates und Backups festlegen: [Name]
- Meldeweg bei Datenschutzverletzungen (Art. 33/34 DSGVO): [Ablauf]
