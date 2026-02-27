#!/usr/bin/env bash
set -euo pipefail

JOBS_FILE="/home/ubuntu/.openclaw/cron/jobs.json"
RUNS_GLOB="/home/ubuntu/.openclaw/cron/runs/*.jsonl"
STATE_FILE="/home/ubuntu/.openclaw/workspace/reports/budget-governor-state.json"
WINDOW_HOURS=5
WINDOW_SEC=$((WINDOW_HOURS * 3600))
NOW_SEC="$(date +%s)"
MIN_TS_MS=$(((NOW_SEC - WINDOW_SEC) * 1000))

HI_RUNS=80
LO_RUNS=40
HI_TOKENS=220000
LO_TOKENS=120000

mkdir -p "$(dirname "$STATE_FILE")"

if compgen -G "$RUNS_GLOB" >/dev/null; then
  RUNS_5H="$(jq -s --argjson min_ts "$MIN_TS_MS" '[.[] | select((.ts // 0) >= $min_ts and (.action=="finished"))] | length' $RUNS_GLOB)"
  TOKENS_5H="$(jq -s --argjson min_ts "$MIN_TS_MS" '[.[] | select((.ts // 0) >= $min_ts and (.action=="finished")) | (.usage.total_tokens // 0)] | add // 0' $RUNS_GLOB)"
else
  RUNS_5H=0
  TOKENS_5H=0
fi

CURRENT_MODE="normal"
if [[ -f "$STATE_FILE" ]]; then
  CURRENT_MODE="$(jq -r '.mode // "normal"' "$STATE_FILE" 2>/dev/null || echo "normal")"
fi

TARGET_MODE="$CURRENT_MODE"
if [[ "$CURRENT_MODE" == "normal" && ( "$RUNS_5H" -ge "$HI_RUNS" || "$TOKENS_5H" -ge "$HI_TOKENS" ) ]]; then
  TARGET_MODE="throttle"
elif [[ "$CURRENT_MODE" == "throttle" && "$RUNS_5H" -le "$LO_RUNS" && "$TOKENS_5H" -le "$LO_TOKENS" ]]; then
  TARGET_MODE="normal"
fi

job_id_by_name() {
  local name="$1"
  jq -r --arg n "$name" '.jobs[] | select(.name==$n) | .id' "$JOBS_FILE" | head -n1
}

edit_safe() {
  local id="$1"
  shift
  if [[ -n "$id" ]]; then
    openclaw cron edit "$id" "$@" >/dev/null
  fi
}

ACTION="none"
if [[ "$TARGET_MODE" != "$CURRENT_MODE" ]]; then
  if [[ "$TARGET_MODE" == "throttle" ]]; then
    ACTION="throttle_on"
    # Keep suggester cadence fixed by operator-defined cron windows.
    # Budget governor only tunes worker thinking levels.
    edit_safe "$(job_id_by_name sam-worker-15m)" --thinking low
    edit_safe "$(job_id_by_name lyra-capital-worker-30m)" --thinking low
    edit_safe "$(job_id_by_name nova-worker-30m)" --thinking low
    edit_safe "$(job_id_by_name alex-worker-30m)" --thinking low
  else
    ACTION="throttle_off"
    # Keep suggester cadence fixed by operator-defined cron windows.
    # Budget governor only tunes worker thinking levels.
    edit_safe "$(job_id_by_name sam-worker-15m)" --thinking medium
    edit_safe "$(job_id_by_name lyra-capital-worker-30m)" --thinking medium
    edit_safe "$(job_id_by_name nova-worker-30m)" --thinking medium
    edit_safe "$(job_id_by_name alex-worker-30m)" --thinking medium
  fi
fi

cat > "$STATE_FILE" <<EOF
{
  "mode": "$TARGET_MODE",
  "runs5h": $RUNS_5H,
  "tokens5h": $TOKENS_5H,
  "windowHours": $WINDOW_HOURS,
  "updatedAt": "$(date -Iseconds)",
  "action": "$ACTION"
}
EOF

echo "budget_governor mode=$TARGET_MODE runs_5h=$RUNS_5H tokens_5h=$TOKENS_5H action=$ACTION"
