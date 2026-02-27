# changelog-code-config-scope (2026-02-25)

## Entry 2026-02-25T02:45:24+07:00

Timestamp: 2026-02-25T02:45:24+07:00
Actor: codex
Task/Trigger: manual-codex-2026-02-25
Files Changed:
- /home/ubuntu/mission-control/src/app/api/autonomy/route.ts
Change Summary: Adjusted changelog gate to hard-fail code/config edits only; docs/log-only changes no longer require changelog.
Verification: API smoke: .md artifact => no changelog requirement; .ts artifact => changelog_missing without changelog.
Rollback Note: Revert isCodeConfigEditTask and required sections changes in autonomy route + AGENTS policy text updates.
Outcome: success
Lessons: Over-broad enforcement creates false blockers; scope must track risk class (code/config).
Next Opening: Add weekly lessons digest and auto-reference last related dead_end before worker execution.
Links:
- scope: mission-control
- task: manual-codex-2026-02-25
- artifact: /home/ubuntu/mission-control/src/app/api/autonomy/route.ts

