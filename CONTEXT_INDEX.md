# Mission Control Context Index

Use this file as the single entry point for any external IDE/agent to load project context fast and safely.

## Primary Workspace
- `/home/ubuntu/mission-control`

## GitHub Source Of Truth
- Repo: `https://github.com/hariyadii/mission-control`
- Default branch: `master`
- Active working pattern:
  - Long-lived stable branch: `master`
  - Feature branches: `feat/*`
  - Sonnet/cloud branches usually arrive as `origin/feat/*` and should be reviewed before merge/cherry-pick

## Git Sync Commands
```bash
cd /home/ubuntu/mission-control
git fetch origin --prune
git checkout master
git pull --ff-only origin master
```

## PR / Branch Intake
```bash
# inspect incoming branch
git log --oneline --max-count=20 origin/<branch>

# merge (preferred when clean)
git checkout master
git merge --no-ff origin/<branch>

# or cherry-pick specific commits
git cherry-pick <sha1> <sha2> ...
```

## Load Order (Recommended)
1. `/home/ubuntu/mission-control/CONTEXT_INDEX.md`
2. `/home/ubuntu/mission-control/AGENTS.md` (if present)
3. `/home/ubuntu/mission-control/src/app/api/autonomy/route.ts`
4. `/home/ubuntu/mission-control/convex/schema.ts`
5. `/home/ubuntu/mission-control/convex/tasks.ts`
6. `/home/ubuntu/mission-control/scripts/autonomy-readiness-check.sh`
7. `/home/ubuntu/mission-control/scripts/handoff-health.sh`
8. `/home/ubuntu/mission-control/scripts/cron-self-heal.sh`
9. `/home/ubuntu/mission-control/changelog/` (entire folder)

## Optional Runtime Context (Read-Only)
- `/home/ubuntu/.openclaw/workspace/reports/`
- `/home/ubuntu/.openclaw/workspace/memory/CHANGELOG_LEARNING_LEDGER.md`

## Do Not Load (Secrets)
- `~/.openclaw/openclaw.json`
- `~/.openclaw/agents/*/agent/auth-profiles.json`
- Any `.env*` file containing API keys/tokens

## Current Operating Model (High Level)
- Mission Control is the source of truth for queue + autonomy APIs.
- Ops executor uses `systemd` timers as primary control loop.
- Cron jobs support worker/suggester lanes; stale/duplicate lanes should not be enabled concurrently with systemd-equivalent lanes.
- Reliability and handoff decisions are driven by:
  - `scripts/autonomy-readiness-check.sh`
  - `scripts/handoff-health.sh`

## Quick Verification Commands
```bash
cd /home/ubuntu/mission-control
npm run -s build
./scripts/autonomy-readiness-check.sh
./scripts/handoff-health.sh
curl -sS -X POST http://127.0.0.1:3001/api/autonomy \
  -H 'Content-Type: application/json' \
  -d '{"action":"status"}' | jq .
```

## Changelog Rule
- Every feature/config/workflow change must be written to `/home/ubuntu/mission-control/changelog/`
- Filename format: `YYYY-MM-DD-<featurechange>.md`
- Reuse same file per day+feature (append entries)
