# AGENTS.md

> GAN-inspired three-agent harness. **Code implementation is delegated to Codex CLI.**
> Planner and Evaluator run in Claude Code. Generator runs in Codex.
> This file is read natively by Codex — the Generator section is Codex's instruction set.

---

## Agent Responsibilities

| Agent | Tool | Role |
|-------|------|------|
| Planner | Claude Code | Turns user prompt into `planner-spec.json`. Runs once per project. |
| Generator | **Codex CLI** | Reads spec + approved contract, implements one sprint, commits. |
| Evaluator | Claude Code | Contract review + live browser CHECK via Playwright MCP. |
| Orchestrator | Claude Code | Routes between agents. Never writes code or evaluates. |

---

## Architecture

```
User prompt (1–4 sentences)
    │
    ▼
┌─────────┐   planner-spec.json    ┌─────────────────────────────────────┐
│ Planner │ ──────────────────────▶│          Sprint Loop (N times)      │
│ (Claude)│                        │                                     │
└─────────┘                        │   sprint-contract.md negotiation    │
                                   │         ┌───────────┐               │
                                   │         │ Generator │               │
                                   │         │  (Codex)  │               │
                                   │         └─────┬─────┘               │
                                   │               │ code + commit        │
                                   │         ┌─────▼──────┐              │
                                   │         │  Evaluator │ ◀── Playwright│
                                   │         │  (Claude)  │               │
                                   │         └─────┬──────┘              │
                                   │               │ PASS / FAIL+critique │
                                   │         ◀─────┘                     │
                                   └─────────────────────────────────────┘
```

**The gate rule**: Generator never marks a sprint complete. Only Evaluator writes SPRINT PASS.

---

## Persistent Artifacts

State lives in files, never in conversation memory.

| File | Owner | Purpose |
|------|-------|---------|
| `planner-spec.json` | Planner | Source of truth — product spec and sprint list |
| `claude-progress.txt` | Generator | Cross-session handoff log |
| `sprint-contract.md` | Generator + Evaluator | Current sprint definition of done |
| `eval-result-{N}.md` | Evaluator | Per-sprint scores and critique |
| `eval-trigger.txt` | Generator | Signal file: `sprint=N` written after commit |
| `init.sh` | Planner | Reproducible dev server startup |
| `git history` | Generator | State recovery and audit trail |

---

## Context Hygiene Rules

Long-running projects must resist context bloat and patch-on-patch AI code drift.

### Shared rules

- Always prefer current file state over remembered conversation state.
- Re-read the minimum required artifacts at the start of each phase instead of relying on prior chat context.
- Keep `claude-progress.txt` as a compact handoff log, not a narrative transcript.
- Do not append long retrospectives, design essays, or duplicate test output to `claude-progress.txt`.
- If a file artifact and the conversation disagree, trust the file artifact and resolve the discrepancy explicitly.

### `claude-progress.txt` policy

Treat `claude-progress.txt` as a rolling summary with a hard cap:

- Keep only the latest project summary plus the latest 3 sprint entries.
- Each sprint entry should be 3 to 5 lines maximum.
- Include only:
  - sprint number and timestamp
  - status
  - key files or behavior changed
  - blockers or evaluator-required follow-up
- Delete or compress older entries instead of appending forever.

### Anti-slop rules

- Never preserve a bad abstraction just because it already exists in model context.
- On each sprint, prefer small coherent changes over opportunistic extra refactors.
- If a failed sprint requires broad unrelated cleanup, stop and surface that as a planning problem instead of smuggling it into the retry.
- Do not create placeholder architecture, fake extensibility, or generic helper layers unless the current sprint truly needs them.

---

## Agent 1 — Planner (Claude Code)

**Runs**: once per project, triggered by a new user prompt.

**Output**: `planner-spec.json` + `init.sh` + initial entry in `claude-progress.txt`.

### Responsibilities

1. Read any existing context (`claude-progress.txt`, `git log`) before starting.
2. Turn the user prompt into a complete, ambitious product spec.
3. Stay high-level — define *what* and *why*, never implementation details.
4. Expand scope: target 12–20 features across 8–12 sprints.
5. Embed a **Visual Design Language** section in the spec:
   - Color palette (3–5 tokens with hex values)
   - Typography: display font, body font, mono font
   - Spacing unit, border radius, mood adjective
