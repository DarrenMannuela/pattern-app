#!/bin/sh
# Signs the app's Tailscale container in to your tailnet, once, with a link
# you open and approve. (Or put an auth key in TS_AUTHKEY in .env instead.)
#
#   ./docker/tailscale/login.sh
#
# Started on its own without a key, the container shows an approval link
# for only 60 seconds, then gives up, restarts, and shows a new link for a
# new device each time; an approval that comes in late is for a device that
# no longer exists. This waits for the approval as long as it takes, and
# saves the sign-in in the container's volume, where it then stays.
set -eu
cd "$(dirname "$0")/../.."

docker compose stop tailscale >/dev/null 2>&1 || true
echo "Open the link below and approve the device. This waits until you do."
docker compose run --rm --no-deps --entrypoint sh tailscale -c '
  tailscaled --tun=userspace-networking --statedir=/var/lib/tailscale --socket=/tmp/login.sock >/dev/null 2>&1 &
  sleep 2
  tailscale --socket=/tmp/login.sock up --hostname="$TS_HOSTNAME"
  tailscale --socket=/tmp/login.sock status --self --peers=false
'
docker compose up -d tailscale
echo "Signed in. In the Tailscale admin console, Machines → this device → Disable key expiry."
