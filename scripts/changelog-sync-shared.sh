#!/usr/bin/env bash
set -euo pipefail

TZ_NAME="Asia/Jakarta"
SHARED_DIR="/home/ubuntu/.openclaw/workspace/changelog/_shared"
INDEX_FILE="$SHARED_DIR/INDEX.md"
STATE_FILE="$SHARED_DIR/.sync-state.tsv"

declare -A ROOTS=(
  [alex]="/home/ubuntu/.openclaw/workspace/changelog"
  [sam]="/home/ubuntu/.openclaw/workspace-sam/changelog"
  [lyra]="/home/ubuntu/.openclaw/workspace-lyra/changelog"
  [nova]="/home/ubuntu/.openclaw/workspace-nova/changelog"
  [codex-mission-control]="/home/ubuntu/mission-control/changelog"
  [codex-openclaw]="/home/ubuntu/.openclaw/changelog"
)

mkdir -p "$SHARED_DIR"
touch "$STATE_FILE"

if [[ ! -f "$INDEX_FILE" ]]; then
  cat >"$INDEX_FILE" <<'EOF'
# Shared Changelog Index

| Synced At (WIB) | Actor | Source File | Summary |
|---|---|---|---|
EOF
fi

get_state_line() {
  local actor="$1"
  awk -F '\t' -v actor="$actor" '$1 == actor { print $0 }' "$STATE_FILE" | tail -n 1
}

write_state_line() {
  local actor="$1"
  local file="$2"
  local mtime="$3"
  local tmp
  tmp="$(mktemp)"
  awk -F '\t' -v actor="$actor" '$1 != actor { print $0 }' "$STATE_FILE" >"$tmp" || true
  printf "%s\t%s\t%s\n" "$actor" "$file" "$mtime" >>"$tmp"
  mv "$tmp" "$STATE_FILE"
}

summary_from_file() {
  local file="$1"
  local summary
  summary="$(awk '
    BEGIN { IGNORECASE=1; found=0; }
    /^Change Summary:/ {
      sub(/^[^:]*:[[:space:]]*/, "", $0);
      print $0;
      found=1;
    }
    END {
      if (!found) print "";
    }
  ' "$file" | tail -n 1)"
  if [[ -z "${summary// }" ]]; then
    summary="$(tail -n 40 "$file" | sed '/^[[:space:]]*$/d' | tail -n 1)"
  fi
  echo "${summary:-updated changelog entry}"
}

appended=0
sync_time="$(TZ="$TZ_NAME" date --iso-8601=seconds)"

for actor in "${!ROOTS[@]}"; do
  root="${ROOTS[$actor]}"
  if [[ ! -d "$root" ]]; then
    continue
  fi
  latest_file="$(find "$root" -maxdepth 1 -type f -regextype posix-extended -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+\.md' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
  if [[ -z "${latest_file:-}" ]]; then
    continue
  fi
  mtime="$(stat -c %Y "$latest_file")"
  previous="$(get_state_line "$actor")"
  prev_file="$(echo "$previous" | awk -F '\t' '{print $2}')"
  prev_mtime="$(echo "$previous" | awk -F '\t' '{print $3}')"
  if [[ "$latest_file" == "$prev_file" && "$mtime" == "$prev_mtime" ]]; then
    continue
  fi

  summary="$(summary_from_file "$latest_file" | tr '|' '/' | tr -d '\r')"
  printf "| %s | %s | \`%s\` | %s |\n" "$sync_time" "$actor" "$latest_file" "$summary" >>"$INDEX_FILE"
  write_state_line "$actor" "$latest_file" "$mtime"
  appended=$((appended + 1))
done

echo "ok=true"
echo "appended=${appended}"
echo "index=${INDEX_FILE}"