6. Identify opportunities for AI-native features.
7. Write `init.sh` — starts the full dev stack (frontend + backend).
8. Write `planner-spec.json`:

```json
{
  "product": "string",
  "design_language": "full VDL description",
  "tech_stack": { "frontend": "...", "backend": "...", "db": "..." },
  "features": ["..."],
  "sprints": [
    { "id": 1, "title": "string", "features": ["..."] }
  ]
}
```

### Hard rules

- Never write application code.
- Stop after `planner-spec.json` is written. Report to user before handoff.

---

## Agent 2 — Generator (Codex CLI)

> Codex reads this file directly. The instructions below are Codex's operating rules.

**Invoked by**: Orchestrator via `codex -a never exec --skip-git-repo-check "..."`

**Output**: committed code + updated `claude-progress.txt` + `eval-trigger.txt`.

### Session startup ritual (mandatory, no exceptions)

```bash
cat claude-progress.txt        # read last handoff
git log --oneline -10          # orient in history
bash init.sh                   # start dev server
```

After `init.sh`, run one smoke test before touching any code. If it fails, diagnose and fix first.

Before writing any code, re-read only the artifacts needed for the current sprint:

- `planner-spec.json`
- `sprint-contract.md`
- latest relevant `eval-result-{N}.md` when retrying

Do not treat old chat context as authoritative.

### Sprint workflow

**Step 1 — Identify current sprint**

Read `planner-spec.json`. Find the lowest-numbered sprint with no `eval-result-{N}.md`
containing "SPRINT PASS". That is the current sprint.

**Step 2 — Propose sprint contract** (if `sprint-contract.md` absent)

Write `sprint-contract.md`:

```markdown
## Sprint <N>: <title from planner-spec.json>

### Features
- <feature from spec>

### Success criteria (browser-verifiable)
- [ ] <observable user-facing behavior>

### Evaluator test steps
1. Navigate to <exact URL>
2. Perform <specific action>
3. Assert <exact expected state>
```

Then stop. The Orchestrator routes this to Evaluator for contract review.

**Step 3 — Implement** (only after `sprint-contract.md` contains "CONTRACT APPROVED")

- Read `planner-spec.json` for VDL and architecture constraints before writing code.
- Follow the Visual Design Language for all UI work.
- Write tests alongside implementation — never after.
- Never use inline styles in React/frontend components.
- Do not carry forward abstractions, helpers, or TODO scaffolding unless they are required by the current sprint.
- Prefer editing or deleting weak code over wrapping it in another layer.

**Step 4 — Self-check**

For each success criterion in `sprint-contract.md`, verify it manually.
Fix any failures before committing.

```bash
pytest -q           # unit tests must pass
git diff --stat     # review scope of changes
```

Also do one context hygiene pass before commit:

- remove dead code introduced during the sprint
- remove temporary debug output
- collapse duplicated logic created during iteration
- check that file names, components, and helpers still match the current architecture
- ensure the change set is still about the approved sprint, not opportunistic extras

**Step 5 — Commit**

```bash
git add -A
git commit -m "feat(sprint-<N>): <imperative description, 72 chars max>"
```

**Step 6 — Signal Evaluator**

```bash
echo "## Sprint <N> — $(date '+%Y-%m-%d %H:%M')" >> claude-progress.txt
echo "Status: committed, pending Evaluator CHECK" >> claude-progress.txt
echo "sprint=<N>" > eval-trigger.txt
```

When updating `claude-progress.txt`, keep the file compact per the policy above.
If necessary, rewrite older entries into a short summary before appending the new one.

### Handling SPRINT FAIL

When invoked after a SPRINT FAIL:

1. Read `eval-result-{N}.md` fully.
2. Fix only what the Evaluator cited.
3. `git commit -m "fix(sprint-<N>): address evaluator failure"`
4. `echo "sprint=<N>-retry" > eval-trigger.txt`

### Hard rules

- Never evaluate your own output.
- Never write "SPRINT PASS" or "SPRINT FAIL".
- Never begin coding before "CONTRACT APPROVED" is in `sprint-contract.md`.
- Never remove or modify existing tests.
- Never commit with failing tests.
- Use `git revert` (not patches) to recover from broken state.
- Never let `claude-progress.txt` grow into a full transcript.
- Never justify keeping low-quality code by citing earlier conversation context.

---

## Agent 3 — Evaluator (Claude Code)

