#!/bin/sh
# Puts a backup back: replaces everything in the database (orders, logos,
# layout pieces) with what is in the backup file. The current data is backed
# up first, so a wrong restore can itself be undone.
#
#   ./docker/restore.sh backups/konveksi_2026-10-04_0200.dump
set -eu
cd "$(dirname "$0")/.."

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
	echo "usage: $0 backups/konveksi_<date>.dump" >&2
	echo "backups you have:" >&2
	ls -1t backups/konveksi_*.dump 2>/dev/null | head -10 >&2 || echo "  (none)" >&2
	exit 1
fi

echo "This replaces ALL data in the database with $file."
printf "Type yes to go on: "
read -r answer
[ "$answer" = "yes" ] || { echo "Nothing changed."; exit 1; }

echo "Backing up the current data first..."
docker compose exec -T backup /scripts/backup.sh before-restore

# The backend keeps the orders in memory: stop it while the data changes
# under it, and start it again so it reads the restored data.
docker compose stop backend
docker compose exec -T backup sh -c '. /etc/backup.env && pg_restore --clean --if-exists --no-owner --single-transaction --dbname="$PGDATABASE"' < "$file"
docker compose start backend
echo "Restored $file. The app has reloaded the data."
