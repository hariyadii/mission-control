#!/usr/bin/env bash
set -euo pipefail

LOCK=/tmp/openclaw-deploy-watchdog.lock
LOG=/home/ubuntu/.openclaw/workspace/reports/deploy-watchdog-cycle.log
mkdir -p "$(dirname "$LOG")"

flock -n "$LOCK" bash -lc '
  TS="$(date -Iseconds)"
  if timeout 180 /home/ubuntu/mission-control/scripts/deploy-watchdog.sh >> "'"$LOG"'" 2>&1; then
    echo "$TS status=ok cycle=deploy-watchdog" >> "'"$LOG"'"
  else
    RC=$?
    echo "$TS status=error cycle=deploy-watchdog rc=$RC" >> "'"$LOG"'"
  fi
'
