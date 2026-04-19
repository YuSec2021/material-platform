[中文](./README.zh-CN.md) | **English**

# autonomous-sprint-harness

A multi-agent harness for product iteration: Claude handles planning, routing, and evaluation, while Codex handles real code implementation. This repository is primarily a process and protocol repo. It is not an application codebase by itself.

## Project Architecture

### Core Roles

The harness is built around four collaborating roles:

| Role | Runtime | Responsibility |
| --- | --- | --- |
| Planner | Claude Code | Expands a short user request into a product spec, visual design language, and sprint plan |
| Generator | Codex CLI | Reads the spec and approved sprint contract, implements one sprint, self-checks, and commits |
| Evaluator | Claude Code + Playwright MCP | Reviews the sprint contract and performs a live browser CHECK |
| Orchestrator | Claude Code | Reads file state and decides whether to invoke the Planner, Generator, or Evaluator |

### Boundary of Responsibility

This architecture has a strict boundary:

- Claude does not write application code
- Codex does not evaluate its own output
- Progress advances through file artifacts, not chat memory

### File-State Architecture

The harness is designed as a file-driven state machine rather than a conversational memory system:

- `planner-spec.json`
  Product spec, design language, tech stack, and sprint list written by the Planner
- `change-request.md`
  Post-launch iteration request that must be classified before entering an iteration sprint or replan path
- `bug-report.md`
  Dedicated defect intake used to create a standalone bugfix sprint
- `sprint-contract.md`
  The acceptance contract for the current sprint; must be approved by the Evaluator first
- `eval-result-{N}.md`
  Sprint evaluation result for sprint `N`; only the Evaluator can write it
- `eval-trigger.txt`
  Signal file written after the Generator commits
- `run-state.json`
  Unattended-mode run state, retry counters, and escalation flags
- `run-events.ndjson`
  Structured runtime event stream for auditing and monitoring
- `orchestrator-log.ndjson`
  Audit log for Orchestrator routing decisions
- `human-escalation.md`
  Human-facing handoff summary when the loop pauses
- `claude-progress.txt`
  Compact cross-session progress log
- `init.sh`
  Unified entrypoint for starting the full development environment

## Required Entry Point

If you want the workflow to be enforced instead of loosely followed through prompting, treat this as the only valid entrypoint:

```bash
./orchestrate.sh --project-dir /absolute/path/to/project --user-prompt "one-line product request"
```

Or run the Python entry directly:

```bash
python3 scripts/orchestrate.py --project-dir /absolute/path/to/project --user-prompt "one-line product request"
```

It reads disk state first, then routes to the next phase:

- No `planner-spec.json` -> Planner only
- `bug-report.md` exists -> bugfix sprint contract first
- `change-request.md` with `Type: minor_feature` -> iteration sprint contract first
- `change-request.md` with `Type: major_feature` or `replan` -> Planner revises the spec first
- `sprint-contract.md` exists but has no `CONTRACT APPROVED` -> Evaluator contract review only
- `eval-trigger.txt` exists -> Evaluator live CHECK only
- Generator implementation is only allowed after the contract is approved

The point is to prevent the main agent from jumping straight into implementation.

### Context Hygiene Design

This harness is designed for long-running work without context bloat. The goal is not to make the model remember everything; the goal is to make each phase rely on the smallest current set of valid facts.

Design principles:

- Store state in files instead of long chat memory
- Keep each sprint as a rereadable, isolated work unit
- Separate Generator and Evaluator so the system cannot self-certify
- Use `claude-progress.txt` as a compressed handoff, not an ever-growing transcript

As the project gets longer, the system should depend on reconstructible context rather than accumulated context.

### Sprint Branching

The recommended setup is one Git branch per sprint instead of stacking all implementation directly onto `main`.

Benefits:

- Each sprint's implementation and retry history stay isolated
- Evaluator failures are easier to inspect and repair
- `main` only contains accepted progress
- Unattended mode can record and recover the active branch explicitly

### Documentation Layers

The repository is organized into three documentation layers:

