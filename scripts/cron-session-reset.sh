#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <agent> <job-id-prefix>"
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "cron-session-reset: jq is required"
  exit 2
fi

agent="$1"
job_prefix="$2"
sessions_file="/home/ubuntu/.openclaw/agents/${agent}/sessions/sessions.json"

if [[ ! -f "$sessions_file" ]]; then
  echo "cron-session-reset: no session file for agent=$agent"
  exit 0
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

removed="$(jq -r --arg a "$agent" --arg jp "$job_prefix" '
  to_entries
  | [ .[]
      | select(
          (.key | startswith("agent:" + $a + ":cron:"))
          and (.key | contains($jp))
        )
    ]
  | length
' "$sessions_file")"

jq --arg a "$agent" --arg jp "$job_prefix" '
  with_entries(
    select(
      (
        (.key | startswith("agent:" + $a + ":cron:"))
        and (.key | contains($jp))
      ) | not
    )
  )
' "$sessions_file" > "$tmp_file"

mv "$tmp_file" "$sessions_file"

echo "cron-session-reset: agent=$agent job_prefix=$job_prefix removed=$removed"
