# CLAUDE.md

Compact Claude Code guide for SprintFoundry. Keep this file small; detailed
protocol notes live in `docs/protocol.md`, and role-specific prompts live in
`.claude/agents/`.

## Runtime Roles

| Role | Runtime | Invocation |
| --- | --- | --- |
| Planner | Claude subagent | `Agent(subagent_type="planner", ...)` |
| Generator | Codex CLI | `codex exec --full-auto ...` |
| Evaluator | Claude subagent | `Agent(subagent_type="evaluator", ...)` |
| Orchestrator | Claude main/subagent | routes by file state |

Generator is always Codex CLI. Never invoke a Claude `generator` subagent.

## Startup Snapshot

At the start of a harness session, read current files instead of relying on
memory:

```bash
cat run-state.json 2>/dev/null || echo "[no run-state]"
cat claude-progress.txt 2>/dev/null || echo "[no progress]"
cat eval-trigger.txt 2>/dev/null || echo "[no eval-trigger]"
cat sprint-contract.md 2>/dev/null | head -40 || echo "[no contract]"
ls eval-result-*.md 2>/dev/null || echo "[no eval results]"
git branch --show-current 2>/dev/null || true
git log --oneline -5 2>/dev/null || true
```

If `run-state.json.needs_human` is true, stop and surface the pause reason.
Do not route any agent until a human explicitly clears it.

If `run-state.json.active_branch` is set and differs from the current Git
branch, stop and resolve the branch mismatch before routing.

## Routing Order

Apply this order:

1. `needs_human=true` -> pause.
2. Missing `planner-spec.json` -> Planner creates spec, `init.sh`, progress log.
3. Sprint-history audit inconsistent -> pause.
4. `eval-trigger.txt` exists -> Evaluator CHECK or targeted Codex retry.
5. `sprint-contract.md` exists but unapproved -> Evaluator contract review.
6. Approved `sprint-contract.md` -> prepare branch/fence, invoke Codex implementation.
7. `bug-report.md` -> Codex proposes bugfix contract.
8. `change-request.md` -> route by `Type`.
9. All planned sprints PASS -> complete.
10. Otherwise -> Codex proposes the next sprint contract.

The only authoritative completion signal is `eval-result-{N}.md` containing
`SPRINT PASS`.

## Verification Modes

Planner should include:

```json
{
  "verification": {
    "mode": "browser | api | cli | job | library",
    "base_url": "http://localhost:3000",
    "command": "pytest -q"
  }
}
```

Evaluator CHECK uses:

- `browser`: Playwright MCP.
- `api`: HTTP requests and response assertions.
- `cli`: shell commands, exit codes, stdout/stderr, generated files.
- `job`: queue/job triggers, polling, side effects.
- `library`: external consumer harness.

Missing verification tools are environment failures: write SPRINT FAIL with a
clear unavailable-tool reason and pause without consuming retry budget.

## Codex Commands

Use the version-aware command emitted by `scripts/orchestrate.py` whenever
possible. Modern Codex invocation:

```bash
codex exec --full-auto \
  -c 'sandbox_permissions=["disk-full-read-access"]' \
  -c 'shell_environment_policy.inherit=all' \
  --skip-git-repo-check \
  "<prompt>"
```

Standard prompts:

```text
Read planner-spec.json. Propose sprint-contract.md for Sprint N.
Follow AGENTS.md Generator rules. Stop after writing the file.
```

```text
sprint-contract.md is approved. Implement Sprint N ONLY.
After committing, write eval-trigger.txt containing exactly: sprint=N.
STOP IMMEDIATELY after writing eval-trigger.txt. Follow AGENTS.md.
```

```text
Sprint N failed. Fix ONLY the cited issues from the inlined Evaluator verdict.
Re-commit and write eval-trigger.txt containing exactly: sprint=N.
STOP after writing eval-trigger.txt. Follow AGENTS.md.
```

## Orchestrator Script

Useful commands:

```bash
python3 scripts/orchestrate.py --project-dir . --json
python3 scripts/orchestrate.py --project-dir . --check-only --json
python3 scripts/harness-log.py verify
python3 scripts/harness-log.py tail -n 30
bash scripts/install-hooks.sh
```

`--check-only` must be side-effect free: no log writes, no state writes, no
cleanup, no branch switching, no Codex execution.

## Branching

- One branch per sprint: `codex/sprint-<N>-<slug>`.
- Implementation and retries stay on the sprint branch.
- `main` should contain accepted progress only.
- Merge only after Evaluator writes `SPRINT PASS`.

## Progress Hygiene

Keep `claude-progress.txt` compact:

- latest project summary
- latest three sprint entries
- no stack traces, dumps, or long narratives

Compress before routing if it exceeds 60 lines or contains more than three
sprint entries.

## Hard Rules

- Claude Planner/Evaluator/Orchestrator never write application code.
- Codex Generator never evaluates itself.
- No code before `CONTRACT APPROVED`.
- No sprint advancement without `SPRINT PASS`.
- Do not clear `needs_human=true` automatically.
- Do not rewrite `harness-audit.ndjson`.
- Prefer pausing with a clear reason over silent autonomous drift.
