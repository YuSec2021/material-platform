# Eval Result — Sprint 60
Date: 2026-06-04T02:52:30Z

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 9/10 | ≥ 7      | PASS |
| Originality     | 7/10 | ≥ 6      | PASS |
| Craft           | 10/10 | ≥ 7     | PASS |
| Functionality   | 10/10 | ≥ 8     | PASS |

## Verdict: SPRINT PASS

## Quality Gate Summary

Quality gate PASS (see `quality-gate-60.md`):
- vite build: PASS (1.53s, no errors)
- tsc (src only): PASS (0 type errors in `src/`)
- pytest (sprint60): PASS (2/2 tests)
- pytest (regression): PASS (109/109 non-AI regression tests; 9 pre-existing AI provider timeouts unrelated to Sprint 60)

## Evidence

### Criterion: C1 — POST with all 5 metric names returns 201
Result: PASS

Evidence: All five POSTs returned `HTTP/1.1 201 Created` with JSON containing the submitted fields plus a numeric `id`.

| Metric | HTTP | id | metric | value | rating | client_metric_id | path |
|--------|------|----|--------|-------|--------|------------------|------|
| LCP    | 201  | 27 | LCP    | 1234.5 | good  | eval-lcp-60-001  | /materials |
| CLS    | 201  | 28 | CLS    | 0.05   | good  | eval-cls-60-001  | /materials |
| INP    | 201  | 29 | INP    | 145.7  | needs-improvement | eval-inp-60-001 | /materials |
| FID    | 201  | 30 | FID    | 12.3   | good  | eval-fid-60-001  | /materials |
| TTFB   | 201  | 31 | TTFB   | 300.0  | good  | eval-ttfb-60-001 | /materials |

All five responses include a server-generated persistent record `id` (27-31). The `metric`, `value`, `rating`, `client_metric_id`, `url`, and `path` are all echoed back in the response.

Observation: Pydantic `Literal` allowlist at the schema layer is the natural and correct validation point; responses are shape-consistent across all five metrics.

### Criterion: C2 — Invalid metric is rejected (422/400) and not persisted
Result: PASS

Evidence:
- POST with `metric: "BAD_METRIC"` returned `HTTP/1.1 422 Unprocessable Entity`:
  ```json
  {"detail":[{"type":"literal_error","loc":["body","metric"],"msg":"Input should be 'LCP', 'CLS', 'INP', 'FID' or 'TTFB'","input":"BAD_METRIC","ctx":{"expected":"'LCP', 'CLS', 'INP', 'FID' or 'TTFB'"}}]}
  ```
  Error body identifies the invalid `metric` field at `loc: ["body", "metric"]` as required.
- GET `http://localhost:8000/api/v1/telemetry/web-vitals?client_metric_id=eval-bad-60-001` returned `[]` (zero records).

Observation: Validation is at the Pydantic schema layer (literal type), producing a 422 with field-level error path. No persistence occurred.

### Criterion: C3 — Persistence across restart
Result: PASS

Evidence:
- POST returned `HTTP/1.1 201 Created` with `id: 32`, `metric: "TTFB"`, `value: 88.2`, `navigation_type: "reload"`, `path: "/standard-management"`, `client_metric_id: "eval-ttfb-60-002"`.
- `bash init.sh` restarted the backend; health check returned 200.
- GET `http://localhost:8000/api/v1/telemetry/web-vitals?client_metric_id=eval-ttfb-60-002` returned exactly 1 record:
  ```json
  [{"metric":"TTFB","value":88.2,"rating":"good","client_metric_id":"eval-ttfb-60-002","navigation_type":"reload","url":"http://localhost:5173/standard-management","path":"/standard-management","user_agent":"eval-check","timestamp":"2026-06-04T00:01:00Z","id":32,"created_at":"2026-06-04T02:51:49.388395"}]
  ```
- All five required fields match: `metric=TTFB`, `value=88.2`, `navigation_type=reload`, `path=/standard-management`, and `id=32` matches the POST response.

Observation: The `telemetry_web_vitals` table persists across a full backend restart cycle. New backend PID (24856) confirms a fresh process; same `id=32` confirms the same row was loaded from the database.

### Criterion: C4 — Frontend dev server returns 200 and a browser-style payload is accepted
Result: PASS

Evidence:
- `curl http://localhost:5173/` returned `HTTP 200` with `Content-Type: text/html` (Vite dev server serving the application).
- POST with browser-style `User-Agent` header returned `HTTP/1.1 201 Created`:
  ```json
  {"metric":"INP","value":145.7,"rating":"needs-improvement","client_metric_id":"eval-frontend-60-001","navigation_type":"navigate","url":"http://localhost:5173/","path":"/","user_agent":"Mozilla/5.0 contract-check","timestamp":"2026-06-04T00:02:00Z","id":33,"created_at":"2026-06-04T02:52:22.771291"}
  ```
  All required browser-compatible fields are preserved: `metric`, `value`, `rating`, `navigation_type`, `url`, `path`, `user_agent`.

Observation: The frontend dev server is up on port 5173 (Vite), and the backend API accepts a browser-shaped payload with full field preservation.

## Scope Verification

```text
backend/app/main.py               | 63 +++++++++++++++++++++++++++++
backend/app/models.py             | 16 ++++++++
backend/app/schemas.py            | 22 +++++++++-
prototype_code/package-lock.json  |  7 ++++
prototype_code/package.json       |  9 +++--
prototype_code/src/main.tsx       |  3 ++
sprint-contract.md                | 84 ++++++++++++++++++++++++---------------
sprint-fence.json                 |  9 +++--
tests/test_sprint60_web_vitals.py | 69 ++++++++++++++++++++++++++++++++
9 files changed, 241 insertions(+), 41 deletions(-)
```

All changes are confined to Sprint 60's contracted scope:
- Backend: route handler in `main.py`, model in `models.py`, schema in `schemas.py`
- Frontend: web-vitals import in `main.tsx`, dependency in `package.json` and `package-lock.json`
- Tests: `tests/test_sprint60_web_vitals.py`
- Sprint planning artifacts: `sprint-contract.md`, `sprint-fence.json`

No scope violations: no deletions in `prototype_code/dist/`, no `planner-spec.json` changes, no `claude-progress.txt` drift, no unrelated refactors.

## Summary

All four contracted criteria pass with black-box HTTP evidence. The implementation is well-scoped, uses Pydantic literal validation at the schema layer (422 with field-level error), persists across restarts, and accepts browser-shaped payloads without field loss. The quality gate (vite build, tsc, pytest sprint60, pytest regression) is clean. The implementation matches the sprint contract's "In" list and contains none of the "Out" items.
