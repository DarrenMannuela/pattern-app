#!/bin/sh
# Updates the running app to the code in this folder: backs the data up
# first, then rebuilds and restarts what changed. The data itself stays.
#
#   ./docker/update.sh
set -eu
cd "$(dirname "$0")/.."

if ! docker compose exec -T backup true 2>/dev/null; then
	echo "The app isn't running, so there's nothing to back up first."
	echo "Start it with: docker compose up -d --build"
	exit 1
fi
echo "Backing up before the update..."
docker compose exec -T backup /scripts/backup.sh before-update
# The Tailscale image isn't built here, so fetch its newest stable version
# (security fixes); offline, the one already here carries on.
if docker compose config --services | grep -qx tailscale; then
	docker compose pull -q tailscale || echo "Couldn't fetch a newer Tailscale image; keeping the current one."
fi
docker compose up -d --build
echo "Updated. The backup taken first is in backups/ (…_before-update.dump)."
