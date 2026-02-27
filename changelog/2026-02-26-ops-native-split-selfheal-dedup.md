# ops-native-split-selfheal-dedup (2026-02-26)

## Entry 2026-02-26T17:28:33+07:00

Timestamp: 2026-02-26T17:28:33+07:00
Actor: codex-mission-control
Task/Trigger: manual
Files Changed:
- /home/ubuntu/mission-control/src/app/api/autonomy/route.ts
Change Summary: Split ops into monitor+executor lanes, switched autonomy kicker/session-reset mapping to ops-task-worker-5m, added workflowHealth telemetry (opsExecutorHealthy, opsOpenIncidentTasks, lastAutoRemediationActionEffective), stabilized ops incident fingerprint/dedup behavior, and promoted sam-compounding-audit-3h to core self-heal class.
Verification: Build+restart passed; /api/autonomy now reports activeCronErrors=0, queueStallMinutes=0, opsExecutorHealthy=true, opsOpenIncidentTasks=1; kicker targets jobName=ops-task-worker-5m; cron-self-heal no longer marks sam-compounding-audit-3h as non-core.
Rollback Note: Revert route.ts + ops-autopilot.sh + cron-self-heal.sh changes, rename ops-autopilot-5m back to ops-worker-5m, remove ops-task-worker-5m, and restart mission-control service.
Outcome: success
Lessons: Incident fingerprint must avoid volatile counters; dedup gates should key on active incident tickets only; monitor and executor responsibilities must be split to prevent false recovery loops.
Next Opening: Add ops-task-worker throughput SLO checks and automated duplicate-incident consolidation mutation in a dedicated maintenance script.
Links:
- scope: mission-control
- artifact: /home/ubuntu/mission-control/src/app/api/autonomy/route.ts

