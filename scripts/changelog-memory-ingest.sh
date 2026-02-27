#!/usr/bin/env bash
set -euo pipefail

TZ_NAME="Asia/Jakarta"
WINDOW_HOURS="${WINDOW_HOURS:-72}"
SHARED_DIR="/home/ubuntu/.openclaw/workspace/changelog/_shared"
STATE_FILE="$SHARED_DIR/.memory-ingest-state.tsv"
LEDGER_FILE="/home/ubuntu/.openclaw/workspace/memory/CHANGELOG_LEARNING_LEDGER.md"

mkdir -p "$SHARED_DIR"
touch "$STATE_FILE"

# actor -> changelog root
# shellcheck disable=SC2034
declare -A CHANGELOG_ROOTS=(
  [alex]="/home/ubuntu/.openclaw/workspace/changelog"
  [sam]="/home/ubuntu/.openclaw/workspace-sam/changelog"
  [lyra]="/home/ubuntu/.openclaw/workspace-lyra/changelog"
  [nova]="/home/ubuntu/.openclaw/workspace-nova/changelog"
  [codex-mission-control]="/home/ubuntu/mission-control/changelog"
  [codex-openclaw]="/home/ubuntu/.openclaw/changelog"
)

# actor -> workspace root that owns memory/YYYY-MM-DD.md
# codex entries are mirrored to alex memory so OpenClaw can recall codex-side lessons.
# shellcheck disable=SC2034
declare -A MEMORY_WORKSPACE_ROOTS=(
  [alex]="/home/ubuntu/.openclaw/workspace"
  [sam]="/home/ubuntu/.openclaw/workspace-sam"
  [lyra]="/home/ubuntu/.openclaw/workspace-lyra"
  [nova]="/home/ubuntu/.openclaw/workspace-nova"
  [codex-mission-control]="/home/ubuntu/.openclaw/workspace"
  [codex-openclaw]="/home/ubuntu/.openclaw/workspace"
)

# workspace root -> agent id for reindex
# shellcheck disable=SC2034
declare -A INDEX_AGENT_BY_ROOT=(
  ["/home/ubuntu/.openclaw/workspace"]="alex"
  ["/home/ubuntu/.openclaw/workspace-sam"]="sam"
  ["/home/ubuntu/.openclaw/workspace-lyra"]="lyra"
  ["/home/ubuntu/.openclaw/workspace-nova"]="nova"
)

if [[ ! -f "$LEDGER_FILE" ]]; then
  mkdir -p "$(dirname "$LEDGER_FILE")"
  cat >"$LEDGER_FILE" <<'MD'
# Changelog Learning Ledger

| Synced At (WIB) | Actor | Outcome | Lesson | Next Opening | Source |
|---|---|---|---|---|---|
MD
fi

state_key() {
  local actor="$1"
  local file="$2"
  printf "%s\t%s" "$actor" "$file"
}

state_get_mtime() {
  local actor="$1"
  local file="$2"
  awk -F '\t' -v actor="$actor" -v file="$file" '$1==actor && $2==file {print $3}' "$STATE_FILE" | tail -n1
}

state_put_mtime() {
  local actor="$1"
  local file="$2"
  local mtime="$3"
  local tmp
  tmp="$(mktemp)"
  awk -F '\t' -v actor="$actor" -v file="$file" '!( $1==actor && $2==file ) {print $0}' "$STATE_FILE" >"$tmp" || true
  printf "%s\t%s\t%s\n" "$actor" "$file" "$mtime" >>"$tmp"
  mv "$tmp" "$STATE_FILE"
}

extract_last_field() {
  local file="$1"
  local field="$2"
  awk -v field="$field" 'BEGIN { IGNORECASE=1; out="" }
    {
      line=$0
      pattern="^" field "[[:space:]]*:"
      if (line ~ pattern) {
        sub(pattern "[[:space:]]*", "", line)
        out=line
      }
    }
    END { print out }
  ' "$file"
}

sanitize_cell() {
  local value="${1:-}"
  value="${value//$'\r'/ }"
  value="${value//$'\n'/ }"
  value="${value//|//}"
  value="${value//  / }"
  echo "${value}"
}

declare -A REINDEX_ROOTS=()
entries_ingested=0

sync_ts="$(TZ="$TZ_NAME" date --iso-8601=seconds)"
today="$(TZ="$TZ_NAME" date +%F)"

for actor in "${!CHANGELOG_ROOTS[@]}"; do
  changelog_root="${CHANGELOG_ROOTS[$actor]}"
  workspace_root="${MEMORY_WORKSPACE_ROOTS[$actor]}"
  [[ -d "$changelog_root" ]] || continue
  [[ -n "$workspace_root" ]] || continue

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    mtime="$(stat -c %Y "$file")"
    prev_mtime="$(state_get_mtime "$actor" "$file")"
    if [[ "$prev_mtime" == "$mtime" ]]; then
      continue
    fi

    summary="$(extract_last_field "$file" "Change Summary")"
    outcome="$(extract_last_field "$file" "Outcome")"
    lessons="$(extract_last_field "$file" "Lessons")"
    next_opening="$(extract_last_field "$file" "Next Opening")"
    entry_ts="$(extract_last_field "$file" "Timestamp")"
    [[ -n "$entry_ts" ]] || entry_ts="$sync_ts"
    [[ -n "$summary" ]] || summary="(summary missing)"
    [[ -n "$outcome" ]] || outcome="partial"
    [[ -n "$lessons" ]] || lessons="(lesson missing)"
    [[ -n "$next_opening" ]] || next_opening="(next opening missing)"

    memory_dir="$workspace_root/memory"
    mkdir -p "$memory_dir"
    memory_file="$memory_dir/$today.md"

    {
      echo
      echo "## CHANGELOG_LEARNING ${entry_ts} [${actor}]"
      echo "- source: ${file}"
      echo "- summary: ${summary}"
      echo "- outcome: ${outcome}"
      echo "- lessons: ${lessons}"
      echo "- next_opening: ${next_opening}"
    } >>"$memory_file"

    printf "| %s | %s | %s | %s | %s | \`%s\` |\n" \
      "$sync_ts" \
      "$actor" \
      "$(sanitize_cell "$outcome")" \
      "$(sanitize_cell "$lessons")" \
      "$(sanitize_cell "$next_opening")" \
      "$file" >>"$LEDGER_FILE"

    state_put_mtime "$actor" "$file" "$mtime"
    REINDEX_ROOTS["$workspace_root"]=1
    entries_ingested=$((entries_ingested + 1))
  done < <(find "$changelog_root" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+\.md' -newermt "-${WINDOW_HOURS} hours" | sort)
done

reindexed=0
for workspace_root in "${!REINDEX_ROOTS[@]}"; do
  agent_id="${INDEX_AGENT_BY_ROOT[$workspace_root]:-}"
  [[ -n "$agent_id" ]] || continue
  if openclaw memory index --agent "$agent_id" --force >/dev/null 2>&1; then
    reindexed=$((reindexed + 1))
  fi
done

printf '{"ok":true,"entriesIngested":%d,"reindexedAgents":%d,"ledger":"%s"}\n' "$entries_ingested" "$reindexed" "$LEDGER_FILE"
