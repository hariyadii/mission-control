# ops-claim-compatibility (2026-02-27)

## Entry 2026-02-27T14:07:26+07:00

Timestamp: 2026-02-27T14:07:26+07:00
Actor: codex
Task/Trigger: manual
Files Changed:
- (not specified)
Change Summary: Restored autonomy claim compatibility by routing alex claim path to pick ops backlog and avoiding updateTask(status) contract mismatch on live Convex runtime.
Verification: npm run -s build; POST /api/autonomy action=claim assignee=alex now returns task assigned_to=ops; POST /api/autonomy action=status shows opsExecutorHealthy=true and queue moving (backlog 6->4, in_progress 0->2).
Rollback Note: Revert commit to previous claim logic if Convex runtime is migrated and atomic status updateTask path is required.
Outcome: success
Lessons: Do not depend on local Convex mutation arg expansion unless production Convex functions are deployed in lockstep.
Next Opening: Deploy Convex function/schema updates and re-enable atomic claim mutation path safely.
Links:
- scope: mission-control

