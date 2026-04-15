# Human Escalation

## Current State

- Mode: paused
- Sprint: 3
- Retry count: 3
- Last successful sprint: 2

## Why It Paused

- Sprint 3 exceeded the unattended retry limit.
- The latest evaluator result indicates architecture drift rather than a local defect.

## Files To Inspect

- `run-state.json`
- `eval-result-3.md`
- `sprint-contract.md`
- `claude-progress.txt`
- `orchestrator-log.ndjson`

## Recommended Action

- Decide whether Sprint 3 should be re-planned instead of retried.
- If the contract scope changed, replace or revise `sprint-contract.md` before resuming.
- Reset `retry_count` only after human review confirms the next action.
