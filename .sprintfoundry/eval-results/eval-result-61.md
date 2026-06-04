# Eval Result — Sprint 61
Date: 2026-06-04T06:39:30+08:00

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 9/10 | ≥ 7      | PASS |
| Originality     | 7/10 | ≥ 6      | PASS |
| Craft           | 9/10 | ≥ 7      | PASS |
| Functionality   | 10/10 | ≥ 8     | PASS |

## Verdict: SPRINT PASS

## Quality Gate Summary

`quality-gate-61.md` reports PASS: vite build (1.60s), tsc clean in `src/`, pytest 1/1 sprint61 test, pytest 110/110 non-AI regression, 9 pre-existing AI provider timeouts unrelated to Sprint 61. Codex sandbox blocked git commit; orchestrator committed on Codex's behalf (Rule 1.5).

## Scope verification

```
 backend/app/main.py                     | 618 ++++++++++++++++++++++++++++++--
 backend/app/models.py                   |  31 ++
 backend/app/schemas.py                  |  47 ++
 sprint-contract.md                      | 109 +++---
 sprint-fence.json                       |   6 +-
 tests/test_sprint61_ai_observability.py | 141 ++++++++
 6 files changed, 884 insertions(+), 68 deletions(-)
```

All six files are within the contract scope (backend main, models, schemas, test, contract, fence). No scope violations.

## Evidence

### Criterion C1: Capability price CRUD
Result: PASS

PUT `/api/v1/ai/capability-prices/category_match` with payload
`{"prompt_price_per_1k_cny":0.01,"completion_price_per_1k_cny":0.02,"currency":"CNY","enabled":true}`:

```
HTTP/1.1 200 OK
{"id":1,"capability":"category_match","prompt_price_per_1k_cny":0.01,
 "completion_price_per_1k_cny":0.02,"currency":"CNY","enabled":true,
 "created_at":"2026-06-04T06:25:19.505484","updated_at":"2026-06-04T06:38:27.818667"}
```

GET `/api/v1/ai/capability-prices/category_match` returned the same persisted
fields plus persistent identifier `id=1` and `created_at` / `updated_at` timestamps.

Observation: Both PUT and GET round-trip cleanly; PUT/GET echoed every contracted
field (capability, prompt_price_per_1k_cny, completion_price_per_1k_cny, currency, enabled)
and returned the persistent id and timestamps required by step 5.

### Criterion C2: Token capture on OpenAI-compatible response
Result: PASS

Started Python http.server stub on 127.0.0.1:18061 returning
`usage.prompt_tokens=123, completion_tokens=45, total_tokens=168`. Created
model id 154 pointing to the stub. Updated existing capability mapping (id=4)
to use model 154. Invoked the capability and captured
`trace_id=trace-e6c968f58f8244d9bc1c`.

GET `/api/v1/debug/trace/trace-e6c968f58f8244d9bc1c` — the `llm.provider.chat`
span contains:

```json
"prompt_tokens": 123,
"completion_tokens": 45,
"total_tokens": 168,
"cost_cny": 0.00213
```

All three usage values (123, 45, 168) are present both as explicit span
fields and inside `metadata`, satisfying the "metadata or explicit span
fields" allowance in the contract approval note 2.

### Criterion C3: cost_cny exposed with identifiable price source
Result: PASS

Reused the same stub setup and invoked capability, captured
`trace_id=trace-e6c968f58f8244d9bc1c` (same trace as C2 — single invocation
satisfied both criteria simultaneously). The `llm.provider.chat` span shows:

```json
"cost_cny": 0.00213,
"price_source": "ai_capability_prices",
"price_id": 1,
"price_capability": "category_match",
"price_currency": "CNY",
"prompt_price_per_1k_cny": 0.01,
"completion_price_per_1k_cny": 0.02
```

Cost math: (123/1000 * 0.01) + (45/1000 * 0.02) = 0.00123 + 0.00090 = 0.00213.
Returned value matches exactly. Price source is identifiable via
`price_capability: "category_match"`, `price_id: 1`, and the per-1k price fields
on the span.

### Criterion C4: prompt_version and template_key on trace
Result: PASS

POST `/api/v1/ai/prompt-templates` with payload
`{"template_key":"sprint61-category-match","capability":"category_match","prompt_version":"v2026.06.04-contract","content":"Classify material: {{material_name}}","enabled":true}`:

```
HTTP/1.1 201 Created
{"id":1,"template_key":"sprint61-category-match","capability":"category_match",
 "prompt_version":"v2026.06.04-contract","content":"Classify material: {{material_name}}",
 "enabled":true,"created_at":"2026-06-04T06:25:19.532222","updated_at":"2026-06-04T06:39:20.186056"}
```

GET `/api/v1/ai/prompt-templates/sprint61-category-match` returned the same
`prompt_version` and `content`.

Invoke with `template_key` and `template_variables={"material_name":"高压电缆"}`
returned:

```json
"trace_id":"trace-b6b18a1f50074626804a",
"prompt":"Classify material: 高压电缆"
```

The rendered prompt is visible in the invoke response. The trace detail for
`trace-b6b18a1f50074626804a` shows BOTH spans (gateway and llm.provider.chat)
expose `template_key: "sprint61-category-match"` and
`prompt_version: "v2026.06.04-contract"`, plus
`rendered_prompt: "Classify material: 高压电缆"`.

## Required fixes (if SPRINT FAIL)

None — all four criteria pass.

## Notes

- The OpenAI stub on port 18061 was started as a background process for the
  duration of the evaluation and was killed after the test completed.
- Single capability invocation produced a trace that simultaneously satisfies
  C2 (token capture) and C3 (cost_cny + price source), which is expected
  since both are properties of the same `llm.provider.chat` span.
- Codex sandbox note from quality gate: git commit was performed by the
  orchestrator on Codex's behalf (Rule 1.5) — this is the same workaround
  used in Sprint 60.
