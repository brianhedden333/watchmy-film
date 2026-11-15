#!/bin/zsh
# Build on the Mac, copy to the droplet, restart the API. Run from the WATCH folder on the Mac:
#   ./deploy/deploy.sh          site + API
#   ./deploy/deploy.sh site     static site only
# Never copies server/.env, the database (server/data) or uploads; those live only on the droplet.
set -euo pipefail
HOST=root@164.92.121.73
APP=/var/www/watchmyfilm
cd "$(dirname "$0")/.."

echo "Building site…"
BASE_PATH=/ VITE_ACCOUNTS=open npm run build

echo "Backing up the database on the droplet…"
ssh $HOST "$APP/deploy/backup.sh" || echo "(no database yet, skipping backup)"

echo "Copying site…"
rsync -az --delete dist/ $HOST:$APP/site/

if [[ "${1:-all}" != "site" ]]; then
  echo "Copying API…"
  rsync -az --delete --exclude node_modules --exclude .env --exclude data --exclude uploads server/ $HOST:$APP/server/
  rsync -az deploy/ $HOST:$APP/deploy/
  ssh $HOST "cd $APP/server && npm ci --omit=dev --no-audit --no-fund && (pm2 restart watchmyfilm --update-env || pm2 start ecosystem.config.cjs) && pm2 save"
fi

echo "Checking…"
sleep 2
ssh $HOST "curl -fsS http://127.0.0.1:5050/api/health" && echo " API ok"
