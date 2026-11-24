#!/usr/bin/env bash
# Verschlüsseltes Backup der Datenbank (Docker-Betrieb).
#
#   scripts/backup.sh
#
# Voraussetzungen auf dem Host: docker compose, age (https://age-encryption.org, z. B. "apt install age").
# Einmalig einen Schlüssel erzeugen – den PRIVATEN Schlüssel OFFLINE aufbewahren (nicht auf dem Server!):
#   age-keygen -o pixel-backup-key.txt         # auf Ihrem eigenen Rechner
#   grep 'public key' pixel-backup-key.txt     # öffentlichen Schlüssel in .env als BACKUP_AGE_RECIPIENT eintragen
#
# Cron (täglich 02:30):  30 2 * * * cd /opt/pixel-lernwelt && scripts/backup.sh >> /var/log/pixel-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age-Public-Key) muss in .env gesetzt sein}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
tmp="/data/backup-${stamp}.db"
out="${BACKUP_DIR}/pixel-${stamp}.db.age"

docker compose exec -T app node server/dist/tools/backup.js "$tmp"
# Unverschlüsselte Kopie verlässt den Container nur als verschlüsselter Datenstrom.
docker compose exec -T app cat "$tmp" | age -r "$BACKUP_AGE_RECIPIENT" -o "$out"
docker compose exec -T app rm -f "$tmp"
chmod 600 "$out"
echo "Backup: $out"

# Löschfrist für Backups
find "$BACKUP_DIR" -name 'pixel-*.db.age' -type f -mtime +"$BACKUP_KEEP_DAYS" -print -delete

echo "Hinweis: Backups zusätzlich AUSSERHALB des Servers ablegen (z. B. rsync auf ein Schul-NAS)."
