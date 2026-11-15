#!/bin/bash
# Runs ON the droplet. Safe online copy of the SQLite database plus posters. Old backups are kept; prune by hand.
set -euo pipefail
APP=/var/www/watchmyfilm
OUT=/var/backups/watchmyfilm
DB=$APP/server/data/watchmyfilm.db
[ -f "$DB" ] || exit 1
mkdir -p $OUT
STAMP=$(date +%Y%m%d-%H%M%S)
cd $APP/server && node -e "require('better-sqlite3')('$DB',{readonly:true}).backup('$OUT/watchmyfilm-$STAMP.db').then(()=>console.log('db backed up'))"
tar -czf $OUT/uploads-$STAMP.tgz -C $APP/server uploads
