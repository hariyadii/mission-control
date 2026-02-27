# 2026-02-27 — Autonomy reliability + UI quality maxpass

## timestamp
2026-02-27T00:00:00Z

## actor
kilo/anthropic/claude-sonnet-4.6 — feat/sonnet-autonomy-ui-maxpass-2026-02-27

## task/trigger
Full-codebase audit + fix pass: backend correctness, queue movement, alert quality, UX clarity/accessibility.

## files changed
- `convex/tasks.ts` — requeueExpiredLeases now clears heartbeat_at
- `src/app/api/autonomy/route.ts` — claim path collapsed to single atomic mutation; heartbeat owner check hardened
- `src/app/tasks/page.tsx` — replaced prompt()/confirm() with inline create form + modal delete confirmation
- `src/app/page.tsx` — incident row key changed from index to stable source+id composite
- `scripts/handoff-health.sh` — done_bucket_inconsistency error label made diagnostic (includes counts)
- `scripts/cron-self-heal.sh` — summary JSON now includes severity field for operator signal quality
- `src/app/globals.css` — mobile padding increase, touch-action: manipulation on interactive elements

## change summary

### A) Prevent autonomy deadlocks — convex/tasks.ts
**Issue:** `requeueExpiredLeases` cleared `owner` and `lease_until` but NOT `heartbeat_at`.
A requeued task with a stale but non-zero `heartbeat_at` could cause the reconciler in `runKicker`/`runClaim` to mis-classify it as having recent activity, skipping the requeue and leaving the task orphaned in a semi-stale state.
**Fix:** Added `heartbeat_at: undefined` to the patch in `requeueExpiredLeases`.

### B) Worker claim path atomicity — route.ts
**Issue:** `runClaim` used two sequential mutations: `updateStatus(in_progress)` then `updateTask(owner, lease_until, ...)`. A process crash or Convex timeout between those two calls leaves the task as `in_progress` with no owner — a zombie that blocks the queue until the kicker requeues it (up to LEASE_MINUTES delay).
**Fix:** Collapsed to a single `updateTask` call that sets `status`, `owner`, `lease_until`, `heartbeat_at`, and clears `blocked_reason/until/signal` atomically.

### C) Heartbeat owner-field check — route.ts
**Issue:** `runHeartbeat` in the API layer checked `task.assigned_to !== assignee` but the Convex `heartbeatLease` mutation checks `task.owner !== args.assignee`. A worker that lost ownership (via a concurrent reclaim) but still holds `assigned_to` could renew a lease it no longer holds.
**Fix:** `runHeartbeat` now checks both `assigned_to` and `owner` fields. Heartbeat rejected if either mismatches.

### D) Handoff health alert clarity — handoff-health.sh
**Issue:** When `done_unclassified < 0` (timing inconsistency between API reads), the error logged was `done_bucket_overflow` with no context.
**Fix:** Label changed to `done_bucket_inconsistency:done_total=N,verified_pass=M,fail_validation=K` so operators see exact counts for triage.

### E) Cron self-heal severity signal — cron-self-heal.sh
**Issue:** The JSON summary printed to stdout had no `severity` field. Consumers couldn't distinguish a clean run from a critical stuck-job escalation.
**Fix:** Added `severity` field: `"ok"` if no issues, `"warning"` if errors/pending remain, `"critical"` if stuck running or escalated.

### F) Tasks page UX — tasks/page.tsx
**Issue:** `handleCreate` used `window.prompt()` and `window.confirm()` — blocked in CSP-restricted iframes, poor mobile UX, no keyboard accessibility.
**Fix:** Replaced with `InlineCreateForm` component (rendered inline per column) and a `role="alertdialog"` modal for delete confirmation. Auto-infers assignee from title keywords.

### G) Incident row key stability — page.tsx
**Issue:** `allIncidents.map((inc, i) => <IncidentRow key={i} ...>)` used array index as React key. When incidents sort order changes (severity reorder), React can incorrectly reconcile rows causing stale DOM/animation artifacts.
**Fix:** Changed to `key={\`${inc.source}-${inc.id}\`}` — stable composite from incident source and ID.

### H) Mobile UX — globals.css
- Increased content-wrap top padding from 3.5rem to 3.75rem to avoid hamburger overlap on iOS Safari with dynamic viewport bar.
- Added `touch-action: manipulation` to `button, a, select, input` at ≤480px to eliminate 300ms tap delay on mobile.
- Added `kanban-grid` class to tasks page grid so existing responsive CSS overrides apply correctly.

## verification

### npm run build
```
✓ Compiled successfully
Linting and checking validity of types ...
✓ (TypeScript types: PASS)
Prerender errors: "No address provided to ConvexReactClient" — IDENTICAL to baseline (pre-existing, env-only, not introduced by this branch)
```

### bash -n scripts/*.sh
```
autonomy-readiness-check.sh: Exit 0 (PASS)
handoff-health.sh:           Exit 0 (PASS)
cron-self-heal.sh:           Exit 0 (PASS)
```

## rollback note
`git revert HEAD` or `git checkout master` and redeploy.
Each change is isolated — the most impactful (convex/tasks.ts atomic claim) can be reverted independently with `git checkout master -- convex/tasks.ts`.

## outcome
All targeted bugs fixed. TypeScript and shell syntax clean. No features removed. No placeholder TODOs.

## lessons
- `requeueExpiredLeases` must clear ALL lease-related fields including `heartbeat_at` or reconcilers will be misled.
- Two-mutation claim patterns must be collapsed to one to prevent zombie in_progress tasks.
- Both `assigned_to` and `owner` fields must be checked in heartbeat guards — they diverge after concurrent reclaims.
- `window.prompt()`/`confirm()` must be treated as non-available in modern apps; inline React forms are the correct replacement.

## next opening
- Consider adding a Convex `claimTaskById` mutation that accepts an explicit task ID for atomic claim by the API layer (avoids all race conditions at the Convex layer).
- Rate-limit auto-unblock (validation_cleanup pass 2) should log unblocked task IDs to a dedicated metrics file for audit trail.

## links
- Branch: feat/sonnet-autonomy-ui-maxpass-2026-02-27
- Base: master (82ba3cd)