1. [AGENTS.md](./AGENTS.md)
   The tool-agnostic master spec and the Generator handbook read directly by Codex.
2. [CLAUDE.md](./CLAUDE.md)
   The Claude-side operations guide covering subagents, MCP, hooks, and Codex invocation.
3. [agents/planner.md](./agents/planner.md)
   [agents/generator.md](./agents/generator.md)
   [agents/evaluator.md](./agents/evaluator.md)
   [agents/orchestrator.md](./agents/orchestrator.md)
   Finer-grained role prompts and execution rules that mirror the Claude-side role definitions.

### Current Repository Status

- This is a process/protocol repository, not an application code repository.
- The main workflow today is a sprint loop centered on `planner-spec.json`.
- The harness currently supports three entry modes: new product planning, bugfix sprints, and iteration sprints.
- `AGENTS.md`, `CLAUDE.md`, and `agents/*.md` are aligned to the same state model.
- The recommended source hierarchy is: `AGENTS.md` as the primary spec, `CLAUDE.md` as the Claude runtime guide, and `agents/*.md` as role detail.

## Workflow

The full flow looks like this:

```text
User request
  -> Orchestrator reads file state and routes
  -> Planner writes planner-spec.json / init.sh / claude-progress.txt
  -> Generator proposes sprint-contract.md
  -> Evaluator reviews the contract and writes CONTRACT APPROVED
  -> Generator implements the sprint, runs tests, and commits
  -> Generator writes eval-trigger.txt
  -> Evaluator performs a live browser acceptance check with Playwright
  -> Evaluator writes eval-result-{N}.md
  -> PASS moves to the next sprint, FAIL goes back to Generator for fixes
```

There is one key gate:

- Without `CONTRACT APPROVED`, the Generator must not start coding.

Key state rules:

- No `planner-spec.json` means planning comes first
- `bug-report.md` means bugfix routing comes first
- `change-request.md` is routed by `Type` into bugfix, iteration, or replan
- Unapproved `sprint-contract.md` means contract review comes first
- `eval-trigger.txt` means live CHECK comes first
- A sprint is complete only when `eval-result-{N}.md` contains `SPRINT PASS`

## Context Hygiene Rules

To reduce AI slop, patch-on-patch drift, and context inflation, the harness assumes these rules by default:

### 1. Files Override Chat

- Every phase begins by reading the current file artifacts
- If files and chat disagree, trust the files
- The Orchestrator routes from disk state, not remembered conversation state

### 2. `claude-progress.txt` Stays Compact

`claude-progress.txt` is a rolling handoff, not a transcript:

- Keep the latest project summary
- Keep only the most recent three sprint entries
- Keep each sprint entry to three to five lines
- Record only status, major changes, blockers, and evaluator feedback

Older content should be compressed, not endlessly appended.

### 3. Read Only the Minimum Required Context

Before implementation, the Generator should reread only:

- `planner-spec.json`
- `sprint-contract.md`
- The latest relevant `eval-result-{N}.md` only when retrying

The full chat history must not be treated as implementation truth.

### 4. Run a Hygiene Pass Before Every Commit

Before each sprint commit, check:

- No debug output or temporary logs remain
- No duplicated logic was created during retries
- No low-quality wrapper abstractions were added just to avoid cleanup
- The diff is still focused on the approved sprint rather than opportunistic scope creep

### 5. Sprint Failure Fixes Must Stay Narrow

When a sprint fails:

- Fix only what the Evaluator cited
- Do not mix in unrelated refactors
- If the issue has become architecture drift, route it back to planning instead of piling on patches

## Unattended Mode

If you want the harness to advance automatically over time, use a bounded unattended loop rather than an infinite autonomous cycle.

### Design Goals

- Recover from file state on every run
- Support timer-based or daemon-based execution
- Pause automatically on repeated failure
- Leave a clear handoff point for a human

### Key State File

Unattended mode should maintain `run-state.json`. A template is included:

- [run-state.example.json](./run-state.example.json)

Recommended fields:

