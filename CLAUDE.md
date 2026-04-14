# CLAUDE.md

> Claude Code configuration for the Planner -> Generator -> Evaluator harness.
> `AGENTS.md` is the tool-agnostic source of truth and Codex's instruction set.
> This file explains the Claude-side routing model, subagent roles, and local integration points.

---

## Tool Assignment

| Agent | Runtime | Invocation |
| --- | --- | --- |
| Planner | Claude Code subagent | `Agent(subagent_type="planner", ...)` |
| Generator | Codex CLI | `Bash("codex -a never exec --skip-git-repo-check '...'")` |
| Evaluator | Claude Code subagent | `Agent(subagent_type="evaluator", ...)` |
| Orchestrator | Claude Code main agent or subagent | entry point |

Generator is always Codex CLI. Never invoke `Agent(subagent_type="generator")`.

---

## Codex Prerequisites

```bash
npm install -g @openai/codex
export OPENAI_API_KEY=sk-...
codex --version
```

---

## Architecture Summary

Claude handles planning and evaluation. Codex handles implementation.

```text
User prompt
  -> Planner writes planner-spec.json / init.sh / claude-progress.txt
  -> Generator proposes sprint-contract.md
  -> Evaluator reviews contract
  -> Generator implements and commits
  -> Generator writes eval-trigger.txt
  -> Evaluator runs live browser CHECK with Playwright MCP
  -> Evaluator writes eval-result-{N}.md
  -> PASS moves to next sprint; FAIL returns to Generator
```

Primary state lives in files, not conversation memory:

- `planner-spec.json`
- `claude-progress.txt`
- `sprint-contract.md`
- `eval-result-{N}.md`
- `eval-trigger.txt`
- `init.sh`

---

## Context Hygiene

This harness is designed to reduce long-run context pollution and AI patch drift.

Core rules:

- Re-read artifacts before routing instead of trusting prior conversation state.
- Keep `claude-progress.txt` short and summary-oriented.
- Prefer current repo reality over remembered intent.
- Do not let Claude or Codex accumulate a second unofficial state machine in chat.

`claude-progress.txt` should stay compact:

- keep the latest project summary plus the latest 3 sprint entries
- keep each sprint entry to 3 to 5 lines
- summarize older entries instead of appending forever

If artifacts and chat context disagree, treat artifacts as authoritative and resolve the mismatch explicitly.

---

## Claude Subagents

Subagents live in `.claude/agents/` in a consuming project, or are mirrored by
the role definitions in this repository's [agents](./agents) directory.

### Planner

Planner runs once at project start, or when the orchestrator explicitly asks
for a plan revision.

Planner must:

- read existing state before planning
- turn a short user prompt into a complete `planner-spec.json`
- write `init.sh`
- append an initial handoff to `claude-progress.txt`
- stay high-level and avoid application code

### Evaluator

Evaluator runs in two modes:

1. Contract Review
   Review `sprint-contract.md` and either append `CONTRACT APPROVED` or request changes.
2. Live CHECK
   Run `bash init.sh`, execute browser steps with Playwright MCP, and write `eval-result-{N}.md`.

Evaluator must never approve without live browser evidence.

### Generator

Generator is not a Claude subagent. Claude only invokes Codex with explicit Bash commands.

Typical Codex invocations:

```bash
codex -a never exec --skip-git-repo-check \
  "Read planner-spec.json. Propose sprint-contract.md for Sprint N. Follow AGENTS.md Generator rules."
```

```bash
codex -a never exec --skip-git-repo-check \
  "sprint-contract.md is approved. Implement Sprint N. Commit and write eval-trigger.txt. Follow AGENTS.md."
```

```bash
codex -a never exec --skip-git-repo-check \
  "Sprint N failed. Read eval-result-N.md. Fix only the cited issues. Re-commit and update eval-trigger.txt."
```

---

## Playwright MCP

Recommended MCP config:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "description": "Live browser automation for Evaluator"
    }
  }
}
```

Configure this in `.claude/settings.json` or pass it via `--mcp-config`.

---

## Hooks

Example `.claude/settings.json` hooks:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash(git commit*)",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Committed - update claude-progress.txt next'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/verify-clean-state.sh"
          }
        ]
      }
    ]
  }
}
```

Example `.claude/hooks/verify-clean-state.sh`:

```bash
#!/bin/bash
if ! git diff --quiet; then
  echo "Uncommitted changes detected - commit or revert before ending session"
  exit 1
fi
if ! pytest -q --tb=no 2>/dev/null; then
  echo "Tests failing - do not end session with broken tests"
  exit 1
fi
echo "Clean state confirmed"
```

---

## Suggested Commands

These command snippets are aligned to the current harness and avoid any hidden planning system.

### `new-sprint`

```text
Read planner-spec.json, identify the next incomplete sprint, invoke Codex to propose sprint-contract.md, then invoke the evaluator to review that contract. Do not write code until CONTRACT APPROVED exists in sprint-contract.md.
```

### `eval`

```text
Read sprint-contract.md and eval-trigger.txt, then invoke the evaluator to run live CHECK and write eval-result-{N}.md.
```

### `status`

```text
Run: cat claude-progress.txt 2>/dev/null; git log --oneline -10 2>/dev/null; python3 - <<'PY'
import json, pathlib
path = pathlib.Path("planner-spec.json")
if path.exists():
    spec = json.loads(path.read_text())
    for sprint in spec.get("sprints", []):
        print(f"Sprint {sprint['id']}: {sprint['title']}")
else:
    print("[no planner-spec.json]")
PY
```

---

## Operating Rules

- Re-read file artifacts before every routing decision.
- Treat `AGENTS.md` as the canonical harness contract.
- Do not introduce a second planning or task-tracking system.
- Do not let Claude evaluate by code inspection alone when browser validation is required.
- Keep generator logic in Codex, not in a Claude subagent.
- Prefer simple, file-backed state over conversation-memory assumptions.
- Keep `claude-progress.txt` compressed and rewrite it when it becomes a transcript.
- When routing retries, favor the latest `eval-result-{N}.md` and current files over historical discussion.
- Surface architecture drift explicitly instead of letting it accumulate across sprints.

---

## Harness Evolution Rule

Every harness component should justify its existence.

After model upgrades, re-evaluate:

- whether contract negotiation still adds value
- whether the evaluation rubric still discriminates effectively
- whether file artifacts are still the right state boundary
- whether any routing logic can be simplified without reducing quality

Simpler harness plus stronger models beats a complicated harness with stale assumptions.
