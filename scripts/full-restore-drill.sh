#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/home/ubuntu/backups/openclaw"
LATEST_DIR="$(readlink -f "$BACKUP_ROOT/latest")"
ARCHIVE="$LATEST_DIR/openclaw-state.tgz"
MANIFEST="$LATEST_DIR/SHA256SUMS"
LOG_DIR="/home/ubuntu/.openclaw/workspace/reports"
LOG_FILE="$LOG_DIR/full-restore-drill-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR"

{
  echo "[restore-drill] started $(date -Iseconds)"
  echo "[restore-drill] latest=$LATEST_DIR"

  sha256sum -c "$MANIFEST"
  tar -tzf "$ARCHIVE" >/dev/null

  systemctl --user stop openclaw-mission-control.service
  systemctl --user stop openclaw-gateway.service
  fuser -k 3001/tcp >/dev/null 2>&1 || true

  tar -xzf "$ARCHIVE" -C /

  systemctl --user start openclaw-gateway.service
  systemctl --user start openclaw-mission-control.service
  sleep 3
  systemctl --user is-active openclaw-gateway.service
  systemctl --user is-active openclaw-mission-control.service

  openclaw health
  curl -s -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"status"}' | jq '{ok,byStatus,workflowHealth}'
  /home/ubuntu/mission-control/scripts/deploy-smoke.sh

  echo "[restore-drill] completed $(date -Iseconds)"
} >> "$LOG_FILE" 2>&1

echo "full_restore_drill_ok log=$LOG_FILE"
