#!/bin/sh
# The backup container: runs backup.sh on BACKUP_SCHEDULE (cron syntax, in
# the TZ time zone; every Sunday at 02:00 by default). It also checks every
# hour, and at start, whether the newest backup is BACKUP_MAX_AGE_DAYS (7)
# days old or more, and takes one then: a Mac that was asleep or off at the
# scheduled time catches up within the hour instead of skipping a week.
set -eu

# Cron jobs don't see the container's environment: hand it over in a file.
{
	for v in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE BACKUP_KEEP BACKUP_COPY BACKUP_MAX_AGE_DAYS TZ; do
		eval "val=\${$v:-}"
		[ -n "$val" ] && printf "export %s='%s'\n" "$v" "$val"
	done
} > /etc/backup.env
chmod 600 /etc/backup.env

schedule="${BACKUP_SCHEDULE:-0 2 * * 0}"
{
	echo "$schedule /scripts/backup.sh > /proc/1/fd/1 2>&1"
	echo "17 * * * * /scripts/backup.sh due > /proc/1/fd/1 2>&1"
} > /etc/crontabs/root
echo "[backup] scheduled: '$schedule' ($TZ), and hourly catch-up when the newest is ${BACKUP_MAX_AGE_DAYS:-7} days old; keeping the newest ${BACKUP_KEEP:-8}"

# Wait for the database, then take a backup if there's none recent enough
# (none at all, on a first start).
until pg_isready -q; do sleep 2; done
/scripts/backup.sh due || echo "[backup] the backup failed; the hourly check will try again"

exec crond -f -l 8
