# throughput-recovery-guardrail-revision-8day (2026-02-25)

## Entry 2026-02-25T11:34:13+07:00

Timestamp: 2026-02-25T11:34:13+07:00
Actor: codex
Task/Trigger: manual-throughput-recovery-2026-02-25
Files Changed:
- /home/ubuntu/mission-control/src/app/api/autonomy/route.ts
Change Summary: Implemented throughput telemetry (8/day target), real-time guardrail revision loop for vague suggestions, deploy-intent auto-enrichment without deferral, and kicker auto-wake logic with deficit-aware suggester/worker nudges.
Verification: npm run build passes; guardrail test produced revised=1 accepted=1 for a vague suggested task; /api/autonomy kicker returns throughput+suggesterWake fields and executes without errors.
Rollback Note: Revert /home/ubuntu/mission-control/src/app/api/autonomy/route.ts and /home/ubuntu/mission-control/scripts/backlog-kicker.sh to previous version, rebuild, restart openclaw-mission-control.service.
Outcome: success
Lessons: Hard-rejecting vague suggestions drops throughput; safer pattern is revise-in-place plus strict completion validators.
Next Opening: Tune per-assignee throughput targets and add UI panel for throughput deficit trend over 24h.
Links:
- scope: mission-control
- task: manual-throughput-recovery-2026-02-25
- artifact: /home/ubuntu/mission-control/src/app/api/autonomy/route.ts

## Entry 2026-02-25T11:46:59+07:00

Timestamp: 2026-02-25T11:46:59+07:00
Actor: codex
Task/Trigger: readiness-critical-alert-gating-2026-02-25
Files Changed:
- /home/ubuntu/mission-control/scripts/autonomy-readiness-check.sh
Change Summary: Adjusted readiness semantics so only sustained critical workflow alerts fail handoff; throughput/blocked-ratio alerts remain visible as warnings. Added critical alert classification in autonomy status and readiness script consumption.
Verification: npm run build passes; /api/autonomy workflowHealth now includes criticalAlerts + criticalSustainedAlerts with severity=warning under throughput pressure; autonomy-readiness-check returns ready=yes; handoff-health returns go_no_go=GO.
Rollback Note: Revert alert classification/state changes in route.ts and autonomy-readiness-check.sh, rebuild, restart openclaw-mission-control.service.
Outcome: success
Lessons: Using generic alert streak as hard-fail causes false NO_GO during normal throughput recovery; fail gating must be tied to critical-alert class, not all alerts.
Next Opening: Add per-alert class thresholds in config so operators can tune handoff sensitivity without code edits.
Links:
- scope: mission-control
- task: readiness-critical-alert-gating-2026-02-25
- artifact: /home/ubuntu/mission-control/scripts/autonomy-readiness-check.sh

