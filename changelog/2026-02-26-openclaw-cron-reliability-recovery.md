# openclaw-cron-reliability-recovery (2026-02-26)

## Entry 2026-02-26T18:40:14+07:00

Timestamp: 2026-02-26T18:40:14+07:00
Actor: codex
Task/Trigger: ops-recovery-2026-02-26
Files Changed:
- /home/ubuntu/.openclaw/cron/jobs.json
Change Summary: Stabilized OpenClaw cron ecosystem: disabled failing noncritical jobs, retuned ops/sam worker schedules+timeouts+model routing, and patched cron-self-heal to suppress automatic gateway restart loops by default.
Verification: openclaw health=Telegram/Discord ok; enabled cron error set reduced to 0 before safe ops-worker re-enable; /api/autonomy workflowHealth.activeCronErrors=0
Rollback Note: Re-enable disabled jobs by id and restore prior cron model/timeout settings via openclaw cron edit/enable; revert cron-self-heal.sh restart suppression block.
Outcome: success
Lessons: Self-heal scripts that can restart gateway must be guard-railed; aggressive auto-restart can create false instability and block recovery commands.
Next Opening: Refactor ops-task-worker into script-driven minimal mode to avoid long agentTurn model dependency and reduce timeout risk.
Links:
- scope: mission-control
- task: ops-recovery-2026-02-26
- artifact: /home/ubuntu/.openclaw/cron/jobs.json

## Entry 2026-02-26T18:40:59+07:00

Timestamp: 2026-02-26T18:40:59+07:00
Actor: codex
Task/Trigger: ops-recovery-2026-02-26-2
Files Changed:
- /home/ubuntu/.openclaw/cron/jobs.json
Change Summary: Contained persistent timeout loops by disabling unstable ops lanes (ops-autopilot-5m and ops-task-worker-5m) after repeated failures; maintained healthy core channels and zero enabled cron errors.
Verification: openclaw health ok; /api/autonomy workflowHealth.activeCronErrors=0; no enabled cron jobs in error state
Rollback Note: Re-enable both ops cron ids after replacing agentTurn-heavy payloads with script-first lightweight jobs and validated timeout budgets.
Outcome: partial
Lessons: A degraded-but-stable posture is preferable to autonomous restart loops; ops lanes should be reintroduced with deterministic script workers.
Next Opening: Implement dedicated script-only ops monitor/worker pair with system-event or lightweight exec wrapper to avoid LLM timeout dependency.
Links:
- scope: mission-control
- task: ops-recovery-2026-02-26-2
- artifact: /home/ubuntu/.openclaw/cron/jobs.json

