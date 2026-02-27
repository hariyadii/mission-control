# native-ops-assignee-convex-cutover (2026-02-25)

## Entry 2026-02-25T16:03:57+07:00

Timestamp: 2026-02-25T16:03:57+07:00
Actor: codex
Task/Trigger: manual
Files Changed:
- /home/ubuntu/mission-control/src/app/api/agent-task/route.ts
Change Summary: Deployed Convex runtime to joyous-squid-527 with ops-enabled task schema/functions, removed agent-task compatibility shim (ops->alex), restored ops remediation assignment in ops-autopilot, rebuilt and restarted Mission Control, and validated native ops create/claim/complete flows.
Verification: npx convex deploy succeeded; POST /api/agent-task assigned_to=ops returns assigned_to=ops; claim flow persisted owner=ops; complete flow finished with status=done validation=pass; /api/autonomy workflowHealth still exposes ops incident fields.
Rollback Note: Reintroduce one-line shim in src/app/api/agent-task/route.ts mapping ops->alex, rebuild/restart mission-control, keep ops loop running; if needed redeploy prior Convex commit.
Outcome: success
Lessons: Runtime schema drift must be resolved at Convex first; API shims should be temporary and removed immediately after backend parity is restored.
Next Opening: Observe 24h burn-in and verify ops remediation tickets are generated directly to assigned_to=ops under sustained critical incidents.
Links:
- scope: mission-control
- artifact: /home/ubuntu/mission-control/src/app/api/agent-task/route.ts

