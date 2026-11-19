#!/bin/zsh
# Build on the Mac, copy to the droplet, restart the API. Run from the WATCH folder on the Mac:
#   ./deploy/deploy.sh          site + API
#   ./deploy/deploy.sh site     static site only
# Never copies server/.env, the database (server/data) or uploads; those live only on the droplet.
#
# Everything goes over ONE shared SSH connection (ControlMaster). The droplet gets flooded by bot logins and
# throttles new SSH connections, so opening a fresh login for every step used to fail halfway through a deploy.
# The first connection is retried (up to ~10 minutes) until the droplet lets us in.
set -euo pipefail
HOST=root@164.92.121.73
APP=/var/www/watchmyfilm
cd "$(dirname "$0")/.."

CP="$HOME/.ssh/cm-wmf-%C"   # short path: Unix sockets are limited to ~104 characters
SSH=(ssh -o ControlPath="$CP")
RSH="ssh -o ControlPath=$CP"

echo "Building site…"
BASE_PATH=/ VITE_ACCOUNTS=open npm run build

echo "Connecting to the droplet…"
connected=0
for i in {1..40}; do
  if ssh -o ControlPath="$CP" -o ControlMaster=yes -o ControlPersist=20m -o ConnectTimeout=40 -o ServerAliveInterval=15 \
       -fN $HOST 2>/dev/null && "${SSH[@]}" -O check $HOST 2>/dev/null; then
    connected=1
    break
  fi
  echo "  try $i failed, retrying in 15s…"
  sleep 15
done
[[ $connected == 1 ]] || { echo "Couldn't connect to the droplet. Try again later."; exit 1; }
trap '"${SSH[@]}" -O exit $HOST 2>/dev/null || true' EXIT

echo "Backing up the database on the droplet…"
"${SSH[@]}" $HOST "$APP/deploy/backup.sh" || echo "(no database yet, skipping backup)"

echo "Copying site…"
rsync -az --delete -e "$RSH" dist/ $HOST:$APP/site/

if [[ "${1:-all}" != "site" ]]; then
  echo "Copying API…"
  rsync -az --delete -e "$RSH" --exclude node_modules --exclude .env --exclude data --exclude uploads server/ $HOST:$APP/server/
  rsync -az -e "$RSH" deploy/ $HOST:$APP/deploy/
  "${SSH[@]}" $HOST "cd $APP/server && npm ci --omit=dev --no-audit --no-fund && (pm2 restart watchmyfilm --update-env || pm2 start ecosystem.config.cjs) && pm2 save"
fi

echo "Checking…"
sleep 2
"${SSH[@]}" $HOST "curl -fsS http://127.0.0.1:5050/api/health" && echo " API ok"
