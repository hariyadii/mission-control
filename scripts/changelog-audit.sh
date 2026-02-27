#!/usr/bin/env bash
set -euo pipefail

TZ_NAME="Asia/Jakarta"
WINDOW_MINUTES="${WINDOW_MINUTES:-180}"
REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
LOG_FILE="$REPORT_DIR/changelog-audit.log"
AUTONOMY_API="http://127.0.0.1:3001/api/agent-task"

today="$(TZ="$TZ_NAME" date +%F)"
timestamp="$(TZ="$TZ_NAME" date --iso-8601=seconds)"
window_ref="-${WINDOW_MINUTES} minutes"

declare -A ROOT_TO_CHANGELOG=(
  ["/home/ubuntu/mission-control"]="/home/ubuntu/mission-control/changelog"
  ["/home/ubuntu/.openclaw"]="/home/ubuntu/.openclaw/changelog"
  ["/home/ubuntu/.openclaw/workspace"]="/home/ubuntu/.openclaw/workspace/changelog"
  ["/home/ubuntu/.openclaw/workspace-sam"]="/home/ubuntu/.openclaw/workspace-sam/changelog"
  ["/home/ubuntu/.openclaw/workspace-lyra"]="/home/ubuntu/.openclaw/workspace-lyra/changelog"
  ["/home/ubuntu/.openclaw/workspace-nova"]="/home/ubuntu/.openclaw/workspace-nova/changelog"
)

mkdir -p "$REPORT_DIR"

list_recent_feature_files() {
  local root="$1"
  find "$root" -maxdepth 1 -type f -newermt "$window_ref" \
    ! -path "*/node_modules/*" \
    ! -path "*/.git/*" \
    ! -path "*/.next/*" \
    ! -path "*/changelog/*" \
    ! -path "*/reports/*" \
    ! -path "*/logs/*" \
    ! -path "*/cache/*" \
    ! -path "*/tmp/*" \
    ! -path "*/autonomy/drafts/*" \
    ! -path "*/autonomy/executions/*" \
    ! -path "*/autonomy/plugins/*" \
    ! -path "*/autonomy/metrics/*" \
    ! -path "*/autonomy/capital/*" \
    ! -path "*/autonomy/memory/*" \
    ! -path "*/agents/*/sessions/*" \
    ! -path "*/agents/*/qmd/xdg-cache/*" \
    ! -path "*/artifacts/*" \
    ! -path "*/identity/*" \
    ! -path "*/cron/*" \
    ! -name "update-check.json" \
    ! -name "sessions.json" \
    ! -name "auth-profiles.json" \
    ! -name "device-auth.json" \
    ! -name "jobs.json" \
    ! -name "*.jsonl" \
    ! -name "index.sqlite*" \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.mjs" -o -name "*.cjs" -o \
       -name "*.py" -o -name "*.sh" -o -name "*.json" -o -name "*.yml" -o -name "*.yaml" -o -name "*.md" -o \
       -name "*.css" -o -name "*.scss" -o -name "*.html" \) 2>/dev/null
}

violations=0
details=""
for root in "${!ROOT_TO_CHANGELOG[@]}"; do
  [[ -d "$root" ]] || continue
  changelog_dir="${ROOT_TO_CHANGELOG[$root]}"
  recent_count="$(list_recent_feature_files "$root" | wc -l | tr -d ' ')"
  [[ "$recent_count" -gt 0 ]] || continue
  mkdir -p "$changelog_dir"
  today_count="$(find "$changelog_dir" -maxdepth 1 -type f -name "${today}-*.md" | wc -l | tr -d ' ')"
  if [[ "$today_count" -eq 0 ]]; then
    violations=$((violations + 1))
    details+="${root}:recent=${recent_count};changelog_today=0"$'\n'
  fi
done

created_task="false"
if [[ "$violations" -gt 0 ]]; then
  intent_window="$(TZ="$TZ_NAME" date '+%Y-%m-%dT%H:00:00%:z')"
  idem_key="changelog-audit-${today}-$(TZ="$TZ_NAME" date +%H)"
  title="Changelog remediation: missing daily coverage (${today})"
  description=$(
    cat <<EOF
Detected changelog coverage violations in last ${WINDOW_MINUTES} minutes.

${details}
Required action:
- Create/update changelog entries using /home/ubuntu/mission-control/scripts/changelog-write.sh
- Re-run /home/ubuntu/mission-control/scripts/changelog-audit.sh until violations=0
EOF
  )
  payload="$(jq -nc \
    --arg title "$title" \
    --arg description "$description" \
    --arg window "$intent_window" \
    --arg idem "$idem_key" \
    '{title:$title,description:$description,assigned_to:"sam",status:"backlog",intent_window:$window,idempotency_key:$idem}')"
  response="$(curl -sS -X POST "$AUTONOMY_API" -H "content-type: application/json" -d "$payload" || true)"
  echo "${response}" >/tmp/changelog-audit-task.json
  if echo "$response" | jq -e '.ok == true' >/dev/null 2>&1; then
    if echo "$response" | jq -e '.deduped == true' >/dev/null 2>&1; then
      created_task="false"
    else
      created_task="true"
    fi
  fi
fi

json="$(jq -nc \
  --arg ts "$timestamp" \
  --argjson violations "$violations" \
  --arg details "$details" \
  --arg created_task "$created_task" \
  '{timestamp:$ts, violations:$violations, details:$details, remediationTaskCreated:($created_task=="true")}')"

echo "$json" >>"$LOG_FILE"
echo "$json"
