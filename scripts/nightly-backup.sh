#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/home/ubuntu/backups/openclaw"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
ARCHIVE="$DEST/openclaw-state.tgz"
MANIFEST="$DEST/SHA256SUMS"
CONVEX_EXPORT="$DEST/convex-tasks.json"

mkdir -p "$DEST"

cd /home/ubuntu/mission-control
# Load Convex URL for non-interactive runs (cron/systemd user services).
if [[ -z "${NEXT_PUBLIC_CONVEX_URL:-}" && -f "/home/ubuntu/mission-control/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "/home/ubuntu/mission-control/.env.local"
  set +a
fi
node /home/ubuntu/mission-control/scripts/export-convex-state.mjs "$CONVEX_EXPORT"

tar -czf "$ARCHIVE" \
  /home/ubuntu/.openclaw/openclaw.json \
  /home/ubuntu/.openclaw/cron/jobs.json \
  /home/ubuntu/.openclaw/workspace \
  /home/ubuntu/.openclaw/workspace-sam \
  /home/ubuntu/.openclaw/workspace-lyra \
  /home/ubuntu/.openclaw/workspace-nova \
  /home/ubuntu/mission-control/src \
  /home/ubuntu/mission-control/convex \
  /home/ubuntu/mission-control/scripts \
  /home/ubuntu/mission-control/package.json \
  /home/ubuntu/mission-control/package-lock.json \
  /home/ubuntu/mission-control/.env.local \
  /home/ubuntu/mission-control/.deploy

sha256sum "$ARCHIVE" "$CONVEX_EXPORT" > "$MANIFEST"
tar -tzf "$ARCHIVE" >/dev/null

ln -sfn "$DEST" "$BACKUP_ROOT/latest"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +14 -print -exec rm -rf {} +

SIZE="$(du -sh "$ARCHIVE" | awk '{print $1}')"
echo "backup_ok stamp=$STAMP size=$SIZE archive=$ARCHIVE convex_export=$CONVEX_EXPORT"
