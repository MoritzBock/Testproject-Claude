# Installation auf Oracle Cloud (Always Free) – Schritt für Schritt

> Vor dem Einsatz mit echten Schülerdaten: `docs/datenschutz/07_Checkliste_Betrieb.md` abarbeiten
> (Freigabe der Schulleitung, DSB, Auftragsverarbeitung, EU-Region).

## 1. VM anlegen

1. In der Oracle Cloud Console **Region „Germany Central (Frankfurt)“** oder eine andere EU-Region wählen.
2. _Compute → Instances → Create instance_:
   - Image: **Ubuntu 24.04** (oder 22.04)
   - Shape: **Ampere A1** (ARM, z. B. 2 OCPU / 12 GB RAM, im Free Tier enthalten) oder VM.Standard.E2.1.Micro
   - SSH-Schlüssel hochladen (Ihren öffentlichen Schlüssel)
3. Nach dem Start die **öffentliche IP-Adresse** notieren.

## 2. Netzwerk öffnen

_Networking → Virtual Cloud Networks → (Ihr VCN) → Security Lists → Default_ → Ingress Rules hinzufügen:

| Quelle    | Protokoll | Port                   |
| --------- | --------- | ---------------------- |
| 0.0.0.0/0 | TCP       | 80                     |
| 0.0.0.0/0 | TCP       | 443                    |
| 0.0.0.0/0 | UDP       | 443 (optional, HTTP/3) |

SSH (22) möglichst nur von Ihrer eigenen IP zulassen.

Ubuntu-Images von Oracle haben zusätzlich eine lokale Firewall (iptables). Auf der VM:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
```

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
```

```bash
sudo netfilter-persistent save
```

## 3. Domain

Bei Ihrem DNS-Anbieter einen **A-Record** anlegen, z. B. `lernwelt.ihre-schule.de` → öffentliche IP.
(Eine kostenlose Subdomain eines DynDNS-Dienstes funktioniert ebenfalls; Datenschutz des Anbieters prüfen.)

## 4. Server vorbereiten

Per SSH anmelden (`ssh ubuntu@<IP>`), dann:

```bash
sudo apt update && sudo apt -y upgrade
```

```bash
sudo apt -y install docker.io docker-compose-v2 git age unattended-upgrades
```

```bash
sudo usermod -aG docker ubuntu && newgrp docker
```

Automatische Sicherheitsupdates aktivieren:

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 5. Anwendung installieren

```bash
sudo mkdir -p /opt/pixel-lernwelt && sudo chown ubuntu /opt/pixel-lernwelt
```

```bash
git clone <URL-Ihres-Repositorys> /opt/pixel-lernwelt
```

```bash
cd /opt/pixel-lernwelt && cp .env.example .env && nano .env
```

In `.env` mindestens setzen:

```ini
DOMAIN=lernwelt.ihre-schule.de
PUBLIC_ORIGIN=https://lernwelt.ihre-schule.de
SCHOOL_NAME=…
SCHOOL_CONTACT=…
DPO_CONTACT=…
HOSTING_INFO=Oracle Cloud Infrastructure, Region Frankfurt
REQUIRE_STAFF_2FA=true
```

Starten (der erste Build dauert auf ARM einige Minuten):

```bash
docker compose up -d --build
```

## 6. Ersteinrichtung

1. Setup-Token aus dem Log lesen:

   ```bash
   docker compose logs app | grep Setup-Token
   ```

2. `https://lernwelt.ihre-schule.de/dashboard.html` öffnen und mit dem Token das **Administrationskonto**
   anlegen.
3. Im Dashboard unter „Lehrkräfte“ die Lehrkraft-Konten anlegen (Startpasswort wird einmalig angezeigt).
4. Als Lehrkraft anmelden, Passwort ändern, 2FA einrichten, Klasse anlegen, Konten anlegen und die Zugangsliste
   drucken.

## 7. Backups

Auf Ihrem **eigenen** Rechner:

```bash
age-keygen -o pixel-backup-key.txt
```

Den angezeigten öffentlichen Schlüssel (`age1…`) auf dem Server in `.env` als `BACKUP_AGE_RECIPIENT` eintragen.
Die Datei `pixel-backup-key.txt` sicher offline aufbewahren.

Täglicher Cronjob auf dem Server (`crontab -e`):

```
30 2 * * * cd /opt/pixel-lernwelt && scripts/backup.sh >> /home/ubuntu/pixel-backup.log 2>&1
```

Die verschlüsselten Dateien aus `backups/` regelmäßig auf ein Speichersystem außerhalb von Oracle kopieren
(z. B. `rsync` auf ein Schul-NAS). Always-Free-Instanzen können bei Inaktivität zurückgefordert werden.

## 8. Updates

```bash
cd /opt/pixel-lernwelt && scripts/backup.sh
```

```bash
git pull && docker compose up -d --build && docker image prune -f
```
