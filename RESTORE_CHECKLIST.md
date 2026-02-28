# Restore Checklist

Use this checklist when recovering Mission Control after a bad deploy or host issue.

## 1) Identify latest backup
1. `ls -la /home/ubuntu/backups/openclaw`
2. `readlink -f /home/ubuntu/backups/openclaw/latest`

## 2) Verify backup integrity
1. `cd /home/ubuntu/backups/openclaw/latest`
2. `sha256sum -c SHA256SUMS`
3. `tar -tzf openclaw-state.tgz >/dev/null`

## 3) Stop active services
1. `systemctl --user stop openclaw-mission-control.service`
2. `systemctl --user stop openclaw-gateway.service`

## 4) Restore files
1. `cd /`
2. `tar -xzf /home/ubuntu/backups/openclaw/latest/openclaw-state.tgz`

## 5) Restart services
1. `systemctl --user start openclaw-gateway.service`
2. `systemctl --user start openclaw-mission-control.service`

## 6) Verify health
1. `openclaw health`
2. `curl -s -X POST http://127.0.0.1:3001/api/autonomy -H 'content-type: application/json' -d '{"action":"status"}'`
3. `/home/ubuntu/mission-control/scripts/deploy-smoke.sh`

## 7) Optional rollback to previous web build only
1. `/home/ubuntu/mission-control/scripts/deploy-rollback.sh`

## 8) Post-restore checks
1. Confirm cron status:
   `openclaw cron list --all --json`
2. Confirm draft gate endpoint:
   `curl -s http://127.0.0.1:3001/api/drafts/status`
3. Confirm Telegram notifications still work from Alex.
