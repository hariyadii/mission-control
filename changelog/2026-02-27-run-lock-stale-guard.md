# run-lock-stale-guard (2026-02-27)

## Entry 2026-02-27T15:56:30+07:00

Timestamp: 2026-02-27T15:56:30+07:00
Actor: codex
Task/Trigger: manual
Files Changed:
- (not specified)
Change Summary: Added stale run-lock filtering in /api/autonomy status so stale runningAtMs artifacts no longer inflate over-budget lock counts or trigger false critical perception.
Verification: npm run -s build passed; /api/autonomy status now reports runLocksCount with only active/in-budget locks and no stale overBudget artifacts; readiness remains yes with activeCronErrors=0.
Rollback Note: Revert commit if full historical lock visibility is required for forensic debugging.
Outcome: success
Lessons: Scheduler state can keep stale running markers; health/UI logic must treat locks as active only when plausibly live.
Next Opening: Optionally expose staleLockCount separately for forensic diagnostics without polluting operator-critical lock panels.
Links:
- scope: mission-control

