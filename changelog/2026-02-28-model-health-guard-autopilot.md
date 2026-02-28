# model-health-guard-autopilot (2026-02-28)

## Entry 2026-02-28T01:22:44+07:00

Timestamp: 2026-02-28T01:22:44+07:00
Actor: codex-mission-control
Task/Trigger: manual
Files Changed:
- (not specified)
Change Summary: Added scripts/model-health-guard.sh and wired ops-autopilot.sh to run it each cycle; guard enforces MiniMax primary + known-good free fallbacks and auto-edits cron jobs pinned to blocked/deprecated models.
Verification: bash -n scripts/model-health-guard.sh; scripts/model-health-guard.sh | jq .; bash -n scripts/ops-autopilot.sh; ops-autopilot run shows model_guard_adjust action
Rollback Note: Remove scripts/model-health-guard.sh and revert ops-autopilot.sh hook; run openclaw cron edit on affected jobs if needed.
Outcome: success
Lessons: Model deprecations can persist in per-job payload overrides even when global defaults are correct; guard must inspect cron payload.model, not only model defaults.
Next Opening: Add a 24h model-failure trend metric from cron/session logs and alert only on sustained 4xx spikes.
Links:
- scope: mission-control

