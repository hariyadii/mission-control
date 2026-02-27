#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
DEPLOY_DIR="$ROOT/.deploy"
BACKUP_ARCHIVE="${1:-$DEPLOY_DIR/last-good-next.tgz}"
TS="$(date -Iseconds)"

if [[ ! -f "$BACKUP_ARCHIVE" ]]; then
  echo "rollback_fail reason=backup_missing archive=$BACKUP_ARCHIVE"
  exit 1
fi

cd "$ROOT"
mkdir -p "$DEPLOY_DIR/logs"

{
  echo "[$TS] starting rollback from $BACKUP_ARCHIVE"
  systemctl --user stop openclaw-mission-control.service
  rm -rf .next
  tar -xzf "$BACKUP_ARCHIVE"
  systemctl --user start openclaw-mission-control.service
} >> "$DEPLOY_DIR/logs/rollback.log" 2>&1

sleep 2
if "$ROOT/scripts/deploy-smoke.sh" > "$DEPLOY_DIR/logs/rollback-smoke.log" 2>&1; then
  cat > "$DEPLOY_DIR/last-rollback.json" <<EOF
{
  "status": "ok",
  "rolledBackAt": "$TS",
  "archive": "$BACKUP_ARCHIVE"
}
EOF
  echo "rollback_ok archive=$BACKUP_ARCHIVE"
  exit 0
fi

cat > "$DEPLOY_DIR/last-rollback.json" <<EOF
{
  "status": "failed",
  "rolledBackAt": "$TS",
  "archive": "$BACKUP_ARCHIVE"
}
EOF
echo "rollback_fail reason=post_rollback_smoke_failed archive=$BACKUP_ARCHIVE"
exit 1