- `mode`
- `current_sprint`
- `retry_count`
- `last_successful_sprint`
- `last_failure_reason`
- `needs_human`
- `active_branch`
- `base_branch`
- `last_run_at`

### Suggested Execution Loop

```text
Timer / daemon
  -> Read run-state.json
  -> Run Orchestrator
  -> Invoke Planner / Codex / Evaluator according to file state
  -> Update run-state.json and claude-progress.txt
  -> Decide complete / paused / next loop
```

### Required Pause Conditions

To avoid infinite self-looping, pause and wait for a human when:

- The same sprint fails more than twice
- `init.sh` cannot recover the development environment
- The Evaluator classifies the issue as architecture drift
- The sprint contract would need to change in order to continue
- Required secrets, services, or dependencies are missing

At minimum, a pause should:

- Write `mode = paused` and `needs_human = true` into `run-state.json`
- Add a short blocker summary to `claude-progress.txt`

## Repository Layout

```text
.
├── AGENTS.md
├── CLAUDE.md
├── skills
│   ├── harness-observability
│   │   ├── SKILL.md
│   │   └── references
│   └── harness-branching
│       └── SKILL.md
└── agents
    ├── evaluator.md
    ├── generator.md
    ├── orchestrator.md
    └── planner.md
```

## Local Skills

The repository currently includes two local operational governance skills:

- [skills/harness-observability/SKILL.md](./skills/harness-observability/SKILL.md)
- [skills/harness-branching/SKILL.md](./skills/harness-branching/SKILL.md)

They package the following capabilities into reusable workflows:

- unattended run-state maintenance
- structured event logging
- Orchestrator routing audit logs
- human escalation summaries
- `claude-progress.txt` compression and context hygiene
- sprint branch creation, switching, and merge constraints

The repository also includes minimal templates:

- [run-state.example.json](./run-state.example.json)
- [run-events.example.ndjson](./run-events.example.ndjson)
- [orchestrator-log.example.ndjson](./orchestrator-log.example.ndjson)
- [human-escalation.example.md](./human-escalation.example.md)

## Usage

### 1. Prepare the Environment

Minimum requirements:

- Claude Code
- Codex CLI
- Node.js / npm
- Python and `pytest`
- Playwright MCP
- A real project directory that can actually start

`CLAUDE.md` shows the minimum Codex setup:

```bash
npm install -g @openai/codex
codex --version
```

If Codex is already authenticated locally, you do not need `OPENAI_API_KEY`.
You only need it in a pure CLI environment where Codex has not been logged in yet.

If you need Playwright MCP, configure it as shown in `CLAUDE.md`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@0.0.29"]
    }
  }
}
```

Pinning the Playwright MCP version is recommended instead of using `@latest`, so long-running projects do not break on upstream changes.

### 2. Initialize a Real Project

This repository does not include `planner-spec.json`, `init.sh`, tests, or application code by default. To use the harness with a real project, you would typically:

1. Copy the protocol files into the target project directory.
2. Initialize a Git repository.
3. Let the Planner generate:
   - `planner-spec.json`
   - `init.sh`
   - `claude-progress.txt`
4. Make sure `init.sh` can actually start the frontend, backend, and dependencies.

In practical terms:

- This repository provides the collaboration protocol
- The actual application code, tests, database, and runtime scripts belong in the product repo that adopts it

### 3. Orchestrator Phase

The Orchestrator is the entrypoint. It reads file state first, then decides which path to take:

- no `planner-spec.json` -> call Planner
- `bug-report.md` exists -> call Codex to create a bugfix sprint contract first
- `change-request.md` exists -> route by `Type` into bugfix, minor iteration, or replan
- pending `sprint-contract.md` exists -> call Evaluator for contract review
- `eval-trigger.txt` exists -> call Evaluator for live CHECK
- otherwise -> call Codex for the next sprint

If `claude-progress.txt` has turned into a long log, the Orchestrator should compress it back into summary form before continuing.
If unattended mode is enabled, the Orchestrator should also read and write `run-state.json` and pause proactively after exceeding retry thresholds.

The repository includes a minimal executable implementation:

- [scripts/orchestrate.py](./scripts/orchestrate.py)
- [orchestrate.sh](./orchestrate.sh)
- [change-request.example.md](./change-request.example.md)
- [bug-report.example.md](./bug-report.example.md)
- [tests/test_orchestrate.py](./tests/test_orchestrate.py)

It currently:

- reads `planner-spec.json` / `change-request.md` / `bug-report.md` / `sprint-contract.md` / `eval-trigger.txt`
- computes the current sprint
- updates `run-state.json`
- appends to `orchestrator-log.ndjson` and `run-events.ndjson`
- blocks direct implementation when contract approval is missing
- creates the appropriate contract first for bugfix and iteration requests instead of jumping straight to code

### 4. Planner Phase

When the user provides a one- to four-sentence product request, the Planner in Claude generates the complete specification.

Outputs:

- `planner-spec.json`
- `init.sh`
- initial `claude-progress.txt` entry

### 5. Generator Phase

The Orchestrator invokes the Generator through Codex CLI. The Generator is not a Claude subagent; it is an external Codex process.

Typical invocation:

```bash
codex -a never exec --skip-git-repo-check \
  "Read planner-spec.json. Propose sprint-contract.md for Sprint N. Follow AGENTS.md Generator rules."
