#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="/home/ubuntu/backups/openclaw"
LATEST_LINK="$BACKUP_ROOT/latest"

if [[ ! -L "$LATEST_LINK" && ! -d "$LATEST_LINK" ]]; then
  echo "restore_verify_fail reason=latest_backup_missing"
  exit 1
fi

LATEST_DIR="$(readlink -f "$LATEST_LINK")"
ARCHIVE="$LATEST_DIR/openclaw-state.tgz"
MANIFEST="$LATEST_DIR/SHA256SUMS"
CONVEX="$LATEST_DIR/convex-tasks.json"

if [[ ! -f "$ARCHIVE" || ! -f "$MANIFEST" || ! -f "$CONVEX" ]]; then
  echo "restore_verify_fail reason=backup_components_missing latest=$LATEST_DIR"
  exit 1
fi

sha256sum -c "$MANIFEST" >/tmp/restore-verify-sha.log 2>&1
tar -tzf "$ARCHIVE" >/tmp/restore-verify-tar.log 2>&1

if ! jq -e '.totalTasks >= 0 and (.tasks | type == "array")' "$CONVEX" >/dev/null 2>&1; then
  echo "restore_verify_fail reason=convex_export_invalid file=$CONVEX"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

if [[ ! -f "$TMP_DIR/home/ubuntu/.openclaw/openclaw.json" ]]; then
  echo "restore_verify_fail reason=extracted_openclaw_json_missing"
  exit 1
fi
if [[ ! -f "$TMP_DIR/home/ubuntu/.openclaw/cron/jobs.json" ]]; then
  echo "restore_verify_fail reason=extracted_cron_jobs_missing"
  exit 1
fi
if [[ ! -f "$TMP_DIR/home/ubuntu/mission-control/package.json" ]]; then
  echo "restore_verify_fail reason=extracted_mission_control_missing"
  exit 1
fi

BACKUP_AGE_HOURS=$(( ( $(date +%s) - $(stat -c %Y "$ARCHIVE") ) / 3600 ))
TASKS_COUNT="$(jq -r '.totalTasks // 0' "$CONVEX")"

echo "restore_verify_ok backup_age_h=${BACKUP_AGE_HOURS} tasks_snapshot=${TASKS_COUNT} latest=$LATEST_DIR"
