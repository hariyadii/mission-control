# 2026-02-27 — Autonomy Handoff Fixes

## Timestamp
2026-02-27T23:47+07:00

## Actor
User + Gemini (antigravity)

## Task/Trigger
Autonomy readiness evaluation revealed idle agent lanes and blocked task accumulation preventing full autonomous operation.

## Root Cause
1. **All 3 suggesters disabled** — `lyra-capital-suggester-3h`, `nova-mission-suggester-3h`, `sam-mission-suggester-3h` were all set to `enabled: false`, meaning no new tasks were being generated for these lanes.
2. **17 blocked tasks** — All had `blocked_reason: validation_contract_mismatch` caused by repeated failures when MiniMax M2.5 alpha period ended (404 errors), not actual prompt/contract misalignment. Tasks were auto-blocked after 3+ consecutive failures with the same validation reason.

## Files Changed
- `/home/ubuntu/.openclaw/cron/jobs.json` (via `openclaw cron enable`)
- Convex tasks database (17 task descriptions updated with alignment marker, then validation_cleanup requeued)

## Change Summary
1. **Re-enabled 3 suggester cron jobs:**
   - `lyra-capital-suggester-3h` (`openclaw cron enable 4141ed36-...`)
   - `nova-mission-suggester-3h` (`openclaw cron enable 494ca665-...`)
   - `sam-mission-suggester-3h` (`openclaw cron enable 5d3137b8-...`)
2. **Unblocked 17 tasks:**
   - Added `prompt_contract_aligned:true` marker to all 17 blocked task descriptions via Convex API
   - Ran `POST /api/autonomy {action: "validation_cleanup", max: 50, minAgeMinutes: 1}`
   - Result: `scanned: 17, requeued: 17, skipped: 0`

## Verification
Post-fix system state:
- `blocked: 17 → 0` ✅
- `backlog: 2 → 18` (17 requeued + 1 existing)
- `in_progress: 1 → 2` (workers already auto-claiming)
- Suggesters enabled: `3/3` ✅
- Workers running: `ok` status across all lanes ✅

## Rollback Note
- Disable suggesters: `openclaw cron disable <id>` for each
- Tasks will naturally re-block if underlying issues persist (3+ consecutive same-reason failures)

## Outcome
success

## Lessons
- Disabled suggesters = silent death for agent lanes (no errors, just zero throughput)
- `validation_contract_mismatch` blocks caused by transient model outages need bulk-unblock after root cause is fixed
- The `validation_cleanup` API with `prompt_contract_aligned:true` marker is the safe unblock path

## Next Opening
- Monitor suggester runs over next 3h to confirm task generation resumes
- Watch lyra/nova throughput recover from 0 → target (8/day)
- Verify remaining 3 cron errors self-heal

## Links
- Previous fix: [2026-02-27-cron-error-recovery.md](./2026-02-27-cron-error-recovery.md)
