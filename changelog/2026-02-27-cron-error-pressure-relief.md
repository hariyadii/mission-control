# cron-error-pressure-relief (2026-02-27)

## Entry 2026-02-27T15:54:00+07:00

Timestamp: 2026-02-27T15:54:00+07:00
Actor: codex
Task/Trigger: manual
Files Changed:
- (not specified)
Change Summary: Cleared recurring OPS CRITICAL caused by timeout-heavy cron lanes by disabling ops-task-worker-5m and sam-deploy-watchdog-15m (systemd ops lane remains authoritative).
Verification: openclaw cron list confirms both jobs enabled=false; scripts/autonomy-readiness-check.sh -> ready=yes active_cron_errors=0; scripts/handoff-health.sh -> GO.
Rollback Note: Re-enable disabled jobs with openclaw cron enable <id> after timeout and payload hardening; monitor readiness before leaving enabled.
Outcome: success
Lessons: Keep only one active ops executor topology (systemd or cron), not both; duplicate lanes create stale error pressure and false-critical loops.
Next Opening: Migrate deploy watchdog from agentTurn cron to systemd timer for deterministic execution without model timeout dependency.
Links:
- scope: mission-control

