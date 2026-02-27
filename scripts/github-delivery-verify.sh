#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
TMP_JSON="$(mktemp)"
ENFORCEMENT_START_FILE="/home/ubuntu/.openclaw/workspace/reports/github-enforcement-start.txt"
trap 'rm -f "$TMP_JSON"' EXIT

cd "$ROOT"
npx convex run --prod tasks:list '{}' > "$TMP_JSON"

mkdir -p "$(dirname "$ENFORCEMENT_START_FILE")"
if [[ ! -s "$ENFORCEMENT_START_FILE" ]]; then
  date -Iseconds > "$ENFORCEMENT_START_FILE"
fi
enforcement_start_iso="$(tr -d '\r' < "$ENFORCEMENT_START_FILE" | head -n1)"
enforcement_start_epoch="$(python3 - <<'PY' "$enforcement_start_iso"
import datetime, sys
raw = (sys.argv[1] or "").strip()
try:
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    dt = datetime.datetime.fromisoformat(raw)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    print(int(dt.timestamp()))
except Exception:
    print(0)
PY
)"

report="$(jq -r '
  def code_task:
    ((.title // "") + "\n" + (.description // "") + "\n" + (.artifact_path // "")) as $blob
    | ($blob | ascii_downcase) as $lower
    | (
        ($lower | test("build|deploy|fix|feature|refactor|pipeline|api|worker|script|automation|frontend|backend|mission control|ui"))
        or ((.artifact_path // "") | test("\\.(ts|tsx|js|jsx|mjs|cjs|py|sh|go|rs)$"; "i"))
        or ((.artifact_path // "") | test("/mission-control/"))
      );

  def fieldval($name):
    ([((.description // "") | capture("(?mi)^" + $name + ":\\s*(?<v>.+)$").v)] | .[0]) // "";

  def has_repo($repo):
    ($repo | test("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"));
  def has_branch($branch):
    ($branch | test("^[A-Za-z0-9._\\-/]{3,200}$"));
  def has_commit($commit):
    ($commit | test("^[a-f0-9]{7,40}$"; "i"));
  def has_pr_url($url):
    ($url | test("^https://github\\.com/[^/\\s]+/[^/\\s]+/pull/[0-9]+$"; "i"));
  def has_push_ref($ref):
    ($ref | test("^refs/heads/[A-Za-z0-9._\\-/]{2,200}$"));

  def gh_record:
    {
      id: (.["_id"] // "" | tostring),
      title: (.title // "untitled"),
      mode: (fieldval("github_mode") | ascii_downcase),
      repo: fieldval("github_repo"),
      branch: fieldval("github_branch"),
      commit: fieldval("github_commit"),
      pr_url: fieldval("github_pr_url"),
      push_ref: fieldval("github_push_ref"),
      skip_reason: fieldval("github_skipped_reason"),
      direct_justification: fieldval("direct_push_justification")
    };

  def mode_ok:
    if .mode == "pr" then
      (has_repo(.repo) and has_branch(.branch) and has_commit(.commit) and has_pr_url(.pr_url))
    elif .mode == "direct_push" then
      (has_repo(.repo) and has_branch(.branch) and has_commit(.commit) and has_push_ref(.push_ref) and ((.direct_justification | length) >= 8))
    elif .mode == "skipped" then
      ((.skip_reason | length) >= 6)
    else
      false
    end;

  # Validate the newest done code-task records to avoid stale history bias.
  # Rollout gate: only evaluate tasks created after enforcement start.
  ([ .[]
     | select(.status == "done")
     | select(((.created_at | fromdateiso8601?) // 0) >= $enforcement_start_epoch)
     | select(code_task)
   ] | sort_by(.created_at) | reverse | .[:80]) as $candidates
  |
  ($candidates | map(gh_record)) as $records
  |
  ($records | map(. + {ok: (. | mode_ok)})) as $evaluated
  |
  ($evaluated | map(select(.ok)) | length) as $pass
  |
  ($evaluated | map(select(.ok | not)) | length) as $fail
  |
  {
    total_candidates: ($evaluated | length),
    pass: $pass,
    fail: $fail,
    fail_ratio: (if ($evaluated | length) == 0 then 0 else (($fail / ($evaluated | length)) * 1.0) end),
    reasons: ($evaluated | map(select(.ok | not) | (.title + ":" + (if .mode == "" then "missing" else .mode end))))
  }
' --argjson enforcement_start_epoch "${enforcement_start_epoch:-0}" "$TMP_JSON")"

total="$(echo "$report" | jq -r '.total_candidates')"
pass="$(echo "$report" | jq -r '.pass')"
fail="$(echo "$report" | jq -r '.fail')"
fail_ratio="$(echo "$report" | jq -r '.fail_ratio')"
reasons="$(echo "$report" | jq -r '.reasons | join(";")')"

echo "GITHUB_DELIVERY_VERIFY"
echo "timestamp=$(date -Iseconds)"
echo "enforcement_start=$enforcement_start_iso"
echo "total_candidates=$total"
echo "pass=$pass"
echo "fail=$fail"
echo "fail_ratio=$fail_ratio"
echo "reasons=${reasons:-none}"

if (( fail == 0 )); then
  exit 0
fi
exit 1
