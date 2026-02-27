#!/usr/bin/env bash
set -euo pipefail
API_URL="http://127.0.0.1:3001/api/autonomy"
MAX="${1:-20}"
MIN_AGE_MINUTES="${2:-180}"
RESP="$(curl -fsS -X POST "$API_URL" -H 'content-type: application/json' -d "{\"action\":\"validation_cleanup\",\"max\":$MAX,\"minAgeMinutes\":$MIN_AGE_MINUTES}")"
SCANNED="$(echo "$RESP" | jq -r '.scanned // 0')"
REQUEUED="$(echo "$RESP" | jq -r '.requeued // 0')"
SKIPPED="$(echo "$RESP" | jq -r '.skipped | length // 0')"
printf 'validation_cleanup scanned=%s requeued=%s skipped=%s marker=prompt_contract_aligned:true\n' "$SCANNED" "$REQUEUED" "$SKIPPED"
