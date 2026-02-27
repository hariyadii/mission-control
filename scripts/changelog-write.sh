#!/usr/bin/env bash
set -euo pipefail

TZ_NAME="Asia/Jakarta"
DEFAULT_ROOT="/home/ubuntu/.openclaw/workspace/changelog"

actor=""
feature=""
scope=""
summary=""
verification=""
rollback=""
task_id=""
artifact_path=""
root="$DEFAULT_ROOT"
outcome="success"
lessons="No critical lesson recorded."
next_opening="Continue current direction."

usage() {
  cat <<'EOF'
Usage: changelog-write.sh --actor <name> --feature <slug-or-title> --summary <text> --verification <text> --rollback <text> [options]

Options:
  --scope <text>          Optional scope tag (e.g. mission-control)
  --task-id <id>          Optional task id
  --artifact-path <path>  Optional changed file or artifact path
  --root <path>           Changelog directory root (default: /home/ubuntu/.openclaw/workspace/changelog)
  --outcome <value>       success | dead_end | partial (default: success)
  --lessons <text>        Lesson learned to avoid repeat failures
  --next-opening <text>   Next direction to try
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --actor) actor="${2:-}"; shift 2 ;;
    --feature) feature="${2:-}"; shift 2 ;;
    --scope) scope="${2:-}"; shift 2 ;;
    --summary) summary="${2:-}"; shift 2 ;;
    --verification) verification="${2:-}"; shift 2 ;;
    --rollback) rollback="${2:-}"; shift 2 ;;
    --task-id) task_id="${2:-}"; shift 2 ;;
    --artifact-path) artifact_path="${2:-}"; shift 2 ;;
    --root) root="${2:-}"; shift 2 ;;
    --outcome) outcome="${2:-}"; shift 2 ;;
    --lessons) lessons="${2:-}"; shift 2 ;;
    --next-opening) next_opening="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$actor" || -z "$feature" || -z "$summary" || -z "$verification" || -z "$rollback" ]]; then
  echo "Missing required arguments." >&2
  usage
  exit 1
fi

outcome_norm="$(echo "$outcome" | tr '[:upper:]' '[:lower:]' | tr ' ' '_' | sed -E 's/[^a-z_]+//g')"
case "$outcome_norm" in
  success|dead_end|partial) ;;
  *) outcome_norm="success" ;;
esac

slug="$(
  echo "$feature" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g'
)"
if [[ -z "$slug" ]]; then
  slug="featurechange"
fi

today="$(TZ="$TZ_NAME" date +%F)"
timestamp="$(TZ="$TZ_NAME" date --iso-8601=seconds)"
mkdir -p "$root"
file_path="$root/${today}-${slug}.md"

if [[ ! -f "$file_path" ]]; then
  cat >"$file_path" <<EOF
# ${slug} (${today})

EOF
fi

{
  echo "## Entry ${timestamp}"
  echo
  echo "Timestamp: ${timestamp}"
  echo "Actor: ${actor}"
  if [[ -n "$task_id" ]]; then
    echo "Task/Trigger: ${task_id}"
  else
    echo "Task/Trigger: manual"
  fi
  echo "Files Changed:"
  if [[ -n "$artifact_path" ]]; then
    echo "- ${artifact_path}"
  else
    echo "- (not specified)"
  fi
  echo "Change Summary: ${summary}"
  echo "Verification: ${verification}"
  echo "Rollback Note: ${rollback}"
  echo "Outcome: ${outcome_norm}"
  echo "Lessons: ${lessons}"
  echo "Next Opening: ${next_opening}"
  echo "Links:"
  if [[ -n "$scope" ]]; then
    echo "- scope: ${scope}"
  fi
  if [[ -n "$task_id" ]]; then
    echo "- task: ${task_id}"
  fi
  if [[ -n "$artifact_path" ]]; then
    echo "- artifact: ${artifact_path}"
  fi
  echo
} >>"$file_path"

echo "ok=true"
echo "changelog_path=${file_path}"
echo "changelog_feature=${slug}"
