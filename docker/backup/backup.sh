#!/bin/sh
# Takes one backup of the whole database (orders, logos, layout pieces) into
# /backups, proves it by restoring it into a scratch database, copies it to a
# second place when BACKUP_COPY is on, and keeps the newest BACKUP_KEEP.
# Run by cron every week; run it by hand with:
#   docker compose exec backup /scripts/backup.sh
#
#   backup.sh            take a backup now
#   backup.sh <label>    the same, named konveksi_<date>_<label>.dump
#   backup.sh due        take one only if the newest is BACKUP_MAX_AGE_DAYS
#                        (7) days old or more. Cron runs this every hour, so
#                        a week whose planned time the Mac slept through
#                        still gets its backup within the hour of waking.
set -eu
[ -f /etc/backup.env ] && . /etc/backup.env

keep="${BACKUP_KEEP:-8}"
label="${1:-}"
if [ "$label" = "due" ]; then
	max_age="${BACKUP_MAX_AGE_DAYS:-7}"
	if [ -n "$(find /backups -maxdepth 1 -name 'konveksi_*.dump' -mtime "-$max_age" | head -n 1)" ]; then
		exit 0 # a recent enough backup exists
	fi
	label=""
fi
stamp="$(date +%Y-%m-%d_%H%M)"
name="konveksi_${stamp}${label:+_$label}.dump"
out="/backups/$name"
tmp="${out}.partial"
check="konveksi_restore_check"
trap 'rm -f "$tmp"; psql -q -d postgres -c "DROP DATABASE IF EXISTS $check" >/dev/null 2>&1 || true' EXIT

say() { echo "[backup] $(date '+%Y-%m-%d %H:%M %Z') $*"; }
export PGOPTIONS="-c client_min_messages=warning" # no "does not exist, skipping" notices

say "starting"
live=$(psql -tAc "SELECT count(*) FROM orders" 2>/dev/null || echo "?")
pg_dump --format=custom --no-owner --file="$tmp"

# A backup is only as good as a restore of it: put it into a scratch
# database and count what comes back.
psql -q -d postgres -c "DROP DATABASE IF EXISTS $check" >/dev/null
psql -q -d postgres -c "CREATE DATABASE $check" >/dev/null
if pg_restore --no-owner --exit-on-error --dbname="$check" "$tmp" 2>/tmp/restore.err &&
	restored=$(psql -tA -d "$check" -c "SELECT count(*) FROM orders") &&
	logos=$(psql -tA -d "$check" -c "SELECT count(*) FROM artwork"); then
	:
else
	mv "$tmp" "/backups/${name%.dump}_FAILED-CHECK.bad"
	say "RESTORE TEST FAILED: kept as ${name%.dump}_FAILED-CHECK.bad, not counted as a backup"
	sed 's/^/[backup]   /' /tmp/restore.err | head -5
	exit 1
fi
mv "$tmp" "$out"
say "saved $name ($(du -h "$out" | cut -f1)): restore test brought back $restored orders (live: $live) and $logos logos"

# Keep the newest $keep (named backups, like the one taken before a restore
# or an update, are kept too and count towards the limit).
prune() {
	ls -1t "$1"/konveksi_*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
		rm -f "$old"
		say "removed old $(basename "$old") from $1"
	done
}
prune /backups

# A second copy on another disk or a synced folder (BACKUP_COPY_DIR in .env):
# a backup on the same disk as the database doesn't survive that disk.
if [ "${BACKUP_COPY:-}" = "on" ]; then
	if cp "$out" "/backups-copy/$name.partial" && mv "/backups-copy/$name.partial" "/backups-copy/$name"; then
		say "copied to the second place"
		prune /backups-copy
	else
		say "COPY TO THE SECOND PLACE FAILED (is the drive or folder there?)"
		exit 1
	fi
fi
