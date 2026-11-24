#!/usr/bin/env bash
# Wiederherstellung eines verschlüsselten Backups (Docker-Betrieb).
#
#   scripts/restore.sh backups/pixel-20261124-023000.db.age /pfad/zu/pixel-backup-key.txt
#
# ACHTUNG: Ersetzt die aktuelle Datenbank. Vorher ggf. selbst ein Backup erstellen.
set -euo pipefail
cd "$(dirname "$0")/.."
backup="${1:?Backup-Datei angeben}"
key="${2:?Datei mit privatem age-Schlüssel angeben}"

read -r -p "Aktuelle Datenbank wirklich durch ${backup} ersetzen? (ja/nein) " answer
[ "$answer" = "ja" ] || { echo "Abgebrochen."; exit 1; }

tmp="$(mktemp)"
trap 'shred -u "$tmp" 2>/dev/null || rm -f "$tmp"' EXIT
age -d -i "$key" -o "$tmp" "$backup"

docker compose stop app
docker compose cp "$tmp" app:/data/pixel.db
docker compose run --rm --no-deps --entrypoint sh app -c 'rm -f /data/pixel.db-wal /data/pixel.db-shm'
docker compose start app
echo "Wiederhergestellt. Bitte Anmeldung und Daten prüfen."