```

After contract approval, implementation begins:

```bash
codex -a never exec --skip-git-repo-check \
  "sprint-contract.md is approved. Implement Sprint N. Commit and write eval-trigger.txt. Follow AGENTS.md."
```

The fixed session-start ritual for Generator is:

```bash
cat claude-progress.txt
git log --oneline -10
bash init.sh
```

Then it must run a smoke test before touching code.

One additional operating principle in this architecture:

- Prefer deleting weak code over layering new abstractions onto it

### 6. Evaluator Phase

The Evaluator has two modes:

- Contract Review
  Checks whether `sprint-contract.md` is observable and browser-testable
- Live CHECK
  Reads `eval-trigger.txt`, starts the environment, and executes each acceptance step through Playwright MCP

Acceptance results are written to:

- `eval-result-{N}.md`

Only `SPRINT PASS` completes the sprint.

### 7. Fixing a Sprint FAIL

If the Evaluator fails a sprint, the Generator may only address the issues explicitly named in `eval-result-{N}.md`:

```bash
codex -a never exec --skip-git-repo-check \
  "Sprint N failed. Read eval-result-N.md. Fix only the cited issues. Re-commit and update eval-trigger.txt."
```

## Common Commands

```bash
bash init.sh
pytest -q
npx playwright test
cat claude-progress.txt
cat sprint-contract.md
cat eval-trigger.txt
```

## Recommended Adoption Conventions

To make the harness stable in a real project, it helps to enforce the following:

- define one clear source of truth, with `AGENTS.md` at the top
- keep `init.sh` idempotent and rerunnable
- make both `pytest -q` and a browser smoke test pass locally
- keep one clean commit per sprint
- use one Git branch per sprint, ideally `codex/sprint-<N>-<slug>`
- keep Generator and Evaluator from modifying each other's artifacts
- make Orchestrator route strictly from file state rather than memory
- compress `claude-progress.txt` regularly so it does not become a giant context container
- treat deletion of temporary code, fake abstractions, and duplicate logic as a standard pre-commit step
- add a scheduler or watchdog for unattended mode that recovers only from file state
- enforce a maximum automatic retry count per sprint before human escalation

## Known Notes

- This directory is not currently a Git repository, so the commit, log, and recovery flows described in the docs cannot be demonstrated directly here.
- The repository is still primarily a protocol repo and does not yet include a minimal runnable example project.
- The unattended mode state model and rules are defined, but there is no bundled production watchdog or scheduler implementation yet.
- If you continue evolving this repository, the highest-value next step is to add a minimal runnable example project so `init.sh`, tests, evaluation, and the unattended loop can run end to end.

## Reference

- [Anthropic Engineering: Harness Design for Long-Running Apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
