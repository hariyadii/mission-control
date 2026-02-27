# Debt Burn-Down: Rate-Limit Handling, Queue Self-Clearing, Handoff Hardening

## Timestamp
2026-02-27T00:00:00Z

## Actor
kilo/autonomy-audit (HEAD c24a098 → post-commit)

## Task/Trigger
Targeted post-fix debt burn-down pass on autonomy/control/tasks/scripts scope.
Objectives: eliminate validation-loop debt paths, improve Lyra/Nova queue self-clearing,
harden rate-limit retry behavior, prevent handoff/readiness snapshot drift, deduplicate alerts.

## Files Changed
- `src/app/api/autonomy/route.ts`
- `scripts/autonomy-readiness-check.sh`
- `scripts/handoff-health.sh`
- `scripts/cron-self-heal.sh`

## Change Summary

### FIX-A+B — Streak-indexed backoff + rate-limit recoverable-first policy (`autonomy/route.ts`)
**Problem:** `recommended_backoff_minutes` always returned `RETRY_BACKOFF_MINUTES[0]` (15 min)
regardless of how many consecutive failures a task had, and there was no differentiation between
a transient contract mismatch and a rate-limit quota block.

**Fix:** `recommended_backoff_minutes` now uses `sameReasonFailStreak` to index into
`RETRY_BACKOFF_MINUTES` ([15, 60, 240]), progressing from 15 → 60 → 240 min as failures accumulate.
Rate-limit blocks (`rate_limit_constraint`) get the longest slot (240 min) immediately, since
quota windows are hours-long and immediate retries are wasteful.

Also corrected `retry_count_total` in the return payload — it was always returning `1` on failure;
now returns the actual cumulative total from the task record.

### FIX-C — Auto-unblock `rate_limit_constraint` tasks past 240-min TTL (`autonomy/route.ts`)
**Problem:** `runValidationCleanup` only handled `validation_contract_mismatch` (requires a manual
`prompt_contract_aligned:true` marker). `rate_limit_constraint` blocked tasks — common for Lyra
(Binance API) and Nova (X API) — sat in `blocked` state indefinitely, inflating blocked_ratio
alerts and stalling those assignees' queues.

**Fix:** Added a second cleanup pass in `runValidationCleanup` for `rate_limit_constraint` tasks
older than 240 minutes (`RATE_LIMIT_AUTO_UNBLOCK_MINUTES = RETRY_BACKOFF_MINUTES[2]`). These
are automatically returned to `backlog` with streak counters cleared. No manual marker required —
quota windows are time-deterministic.

### FIX-D — Atomic state file write in `autonomy-readiness-check.sh`
**Problem:** State was written as `printf ... > .tmp` then `jq ... .tmp > STATE_FILE`. If the
process was killed between those two operations, `STATE_FILE` was left empty/truncated, resetting
all consecutive alert counters to 0 on the next cycle. This caused deduplication to fail and
critical alerts to re-fire spuriously.

**Fix:** Build the full JSON in a single `mktemp`-backed temp file using a pipe, then atomically
`mv -f` it to `STATE_FILE`. A killed process leaves the original `STATE_FILE` intact.

### FIX-E — Wire `validation_loop_tasks` into `handoff-health.sh` go_no_go decision
**Problem:** `validation_loop_tasks` was fetched from the status API and printed as a metric
but never influenced the `go_no_go` result. A system with 5 tasks stuck in a validation loop
would still return `GO`, silently passing broken state into production handoffs.

**Fix:** Added `pass_validation_loops` criterion: if `validation_loop_tasks >= 3`, `go_no_go`
is set to `NO_GO` and `validation_loop_tasks=N` is appended to `reasons`. Threshold of 3 avoids
false positives from normal 1-2 task transient failures.

### FIX-F — Rate-limit TTL expiry in `cron-self-heal.sh`
**Problem:** Any cron job with a rate-limit error was unconditionally skipped on every self-heal
cycle with no time-based escape. A core job like `lyra-capital-worker-30m` hit by a Binance
rate-limit at 2 AM would remain in error state indefinitely until manually reset.

**Fix:** Added a 60-minute cooldown window check using `running_at` as the rate-limit event
timestamp. If the job is within the cooldown window → skip (existing behavior). If the TTL has
expired → fall through to the standard retry path so the job self-heals automatically after
the quota window resets.

## Verification
- `tsc --noEmit`: EXIT 0 (no type errors)
- `next build`: `✓ Compiled successfully`, linting and type validity passed
- Prerender errors are pre-existing `NEXT_PUBLIC_CONVEX_URL` env issue, not introduced here
- Shell scripts: `bash -n` syntax check clean on all three modified scripts

## Rollback Note
All changes are in three discrete locations. To roll back:
1. `git revert <commit-sha>` — single commit reverts all six fixes atomically
2. If partial rollback needed:
   - FIX-A/B/C: revert `runComplete` and `runValidationCleanup` in `autonomy/route.ts`
   - FIX-D: revert `autonomy-readiness-check.sh` state-write block (restore two-step `>.tmp` + `jq` pattern)
   - FIX-E: remove `pass_validation_loops` from `handoff-health.sh` go_no_go condition
   - FIX-F: replace TTL block in `cron-self-heal.sh` with original unconditional `continue`

No schema changes were made. No DB migrations required.

## Links
- Audit basis: prior session audit commit `1232c0d` (5 High/Medium fixes)
- Backoff schedule: `RETRY_BACKOFF_MINUTES = [15, 60, 240]` in `autonomy/route.ts:109`
- Rate-limit TTL constant: `RATE_LIMIT_AUTO_UNBLOCK_MINUTES = 240` in `autonomy/route.ts`
