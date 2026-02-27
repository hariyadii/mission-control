## Timestamp
2026-02-27T00:00:00+07:00

## Actor
codex

## Task/Trigger
Integrate Sonnet cloud code pass commit 1232c0d into master and resolve overlapping conflicts with prior local fixes.

## Files Changed
- convex/tasks.ts
- src/app/api/autonomy/route.ts
- src/app/api/control/route.ts

## Change Summary
- Added optional `status` support to `api.tasks.updateTask` mutation args to allow atomic state+lease claims.
- Updated worker/claim paths to atomically set `status=in_progress` with owner+lease+heartbeat in one mutation.
- Preserved heartbeat lease persistence and double-block prevention logic from prior fixes.
- Kept policy killSwitch write race mitigation (fresh policy re-read before save).
- Confirmed completeTask `heartbeat_at` failure-path behavior remains corrected.

## Verification
- npm run build

## Rollback Note
Revert commit `61a8a48` (and this changelog commit) if claim ownership/lease behavior regresses under concurrent workers.

## Links
- Sonnet commit: 1232c0d77fa1ef01882572de9696d44e79fa9c6a
- Local merged commit: 61a8a48
