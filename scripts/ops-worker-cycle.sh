#!/usr/bin/env bash
set -euo pipefail
LOCK=/tmp/openclaw-ops-worker.lock
LOG=/home/ubuntu/.openclaw/workspace/reports/ops-worker-cycle.log
mkdir -p "$(dirname "$LOG")"

flock -n "$LOCK" bash -lc '
  TS="$(date -Iseconds)"
  if timeout 420 /home/ubuntu/mission-control/scripts/backlog-kicker.sh >> "'"$LOG"'" 2>&1; then
    echo "$TS status=ok cycle=worker" >> "'"$LOG"'"
  else
    RC=$?
    echo "$TS status=error cycle=worker rc=$RC" >> "'"$LOG"'"
  fi
'
