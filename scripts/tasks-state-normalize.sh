#!/usr/bin/env bash
set -euo pipefail

API_URL="http://127.0.0.1:3001/api/autonomy"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
LOG_FILE="$REPORT_DIR/tasks-state-normalize.log"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

mkdir -p "$REPORT_DIR"

payload="$(printf '{"action":"normalize_states","dryRun":%s}' "$DRY_RUN")"
response="$(curl -fsS -X POST "$API_URL" -H 'content-type: application/json' -d "$payload")"

timestamp="$(date -Iseconds)"
if command -v jq >/dev/null 2>&1; then
  compact="$(printf '%s\n' "$response" | jq -c '.')"
else
  compact="$response"
fi

echo "[$timestamp] $compact" >> "$LOG_FILE"

if command -v jq >/dev/null 2>&1; then
  printf '%s\n' "$response" | jq .
else
  printf '%s\n' "$response"
fi
