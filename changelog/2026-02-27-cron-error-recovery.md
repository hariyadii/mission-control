# 2026-02-27 — Cron Error Recovery

## Timestamp
2026-02-27T23:34+07:00

## Actor
User + Gemini (antigravity)

## Task/Trigger
OPS CRITICAL Telegram alerts: `enabled_errors=9`, `active_cron_errors=5`, `state=critical`, `ready=no`.

## Root Cause
MiniMax M2.5 alpha period ended → `404 "The alpha period for this model has ended."` across multiple cron jobs.
User rotated MiniMax API key and removed deprecated model entries before this fix.

## Files Changed
- `/home/ubuntu/.openclaw/cron/jobs.json` (via `openclaw cron disable` / `openclaw cron run`)

## Change Summary
1. **Disabled** stale burn-in job `upgrade-burnin-hourly-20260226` (5 consecutive errors, no longer needed).
2. **Manually triggered** `alex-guardrail-20m` via `openclaw cron run` to clear its 7-consecutive-error stuck state (self-heal threshold is ≥3, so it wouldn't auto-retry).
3. Remaining 3 low-error jobs (`plugin-health-dashboard-15m`, `sam-changelog-sync-3h`, `sam-changelog-memory-ingest-3h`) at 1 consecutive error each — will self-heal on next scheduled run.

## Verification
- `alex-guardrail-20m`: `openclaw cron run` returned `{"ok":true,"ran":true}`, error counter cleared.
- `upgrade-burnin-hourly-20260226`: confirmed `enabled: false` after disable.
- Post-fix: enabled error jobs reduced from 6 → 3 (all at consecutiveErrors=1).

## Rollback Note
- Re-enable burn-in job: `openclaw cron enable 1dcbc649-37df-4ca1-b23b-354fc7e0c650`
- No code changes; all actions were cron state management via CLI.

## Outcome
success

## Lessons
- Jobs with ≥3 consecutive errors get stuck past `cron-self-heal.sh` retry threshold — manual `openclaw cron run` is needed.
- Stale test/burn-in jobs should be disabled promptly after their purpose is served.

## Next Opening
- Monitor next scheduled runs of remaining 3 error jobs to confirm self-heal.
- Consider adding auto-disable for burn-in jobs after N days.

## Links
- Protocol: OPERATIONAL PROTOCOL: OPENCLAW (Priority A: CLI commands first)
