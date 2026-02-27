#!/usr/bin/env bash
set -euo pipefail

LOCK=/tmp/openclaw-evidence-sweeper.lock
LOG=/home/ubuntu/.openclaw/workspace/reports/evidence-sweeper-cycle.log
mkdir -p "$(dirname "$LOG")"

flock -n "$LOCK" bash -lc '
  TS="$(date -Iseconds)"
  if timeout 420 /home/ubuntu/mission-control/scripts/evidence-sweeper-runner.sh >> "'"$LOG"'" 2>&1; then
    echo "$TS status=ok cycle=evidence-sweeper" >> "'"$LOG"'"
  else
    RC=$?
    echo "$TS status=error cycle=evidence-sweeper rc=$RC" >> "'"$LOG"'"
  fi
'
