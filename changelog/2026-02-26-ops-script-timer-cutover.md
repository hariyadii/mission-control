# ops-script-timer-cutover (2026-02-26)

## Entry 2026-02-26T18:45:30+07:00

Timestamp: 2026-02-26T18:45:30+07:00
Actor: codex
Task/Trigger: ops-cutover-2026-02-26
Files Changed:
- /home/ubuntu/.config/systemd/user/openclaw-ops-monitor.timer
Change Summary: Implemented deterministic ops automation via systemd timers (monitor every 5m and worker every 10m) using script-first cycles with lock/timeout guards; replaced unstable agentTurn ops lanes.
Verification: systemctl user timers active; monitor and worker services executed successfully; logs show status=ok; /api/autonomy activeCronErrors=0 and queue progressing.
Rollback Note: Disable timers openclaw-ops-monitor.timer and openclaw-ops-worker.timer, then re-enable original ops cron jobs if needed.
Outcome: success
Lessons: Ops reliability loops should be deterministic shell services; model-backed agentTurn should not own watchdog-critical controls.
Next Opening: Migrate opsExecutorHealthy metric to include systemd-based ops lane health instead of only cron job health.
Links:
- scope: mission-control
- task: ops-cutover-2026-02-26
- artifact: /home/ubuntu/.config/systemd/user/openclaw-ops-monitor.timer

