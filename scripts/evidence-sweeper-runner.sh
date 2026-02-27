#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
LOG_FILE="$REPORT_DIR/cron-recovery.log"
mkdir -p "$REPORT_DIR"

run_once() {
  timeout 180s bash -lc "cd \"$ROOT\" && node scripts/evidence-sweeper.js"
}

timestamp="$(date -Iseconds)"
if output="$(run_once 2>&1)"; then
  echo "$timestamp job=evidence-sweeper-hourly status=ok attempt=1 auto_recovered=false output=$(printf '%q' "$output")" >> "$LOG_FILE"
  echo "$output"
  exit 0
fi

code=$?
if [[ "$code" -ne 124 ]]; then
  echo "$timestamp job=evidence-sweeper-hourly status=error attempt=1 auto_recovered=false exit_code=$code" >> "$LOG_FILE"
  echo "$output" >&2
  exit "$code"
fi

sleep 2
timestamp_retry="$(date -Iseconds)"
if output_retry="$(run_once 2>&1)"; then
  echo "$timestamp_retry job=evidence-sweeper-hourly status=ok attempt=2 auto_recovered=true reason=timeout output=$(printf '%q' "$output_retry")" >> "$LOG_FILE"
  echo "$output_retry"
  exit 0
fi

retry_code=$?
echo "$timestamp_retry job=evidence-sweeper-hourly status=error attempt=2 auto_recovered=false reason=timeout exit_code=$retry_code" >> "$LOG_FILE"
echo "$output_retry" >&2
exit "$retry_code"
