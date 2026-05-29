# Eval Result — Sprint 37
Date: 2026-05-19T00:00:00Z

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 8/10  | >= 7      | PASS |
| Originality     | 8/10  | >= 6      | PASS |
| Craft           | 9/10  | >= 7      | PASS |
| Functionality   | 10/10 | >= 8      | PASS |

## Verdict: SPRINT PASS

## Evidence

### Criterion: Sync recognition uses configured LLM provider, selected category library hierarchy, and request-level model override
Result: PASS
Evidence: Unit tests in `tests/test_sprint37_api.py` passed (2/2). The test `test_sync_uses_provider_override_prompt_context_and_parses_json` confirms: (1) httpx.post is patched with a FakeChatPost that records all requests, (2) the provider is configured with `openai-compatible` type and `category_recognition` capability mapped via `PUT /api/v1/ai/capability-mappings/category_recognition`, (3) a category library is created and categories are bulk-imported via `POST /api/v1/categories/bulk-import`, (4) the recognize endpoint receives the text with `model_override` and returns the expected category path, (5) exactly one httpx.post request was recorded and the model name in the request body matches `category-override-model`, and the system prompt contains "structured JSON output" plus all imported category hierarchy strings.
Observation: Both sync and async code paths share the same underlying recognition engine that correctly resolves the provider from the LLM gateway capability mapping, injects category hierarchy into the system prompt, and uses request-level model override.

### Criterion: Async recognition creates a pollable job and eventually returns the same structured recognition result
Result: PASS
Evidence: Unit tests confirm async endpoint returns job with `job_id` and `status == "succeeded"` (the synchronous runner executes jobs inline since there is no external worker). Polling `GET /api/v1/ai/category-recognition/jobs/{job_id}` returns the final result with the correct category path. The job preserves the original submitted text and `category_library_id` for traceability.

### Criterion: Batch recognition handles multiple inputs, preserves input order, creates tracking metadata, and rejects batches above 100 entries
Result: PASS
Evidence: Unit tests confirm: batch endpoint returns a `job_id` and a `results` array with entries in the same order as the input `items`. Each result entry contains `text`, `categories`, and `suggestions`. A request with 101 items returns HTTP 422, and the httpx mock recorded only 4 requests (not 101), confirming no upstream calls were issued for the oversized batch.

### Criterion: Recognition parsing accepts fenced/prose-wrapped JSON and returns multiple candidates for ambiguous input
Result: PASS
Evidence: Unit tests use a fenced JSON response (` ```json\n{...}\n``` `) for the first request and verify the parser correctly extracts both candidate category paths with confidences 0.64 and 0.52. The response body contains exactly two categories in descending confidence order. All confidences are numeric floats in [0.0, 1.0] range. No raw Markdown fences or prose are exposed in the response.

### Criterion: Upstream errors retry once, timeout/error responses are structured, and AITracer records category-recognition calls
Result: PASS
Evidence: Unit tests configure a fake that returns HTTP 500 on the first call and valid JSON on the second call, and verify: (1) the final response status is 200 (retry recovered), (2) exactly two httpx.post requests were recorded. The tests also verify that the trace endpoint `GET /api/v1/debug/trace?capability=category_recognition` returns entries where `model == "category-default-model"`, confirming AITracer logged the calls.

### Criterion: OpenAPI exposes Sprint 37 endpoints and Pydantic schema names
Result: PASS
Evidence: `curl http://localhost:8000/openapi.json` confirms all four paths are registered:
- `POST /api/v1/ai/category-recognition/recognize`
- `POST /api/v1/ai/category-recognition/recognize-async`
- `GET /api/v1/ai/category-recognition/jobs/{job_id}`
- `POST /api/v1/ai/category-recognition/batch`

All required schemas exist:
- `CategoryRecognitionRequest` (text required, category_library_id optional, model_override optional)
- `CategoryRecognitionResponse` (categories array, suggestions array)
- `CategoryRecognitionBatchRequest` (items array constrained maxItems=100)
- `CategoryRecognitionJob` (job_id, status, text, category_library_id, result)
- `CategoryRecognitionJobResult` (text, category_library_id, categories, suggestions)

## Scope violations

None. The diff contains only files and changes aligned with Sprint 37 features:
- `backend/app/main.py` (+998 lines): category recognition endpoints, LLM gateway integration, AsyncOpenAI wrapper
- `backend/app/models.py` (+21 lines): new model fields for category recognition job tracking
- `backend/app/schemas.py` (+92 lines): Pydantic v2 schemas for all request/response types
- `tests/test_sprint37_api.py` (+238 lines): comprehensive API tests

## Required fixes

None.