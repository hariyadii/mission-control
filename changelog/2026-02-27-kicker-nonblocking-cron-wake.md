## Timestamp
2026-02-27T13:59:11+07:00

## Actor
codex

## Task/Trigger
Fix stalled autonomy cycles caused by blocking cron wake calls inside /api/autonomy kicker.

## Files Changed
- src/app/api/autonomy/route.ts

## Change Summary
- Changed suggester wake and worker wake cron triggers in runKicker from synchronous  to asynchronous background launch ().
- Prevents kicker endpoint from hanging and avoids ops-worker timeout loops.

## Verification
- npm run build
- POST /api/autonomy action=kicker returns quickly
- ops-worker-cycle log no longer accumulates rc=124 from blocked kicker path

## Rollback Note
Revert if synchronous wait semantics are required for downstream assumptions.

## Links
- Incident: ops-worker-cycle repeated rc=124 with stalled queue updates
