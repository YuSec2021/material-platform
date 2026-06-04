## Sprint 60: 前端 web-vitals 性能上报到后端

### Features
- 引入 web-vitals 包，监听 LCP/CLS/INP/FID/TTFB
- POST /api/v1/telemetry/web-vitals 上报
- 后端 telemetry_web_vitals 表持久化

### Success criteria (black-box-verifiable)
- [ ] The backend accepts a valid web-vitals telemetry POST for every supported metric name (LCP, CLS, INP, FID, TTFB) and returns the stored record data.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. For each metric name `LCP`, `CLS`, `INP`, `FID`, and `TTFB`, run a request like `curl -i -sS -X POST http://localhost:8000/api/v1/telemetry/web-vitals -H 'Content-Type: application/json' -d '{"metric":"LCP","value":1234.5,"rating":"good","client_metric_id":"contract-lcp-60-001","navigation_type":"navigate","url":"http://localhost:5173/materials","path":"/materials","user_agent":"contract-check","timestamp":"2026-06-04T00:00:00Z"}'`, replacing `metric`, `value`, and `client_metric_id` with a unique value for each metric.
  3. Assert each response has HTTP status `201 Created` and JSON containing the submitted `metric`, `value`, `rating`, `client_metric_id`, `url`, and `path`, plus a server-generated persistent record identifier.

- [ ] Invalid telemetry payloads are rejected through the public API without creating stored web-vitals records.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Run `curl -i -sS -X POST http://localhost:8000/api/v1/telemetry/web-vitals -H 'Content-Type: application/json' -d '{"metric":"BAD_METRIC","value":100,"rating":"good","client_metric_id":"contract-invalid-60-001","navigation_type":"navigate","url":"http://localhost:5173/materials","path":"/materials","user_agent":"contract-check","timestamp":"2026-06-04T00:00:00Z"}'`.
  3. Assert the response is HTTP `422 Unprocessable Entity` or HTTP `400 Bad Request` and the response body identifies the invalid `metric` field.
  4. Run `curl -sS 'http://localhost:8000/api/v1/telemetry/web-vitals?client_metric_id=contract-invalid-60-001'` and assert the returned result contains zero records.

- [ ] Posted telemetry is persisted and queryable after a backend restart through the external API surface.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Run `curl -i -sS -X POST http://localhost:8000/api/v1/telemetry/web-vitals -H 'Content-Type: application/json' -d '{"metric":"TTFB","value":88.2,"rating":"good","client_metric_id":"contract-persist-60-001","navigation_type":"reload","url":"http://localhost:5173/standard-management","path":"/standard-management","user_agent":"contract-check","timestamp":"2026-06-04T00:01:00Z"}'` and capture the returned persistent record identifier.
  3. Restart the system with `bash init.sh`.
  4. Run `curl -sS 'http://localhost:8000/api/v1/telemetry/web-vitals?client_metric_id=contract-persist-60-001'`.
  5. Assert the response contains exactly one record with `metric` equal to `TTFB`, `value` equal to `88.2`, `navigation_type` equal to `reload`, `path` equal to `/standard-management`, and the same persistent record identifier returned by the POST response.

- [ ] Frontend runtime web-vitals reporting can be exercised without source-code inspection by forwarding a browser-compatible metric payload to the backend API.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Run `curl -sS http://localhost:5173/` and assert the frontend dev server returns the application HTML with HTTP `200 OK`.
  3. Run `curl -i -sS -X POST http://localhost:8000/api/v1/telemetry/web-vitals -H 'Content-Type: application/json' -d '{"metric":"INP","value":145.7,"rating":"needs-improvement","client_metric_id":"contract-frontend-shape-60-001","navigation_type":"navigate","url":"http://localhost:5173/","path":"/","user_agent":"Mozilla/5.0 contract-check","timestamp":"2026-06-04T00:02:00Z"}'`.
  4. Assert the response has HTTP status `201 Created` and JSON preserving the browser-compatible fields `metric`, `value`, `rating`, `navigation_type`, `url`, `path`, and `user_agent`.

### Scope

In:
- Frontend dependency: install the `web-vitals` npm package and register listeners for LCP, CLS, INP, FID, TTFB that POST to the backend endpoint below.
- Backend route: `POST /api/v1/telemetry/web-vitals` accepting JSON payloads with the fields `metric`, `value`, `rating`, `client_metric_id`, `navigation_type`, `url`, `path`, `user_agent`, `timestamp`.
- Backend validation: `metric` must be a tight allowlist of `LCP`, `CLS`, `INP`, `FID`, `TTFB`; other values return HTTP 422/400 and are not persisted.
- Backend response: HTTP 201 Created with the stored record (echoed fields plus a server-generated persistent record identifier).
- Persistence: new `telemetry_web_vitals` table (or equivalent) survives a backend restart.
- Read endpoint: `GET /api/v1/telemetry/web-vitals?client_metric_id=...` returning matching records (used by C2/C3 evidence steps).

Out:
- Authentication, authorization, rate limiting, or tenant scoping for the telemetry endpoint.
- Aggregation, dashboarding, alerting, or analytics on the collected metrics.
- Backend-to-frontend feedback loops (e.g. surfacing thresholds in the UI).
- Migration of historical telemetry data or backfill of any kind.
- Changes to existing telemetry, logging, or observability surfaces outside this endpoint.
- Frontend performance optimizations beyond the instrumentation itself.

---
CONTRACT APPROVED

Sprint: 60
Approved criteria: 4
Notes:
- C2 step 4 and C3 step 4 depend on a `GET /api/v1/telemetry/web-vitals?client_metric_id=...` query endpoint. This read endpoint is not in the planner Features list but is required by the test evidence; Generator must implement it as part of Sprint 60.
- C2 implicitly enforces a tight allowlist on `metric` (422/400 for non-allowlisted values). Generator should reject on the Pydantic field, not on a loose try/except, so the error body identifies the `metric` field as C2 step 3 requires.
- C4 step 2 probes `http://localhost:5173/`. `init.sh` already launches the Vite dev server on port 5173 alongside the backend on port 8000, so no script change is needed.
- All four criteria use distinct `client_metric_id` values (`contract-lcp-60-001`, `contract-invalid-60-001`, `contract-persist-60-001`, `contract-frontend-shape-60-001`) to avoid cross-criterion interference in the persistence table.
