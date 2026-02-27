#!/usr/bin/env bash
set -euo pipefail
LOCK=/tmp/openclaw-ops-monitor.lock
LOG=/home/ubuntu/.openclaw/workspace/reports/ops-monitor-cycle.log
mkdir -p "$(dirname "$LOG")"

flock -n "$LOCK" bash -lc '
  TS="$(date -Iseconds)"
  if timeout 300 /home/ubuntu/mission-control/scripts/ops-autopilot.sh >> "'"$LOG"'" 2>&1; then
    echo "$TS status=ok cycle=monitor" >> "'"$LOG"'"
  else
    RC=$?
    echo "$TS status=error cycle=monitor rc=$RC" >> "'"$LOG"'"
  fi
'