**Runs**: twice per sprint — contract review before coding, live CHECK after commit.

**Output**: "CONTRACT APPROVED" in `sprint-contract.md` (Mode 1), or `eval-result-{N}.md` (Mode 2).

### Mode 1 — Contract Review

Check each success criterion: is it observable in a live browser? Specific enough to test? Mapped to a concrete test step?

**If approved**, append to `sprint-contract.md`:
```
CONTRACT APPROVED
Sprint: <N>
Approved criteria: <count>
```

**If changes needed**, return required changes and do not proceed to Mode 2.

### Mode 2 — Live CHECK

```bash
cat sprint-contract.md
cat eval-trigger.txt
bash init.sh
```

If `init.sh` fails → write SPRINT FAIL: "Dev server failed to start". Do not evaluate.

Navigate the live app with Playwright MCP. Execute each test step. Screenshot evidence.

**Scoring rubric**:

| Dimension | Weight | Threshold |
|-----------|--------|-----------|
| Design quality | 30% | ≥ 7/10 |
| Originality | 30% | ≥ 6/10 |
| Craft | 20% | ≥ 7/10 |
| Functionality | 20% | ≥ 8/10 — hard gate |

Functionality < 8 always fails the sprint.
Be harder on Originality than feels comfortable — the model defaults to safe.

**Write `eval-result-{N}.md`**:

```markdown
# Eval Result — Sprint <N>
Date: <ISO timestamp>

## Scores
| Dimension      | Score | Threshold | Result    |
|----------------|-------|-----------|-----------|
| Design quality | X/10  | ≥ 7       | PASS/FAIL |
| Originality    | X/10  | ≥ 6       | PASS/FAIL |
| Craft          | X/10  | ≥ 7       | PASS/FAIL |
| Functionality  | X/10  | ≥ 8       | PASS/FAIL |

## Verdict: SPRINT PASS / SPRINT FAIL

## Evidence
### Criterion: <text>
Result: PASS/FAIL
Observation: <what you saw in the browser>

## Required fixes (if SPRINT FAIL)
1. <concrete fix>
```

### Hard rules

- Never write application code.
- Never approve without running live Playwright test steps.
- Never approve where any Functionality criterion failed.
- When failing a sprint, cite generic scaffolding, duplicate logic, fake interactivity, or patch-on-patch code smell if they materially hurt craft or functionality.

---

## Sprint Loop

```
planner-spec.json ready
    │
    ▼
[SPRINT N]
    ├─ Codex proposes sprint-contract.md
    ├─ Claude Evaluator: CONTRACT APPROVED  (no code yet)
    ├─ Codex implements + commits + writes eval-trigger.txt
    ├─ Claude Evaluator: eval-result-{N}.md
    │       SPRINT PASS → Orchestrator cleans up, next sprint
    │       SPRINT FAIL → Codex revises → re-CHECK
    └─▶ Sprint N+1
```

---

## Codex CLI Invocation

Orchestrator calls Codex via Bash. Standard invocation patterns:

```bash
# Propose sprint contract
codex -a never exec  --skip-git-repo-check \
  "Read planner-spec.json. Propose sprint-contract.md for Sprint N. Follow AGENTS.md Generator rules."

# Implement after contract approved
codex -a never exec  --skip-git-repo-check \
  "sprint-contract.md is approved. Implement Sprint N. Commit and write eval-trigger.txt. Follow AGENTS.md."

# Fix after SPRINT FAIL
codex -a never exec  --skip-git-repo-check \
  "Sprint N failed. Read eval-result-N.md. Fix only the cited issues. Re-commit and update eval-trigger.txt."
```

---

## Hard Rules (all agents)

- Never skip contract negotiation — code does not begin before CONTRACT APPROVED.
- Never self-evaluate — Codex never writes eval-result. Evaluator never writes code.
- Never mark a sprint complete without live Playwright verification.
- Never remove or modify existing tests.
- State lives in files — read artifacts at session start, not conversation history.

---

## Tech Stack

```
Testing   : Playwright MCP (E2E), pytest (unit)
VCS       : Git — one clean commit per sprint
```

---

## Build & Test Commands

```bash
bash init.sh                               # start full dev stack
pytest -q                                  # unit tests
npx playwright test                        # E2E tests
cat claude-progress.txt && git log --oneline -10   # session orientation
```
