## Timestamp
2026-02-27T00:00:00+07:00

## Actor
codex

## Task/Trigger
Apply valid low-risk fixes from strict Sonnet audit to align runtime behavior and reduce silent failure paths.

## Files Changed
- convex/tasks.ts
- src/app/api/autonomy/route.ts
- src/app/api/control/route.ts

## Change Summary
- Fixed task create contract to keep `description` optional instead of coercing to empty string.
- Hardened `/api/control` cron JSON parsing and policy enum validation (`xMode`, `capitalLane.mode`).
- Added `killSwitch` warning when no target cron jobs are matched.
- Guarded status counters against unknown runtime values to prevent `NaN`-style drift.
- Removed unreachable worker guard branch tied to coerced max handling.
- Improved duplicate suppression by blocklisting risky/vague rejected titles in the same guardrail batch.
- Reduced failure-note overwrite risk by refreshing task state before appending failure note.
- Tightened risky/vague keyword matching to word-boundary checks.

## Verification
- npm run lint
- npm run build

## Rollback Note
Revert commit containing this changelog if runtime behavior regresses in worker or guardrail flows.

## Links
- Sonnet strict audit session output (user-provided in chat)
