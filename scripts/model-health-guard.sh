#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR="/home/ubuntu/.openclaw/workspace/reports"
LOG_FILE="$REPORT_DIR/model-health-guard.log"
STATE_FILE="$REPORT_DIR/model-health-guard-state.json"
APPLY_CHANGES="${MODEL_GUARD_APPLY:-true}"

mkdir -p "$REPORT_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo '{"ok":false,"error":"jq_missing"}'
  exit 2
fi

timestamp="$(date -Iseconds)"

# Stable policy models (free-only fallbacks; primary remains paid MiniMax).
PRIMARY_MODEL="minimax/MiniMax-M2.5"
KNOWN_GOOD_FALLBACKS=(
  "openrouter/google/gemma-3-27b-it:free"
  "openrouter/openai/gpt-oss-20b:free"
  "openrouter/arcee-ai/trinity-large-preview:free"
  "openrouter/meta-llama/llama-3.3-70b-instruct:free"
)

# Models with repeated breakage/deprecation in this environment.
BLOCKED_MODELS=(
  "kilocode/z-ai/glm-5:free"
  "openrouter/stepfun/step-3.5-flash:free"
  "openrouter/openai/gpt-oss-120b:free"
)

json_escape() {
  jq -Rsa . <<<"$1"
}

contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

arr_json() {
  jq -cn '$ARGS.positional' --args "$@"
}

models_status_json="$(openclaw models status --json 2>/dev/null || echo '{}')"
cron_json="$(openclaw cron list --all --json 2>/dev/null || echo '{"jobs":[]}')"

current_primary="$(printf '%s' "$models_status_json" | jq -r '.defaultModel // ""')"
mapfile -t current_fallbacks < <(printf '%s' "$models_status_json" | jq -r '.fallbacks // [] | .[]')

removed_fallbacks=()
added_fallbacks=()
edited_cron_jobs=()
detected_blocked=()

# Remove blocked models from fallbacks if present.
for blocked in "${BLOCKED_MODELS[@]}"; do
  if contains "$blocked" "${current_fallbacks[@]}"; then
    detected_blocked+=("$blocked")
    if [[ "$APPLY_CHANGES" == "true" ]]; then
      if openclaw models fallbacks rm "$blocked" >/dev/null 2>&1; then
        removed_fallbacks+=("$blocked")
      fi
    fi
  fi

done

# Ensure known-good free fallbacks are present.
for wanted in "${KNOWN_GOOD_FALLBACKS[@]}"; do
  if ! contains "$wanted" "${current_fallbacks[@]}"; then
    if [[ "$APPLY_CHANGES" == "true" ]]; then
      if openclaw models fallbacks add "$wanted" >/dev/null 2>&1; then
        added_fallbacks+=("$wanted")
      fi
    fi
  fi

done

# Fix enabled cron jobs pinned to blocked models.
while IFS= read -r job; do
  [[ -z "$job" ]] && continue
  id="$(printf '%s' "$job" | jq -r '.id')"
  name="$(printf '%s' "$job" | jq -r '.name')"
  model="$(printf '%s' "$job" | jq -r '.payload.model // ""')"
  enabled="$(printf '%s' "$job" | jq -r '.enabled // false')"
  if [[ "$enabled" != "true" || -z "$model" ]]; then
    continue
  fi

  if contains "$model" "${BLOCKED_MODELS[@]}"; then
    detected_blocked+=("$model")
    if [[ "$APPLY_CHANGES" == "true" ]]; then
      if openclaw cron edit "$id" --model "$PRIMARY_MODEL" >/dev/null 2>&1; then
        edited_cron_jobs+=("$name:$id:$model->$PRIMARY_MODEL")
      fi
    fi
  fi

done < <(printf '%s' "$cron_json" | jq -c '.jobs[]')

# Ensure primary stays on MiniMax unless explicitly changed by operator.
primary_reset=false
if [[ "$current_primary" != "$PRIMARY_MODEL" && "$APPLY_CHANGES" == "true" ]]; then
  if openclaw models set "$PRIMARY_MODEL" >/dev/null 2>&1; then
    primary_reset=true
  fi
fi

# Gather final status after optional mutations.
final_status_json="$(openclaw models status --json 2>/dev/null || echo '{}')"
mapfile -t final_fallbacks < <(printf '%s' "$final_status_json" | jq -r '.fallbacks // [] | .[]')
final_primary="$(printf '%s' "$final_status_json" | jq -r '.defaultModel // ""')"

# Infer whether model-related 4xx was seen recently from cron state.
recent_model_4xx_count="$(printf '%s' "$cron_json" | jq -r '[.jobs[] | select(.enabled==true) | (.state.lastError // .state.lastDeliveryError // "") | ascii_downcase | select(test("alpha period|model has ended|model not found|unknown model|404"))] | length')"

summary="$(jq -cn \
  --arg timestamp "$timestamp" \
  --arg apply "$APPLY_CHANGES" \
  --arg initialPrimary "$current_primary" \
  --arg finalPrimary "$final_primary" \
  --argjson primaryReset "$primary_reset" \
  --argjson recentModel4xxCount "${recent_model_4xx_count:-0}" \
  --argjson removedFallbacks "$(arr_json "${removed_fallbacks[@]}")" \
  --argjson addedFallbacks "$(arr_json "${added_fallbacks[@]}")" \
  --argjson editedCronJobs "$(arr_json "${edited_cron_jobs[@]}")" \
  --argjson blockedDetected "$(arr_json "${detected_blocked[@]}" | jq -c 'unique')" \
  --argjson finalFallbacks "$(arr_json "${final_fallbacks[@]}")" \
  '{timestamp:$timestamp,apply:($apply=="true"),initialPrimary:$initialPrimary,finalPrimary:$finalPrimary,primaryReset:$primaryReset,recentModel4xxCount:$recentModel4xxCount,blockedDetected:$blockedDetected,removedFallbacks:$removedFallbacks,addedFallbacks:$addedFallbacks,editedCronJobs:$editedCronJobs,finalFallbacks:$finalFallbacks}')"

printf '%s\n' "$summary" >> "$LOG_FILE"
printf '%s\n' "$summary" > "$STATE_FILE"
printf '%s\n' "$summary"
