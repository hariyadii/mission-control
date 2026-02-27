#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
ready=true
reasons=()

has_gh=true
auth_ok=true
scopes_ok=true
remote_ok=true
account="unknown"
scopes=""
origin_url=""

if ! command -v gh >/dev/null 2>&1; then
  has_gh=false
  auth_ok=false
  scopes_ok=false
  ready=false
  reasons+=("gh_missing")
else
  status_out="$(gh auth status 2>&1 || true)"
  if ! echo "$status_out" | grep -q "Logged in to github.com"; then
    auth_ok=false
    ready=false
    reasons+=("gh_auth_missing")
  fi

  account="$(echo "$status_out" | sed -n 's/.*Logged in to github.com account \([^[:space:]]*\).*/\1/p' | head -n1)"
  scopes="$(echo "$status_out" | sed -n "s/.*Token scopes: '\(.*\)'.*/\1/p" | head -n1)"

  if [[ "$scopes" != *repo* || "$scopes" != *workflow* ]]; then
    scopes_ok=false
    ready=false
    reasons+=("gh_scopes_missing_repo_or_workflow")
  fi
fi

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  remote_ok=false
  ready=false
  reasons+=("mission_control_not_git_repo")
else
  origin_url="$(git -C "$ROOT" remote get-url origin 2>/dev/null || true)"
  if [[ -z "$origin_url" ]]; then
    remote_ok=false
    ready=false
    reasons+=("git_origin_missing")
  else
    if ! timeout 15 git -C "$ROOT" ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
      remote_ok=false
      ready=false
      reasons+=("git_remote_unreachable")
    fi
  fi
fi

reason_text="none"
if (( ${#reasons[@]} > 0 )); then
  reason_text="$(IFS=';'; echo "${reasons[*]}")"
fi

echo "GITHUB_PREFLIGHT"
echo "timestamp=$(date -Iseconds)"
echo "ready=$ready"
echo "has_gh=$has_gh"
echo "auth_ok=$auth_ok"
echo "scopes_ok=$scopes_ok"
echo "remote_ok=$remote_ok"
echo "account=${account:-unknown}"
echo "scopes=${scopes:-unknown}"
echo "origin_url=${origin_url:-none}"
echo "reasons=$reason_text"

if [[ "$ready" == "true" ]]; then
  exit 0
fi
exit 1
