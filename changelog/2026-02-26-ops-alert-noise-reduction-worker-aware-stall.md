# ops-alert-noise-reduction-worker-aware-stall (2026-02-26)

## Entry 2026-02-26T17:54:32+07:00

Timestamp: 2026-02-26T17:54:32+07:00
Actor: codex-mission-control
Task/Trigger: manual
Files Changed:
- /home/ubuntu/mission-control/src/app/api/autonomy/route.ts
Change Summary: Adjusted workflow blocked ratio alerting to use actionable blocked tasks only (ignore duplicate_incident_ticket and validation_contract_mismatch; keep blockedRatioRaw for visibility). Added worker-activity-aware stall semantics in autonomy-readiness-check and ops-autopilot so backlog stall is not counted while worker crons are actively running within timeout budget.
Verification: POST /api/autonomy status now shows alerts=[] with blockedRatio=0 and blockedRatioRaw retained; readiness check returns ready=yes severity=none healthy_worker_activity=true; ops-autopilot returns state=normal ready=yes queueStallMinutes=0 handoff=GO.
Rollback Note: Revert route.ts and script changes, rebuild mission-control service, and restore previous stall semantics/blocked ratio logic.
Outcome: success
Lessons: Blocked placeholders used for control-flow (dedup/validation loop) should not drive operational blockage alerts. Stall detection must include scheduler activity, not only task state snapshots.
Next Opening: Add per-assignee actionable-blocked counters and auto-remediation for chronic validation_contract_mismatch blockers.
Links:
- scope: mission-control
- artifact: /home/ubuntu/mission-control/src/app/api/autonomy/route.ts

## Entry 2026-02-26T17:55:47+07:00

Timestamp: 2026-02-26T17:55:47+07:00
Actor: codex-mission-control
Task/Trigger: manual
Files Changed:
- /home/ubuntu/mission-control/src/app/api/autonomy/route.ts
Change Summary: Refined opsExecutorHealthy scheduler logic: treat in-budget active ops-task-worker runs as healthy even if previous run timed out, preventing false unhealthy state during active recovery.
Verification: POST /api/autonomy status now reports opsExecutorHealthy=true with in_progress=1 and opsIncidentState=normal while workflowHealth.severity=none.
Rollback Note: Revert getCronJobHealthByName/opsExecutorHealthy logic in route.ts and restart mission-control service.
Outcome: success
Lessons: Worker health should account for current runtime state, not just previous terminal status.
Next Opening: Add per-job recovery phase indicator to distinguish retrying/running/failed in workflowHealth.
Links:
- scope: mission-control
- artifact: /home/ubuntu/mission-control/src/app/api/autonomy/route.ts

