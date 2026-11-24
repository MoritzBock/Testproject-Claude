# Checkliste Freigabe und Betrieb – ENTWURF

## Vor dem ersten Einsatz mit echten Lernenden

- [ ] Schulleitung über Einsatz, Zweck und Betreiber informiert; **Freigabe** liegt schriftlich vor
- [ ] Datenschutzbeauftragte/r hat Datenübersicht, Datenschutzinformation, TOM und Hosting geprüft
- [ ] Platzhalter in `.env` gesetzt: `SCHOOL_NAME`, `SCHOOL_CONTACT`, `DPO_CONTACT`, `HOSTING_INFO`
- [ ] Rechtsgrundlage geklärt: Pilot = Einwilligung (`05_…`) unterschrieben gesammelt | Unterricht = Art. 85 BayEUG
- [ ] Information an Lernende (`03_…`) und ggf. Erziehungsberechtigte (`04_…`) ausgegeben
- [ ] Verzeichnis von Verarbeitungstätigkeiten (`02_…`) ausgefüllt und abgelegt

## Hosting (z. B. Oracle Cloud Free Tier)

- [ ] **Region in der EU** gewählt (z. B. Frankfurt)
- [ ] **Auftragsverarbeitungsvertrag (Art. 28 DSGVO)** mit dem Hoster geprüft und dokumentiert (bei Oracle Teil der
      Vertragsbedingungen „Data Processing Agreement“) – Vertragspartner sollte die Schule/der Sachaufwandsträger sein
- [ ] Drittlandbezug des Hosters (Konzernmutter USA) durch DSB bewertet (EU-US Data Privacy Framework / SCC)
- [ ] Betrieb auf privat angemietetem Server: ausdrücklich durch Schulleitung genehmigt [zu klären]
- [ ] Firewall: nur 80/443 öffentlich, SSH nur mit Schlüssel, Root-Login deaktiviert
- [ ] Automatische Sicherheitsupdates des Betriebssystems aktiviert (`unattended-upgrades`)
- [ ] Hinweis: Always-Free-Instanzen können bei Inaktivität zurückgefordert werden → Backups extern!

## Konfiguration

- [ ] `REQUIRE_STAFF_2FA=true` (empfohlen)
- [ ] Löschfristen geprüft (`RETENTION_*`)
- [ ] `APP_SECRET` gesetzt oder `data/app-secret.key` im Backup-Konzept berücksichtigt
- [ ] Setup-Token nach Ersteinrichtung verbraucht (Server-Log prüfen)

## Backups

- [ ] age-Schlüsselpaar erzeugt, **privater Schlüssel offline** (z. B. USB-Stick im Schultresor)
- [ ] `BACKUP_AGE_RECIPIENT` gesetzt, Cronjob für `scripts/backup.sh` eingerichtet
- [ ] Backups zusätzlich außerhalb des Servers gespeichert (z. B. Schul-NAS)
- [ ] Wiederherstellung einmal getestet (`scripts/restore.sh`), Datum: [ ]

## Laufender Betrieb (monatlich)

- [ ] `git pull` + `docker compose up -d --build` (Updates), vorher Backup
- [ ] `npm audit --omit=dev` ohne kritische Funde
- [ ] Protokoll im Dashboard auf Auffälligkeiten prüfen
- [ ] Zum Schuljahresende: Klassen archivieren oder löschen; ausgedruckte Zugangslisten vernichten
