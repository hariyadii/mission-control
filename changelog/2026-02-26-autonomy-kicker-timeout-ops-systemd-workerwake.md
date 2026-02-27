# autonomy-kicker-timeout-ops-systemd-workerwake (2026-02-26)

## Entry 2026-02-26T22:31:03+07:00

Timestamp: 2026-02-26T22:31:03+07:00
Actor: codex
Task/Trigger: manual
Files Changed:
- /home/ubuntu/mission-control/src/app/api/autonomy/route.ts
Change Summary: Increased kicker wake timeouts and added ops systemd worker fallback when ops cron job is absent, preventing false wake failures and aligning with systemd ops topology.
Verification: Built and deployed mission-control; kicker no longer fails on short timeout path; readiness stayed healthy with activeCronErrors=0 in status snapshot.
Rollback Note: Revert /home/ubuntu/mission-control/src/app/api/autonomy/route.ts and redeploy-safe.
Outcome: success
Lessons: Do not keep legacy cron wake assumptions once an assignee lane has moved to systemd timers.
Next Opening: Replace remaining ops cron references and add direct systemd health/wake abstraction in one utility function.
Links:
- scope: mission-control
- artifact: /home/ubuntu/mission-control/src/app/api/autonomy/route.ts

