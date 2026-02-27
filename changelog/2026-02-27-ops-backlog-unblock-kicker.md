## Timestamp
2026-02-27T13:55:29+07:00

## Actor
codex

## Task/Trigger
Unblock autonomy queue when ops-assigned backlog stalled and kicker worker wake path deadlocked.

## Files Changed
- src/app/api/autonomy/route.ts

## Change Summary
- Routed ops-assigned backlog execution to alex worker in kicker assignee selection.
- Removed recursive systemd self-start fallback for ops from kicker worker wake path.
- Prevents kicker from hanging/timeout loops and restores backlog processing.

## Verification
- npm run build
- POST /api/autonomy action=kicker returns quickly with worker wake result
- POST /api/autonomy action=status shows queue movement path available

## Rollback Note
Revert this change if dedicated ops worker lane is re-enabled and stable.

## Links
- Incident: stalled backlog with opsExecutorHealthy=false and in_progress=0
