#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3001}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

check_get() {
  local path="$1"
  local outfile="$2"
  local code
  code="$(curl -sS -m 12 -o "$outfile" -w "%{http_code}" "$BASE_URL$path")"
  if [[ "$code" != "200" ]]; then
    echo "smoke_fail path=$path code=$code"
    return 1
  fi
}

check_get "/" "$TMP_DIR/home.html"
check_get "/tasks" "$TMP_DIR/tasks.html"

AUTONOMY_CODE="$(curl -sS -m 12 -o "$TMP_DIR/autonomy.json" -w "%{http_code}" \
  -X POST "$BASE_URL/api/autonomy" \
  -H 'content-type: application/json' \
  -d '{"action":"status"}')"
if [[ "$AUTONOMY_CODE" != "200" ]]; then
  echo "smoke_fail path=/api/autonomy code=$AUTONOMY_CODE"
  exit 1
fi

DRAFTS_CODE="$(curl -sS -m 12 -o "$TMP_DIR/drafts.json" -w "%{http_code}" "$BASE_URL/api/drafts/status")"
if [[ "$DRAFTS_CODE" != "200" ]]; then
  echo "smoke_fail path=/api/drafts/status code=$DRAFTS_CODE"
  exit 1
fi

if ! jq -e '.ok == true and (.byStatus | type == "object")' "$TMP_DIR/autonomy.json" >/dev/null 2>&1; then
  echo "smoke_fail reason=autonomy_payload_invalid"
  exit 1
fi

if ! jq -e '.ok == true and (.items | type == "array")' "$TMP_DIR/drafts.json" >/dev/null 2>&1; then
  echo "smoke_fail reason=drafts_payload_invalid"
  exit 1
fi

echo "smoke_ok base=$BASE_URL"
