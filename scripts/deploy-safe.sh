#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/ubuntu/mission-control"
DEPLOY_DIR="$ROOT/.deploy"
TS_ID="$(date +%Y%m%d-%H%M%S)"
TS_ISO="$(date -Iseconds)"
BUILD_LOG="$DEPLOY_DIR/logs/build-$TS_ID.log"
SMOKE_LOG="$DEPLOY_DIR/logs/smoke-$TS_ID.log"
PREBUILD_ARCHIVE="$DEPLOY_DIR/prebuild-next-$TS_ID.tgz"

cd "$ROOT"
mkdir -p "$DEPLOY_DIR/logs"

if [[ -d ".next" ]]; then
  tar -czf "$PREBUILD_ARCHIVE" .next
fi

if ! npm run build >"$BUILD_LOG" 2>&1; then
  cat > "$DEPLOY_DIR/last-deploy.json" <<EOF
{
  "status": "build_failed",
  "deployedAt": "$TS_ISO",
  "buildLog": "$BUILD_LOG"
}
EOF
  echo "safe_deploy_fail reason=build_failed log=$BUILD_LOG"
  exit 1
fi

systemctl --user restart openclaw-mission-control.service
sleep 2

if ! "$ROOT/scripts/deploy-smoke.sh" >"$SMOKE_LOG" 2>&1; then
  if [[ -f "$PREBUILD_ARCHIVE" ]]; then
    "$ROOT/scripts/deploy-rollback.sh" "$PREBUILD_ARCHIVE" >> "$DEPLOY_DIR/logs/deploy.log" 2>&1 || true
  fi
  cat > "$DEPLOY_DIR/last-deploy.json" <<EOF
{
  "status": "rollback_after_smoke_fail",
  "deployedAt": "$TS_ISO",
  "buildLog": "$BUILD_LOG",
  "smokeLog": "$SMOKE_LOG",
  "rollbackArchive": "$PREBUILD_ARCHIVE"
}
EOF
  echo "safe_deploy_fail reason=smoke_failed rollback=attempted log=$SMOKE_LOG"
  exit 1
fi

tar -czf "$DEPLOY_DIR/last-good-next.tgz" .next
find "$DEPLOY_DIR" -maxdepth 1 -type f -name 'prebuild-next-*.tgz' -mtime +14 -delete

cat > "$DEPLOY_DIR/last-deploy.json" <<EOF
{
  "status": "ok",
  "deployedAt": "$TS_ISO",
  "buildLog": "$BUILD_LOG",
  "smokeLog": "$SMOKE_LOG",
  "service": "openclaw-mission-control.service"
}
EOF

echo "safe_deploy_ok deployedAt=$TS_ISO"
