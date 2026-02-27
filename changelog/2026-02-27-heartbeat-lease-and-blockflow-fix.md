## Timestamp
2026-02-27T00:00:00+07:00

## Actor
codex

## Task/Trigger
Apply high-priority Sonnet audit fixes for lease persistence, blockflow correctness, and policy write race hardening.

## Files Changed
- src/app/api/autonomy/route.ts
- convex/tasks.ts
- src/app/api/control/route.ts

## Change Summary
- `runHeartbeat` now persists `heartbeat_at` and `lease_until` in DB, and returns the same persisted lease timestamp.
- `runComplete` blocking logic now uses `else if` to avoid duplicate blocked metadata appends in one pass.
- `completeTask` mutation no longer writes `heartbeat_at` for failed/requeued tasks.
- `killSwitch` now re-reads latest policy before save to reduce read-modify-write race drift.

## Verification
- npm run build

## Rollback Note
Revert this change set if lease handling causes unexpected claim starvation or heartbeat failures.

## Links
- Sonnet post-fix audit against commit 5dbcc0c (user-shared transcript)
