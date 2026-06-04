## Sprint 61: AI 链路观测性：token 用量、cost、prompt 版本

### Features
- call_model_config 解析 OpenAI 兼容 usage.prompt_tokens/completion_tokens 入 TracerSpan
- AiCapabilityPrice 表维护单价，算 cost_cny
- prompt 模板加 prompt_version 字段

### Success criteria (black-box-verifiable)
- [ ] Capability token prices can be maintained through the public API and read back without source-code inspection.
  Evaluator steps:
  1. Start the system with `AI_DEBUG=true bash init.sh`.
  2. Run `curl -i -sS -X PUT http://localhost:8000/api/v1/ai/capability-prices/category_match -H 'Content-Type: application/json' -d '{"prompt_price_per_1k_cny":0.01,"completion_price_per_1k_cny":0.02,"currency":"CNY","enabled":true}'`.
  3. Assert the response has HTTP status `200 OK` or `201 Created` and JSON containing `capability` equal to `category_match`, `prompt_price_per_1k_cny` equal to `0.01`, `completion_price_per_1k_cny` equal to `0.02`, `currency` equal to `CNY`, and `enabled` equal to `true`.
  4. Run `curl -sS http://localhost:8000/api/v1/ai/capability-prices/category_match`.
  5. Assert the GET response returns the same persisted price fields plus a persistent identifier or timestamp field.

- [ ] An OpenAI-compatible model response records prompt and completion token usage on the trace span returned by the debug trace API.
  Evaluator steps:
  1. Start the system with `AI_DEBUG=true bash init.sh`.
  2. Start a local OpenAI-compatible stub with `python3 - <<'PY' >/tmp/sprint61-openai-stub.log 2>&1 & echo $! >/tmp/sprint61-openai-stub.pid
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = {
            "id": "chatcmpl-sprint61",
            "object": "chat.completion",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "observed"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 123, "completion_tokens": 45, "total_tokens": 168},
        }
        encoded = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
HTTPServer(("127.0.0.1", 18061), Handler).serve_forever()
PY`.
  3. Create a model pointing to the stub by running `MODEL_ID=$(curl -sS -X POST http://localhost:8000/api/v1/models -H 'Content-Type: application/json' -d '{"display_name":"Sprint61 Usage Model","provider":"openai","model_name":"sprint61-usage-model","base_url":"http://127.0.0.1:18061/v1","api_key":"test-key","timeout":5,"temperature":0,"max_tokens":128,"enabled":true}' | jq -r '.id')`.
  4. Create or update the capability mapping so `category_match` uses that model by running `curl -sS -X POST http://localhost:8000/api/v1/capability-mappings -H 'Content-Type: application/json' -d "{\"capability\":\"category_match\",\"primary_model_id\":${MODEL_ID},\"enabled\":true}" || true`, then if the POST reports a duplicate mapping, use `curl -sS http://localhost:8000/api/v1/capability-mappings` to find the `category_match` mapping id and run `curl -sS -X PUT http://localhost:8000/api/v1/capability-mappings/{mapping_id} -H 'Content-Type: application/json' -d "{\"primary_model_id\":${MODEL_ID},\"enabled\":true}"`.
  5. Invoke the capability with `TRACE_ID=$(curl -sS -X POST http://localhost:8000/api/v1/ai/capabilities/category_match/invoke -H 'Content-Type: application/json' -d '{"prompt":"Sprint 61 usage capture check","messages":[{"role":"user","content":"Sprint 61 usage capture check"}]}' | jq -r '.trace_id')`.
  6. Run `curl -sS http://localhost:8000/api/v1/debug/trace/${TRACE_ID}`.
  7. Assert the response contains an `llm.provider.chat` span whose externally visible JSON includes `prompt_tokens` equal to `123`, `completion_tokens` equal to `45`, and `total_tokens` equal to `168` in the span metadata or explicit span fields.

- [ ] The trace detail API exposes `cost_cny` calculated from persisted capability prices and captured token usage.
  Evaluator steps:
  1. Start the system with `AI_DEBUG=true bash init.sh`.
  2. Run `curl -sS -X PUT http://localhost:8000/api/v1/ai/capability-prices/category_match -H 'Content-Type: application/json' -d '{"prompt_price_per_1k_cny":0.01,"completion_price_per_1k_cny":0.02,"currency":"CNY","enabled":true}'`.
  3. Use the same local OpenAI-compatible stub shape from the previous criterion, returning `usage.prompt_tokens=123`, `usage.completion_tokens=45`, and `usage.total_tokens=168` at `http://127.0.0.1:18061/v1/chat/completions`.
  4. Invoke `category_match` through `curl -sS -X POST http://localhost:8000/api/v1/ai/capabilities/category_match/invoke -H 'Content-Type: application/json' -d '{"prompt":"Sprint 61 cost check","messages":[{"role":"user","content":"Sprint 61 cost check"}]}'` and capture the returned `trace_id`.
  5. Run `curl -sS http://localhost:8000/api/v1/debug/trace/{trace_id}` using the captured trace id.
  6. Assert the LLM span includes `cost_cny` equal to `0.00213` or `0.002130`, calculated as `(123 / 1000 * 0.01) + (45 / 1000 * 0.02)`, and includes enough price metadata to identify the `category_match` price source.

- [ ] Prompt templates persist `prompt_version`, and invocations using a template expose that prompt version in trace detail.
  Evaluator steps:
  1. Start the system with `AI_DEBUG=true bash init.sh`.
  2. Run `curl -i -sS -X POST http://localhost:8000/api/v1/ai/prompt-templates -H 'Content-Type: application/json' -d '{"template_key":"sprint61-category-match","capability":"category_match","prompt_version":"v2026.06.04-contract","content":"Classify material: {{material_name}}","enabled":true}'`.
  3. Assert the response has HTTP status `201 Created` or `200 OK` and JSON containing `template_key` equal to `sprint61-category-match`, `capability` equal to `category_match`, `prompt_version` equal to `v2026.06.04-contract`, and `enabled` equal to `true`.
  4. Run `curl -sS http://localhost:8000/api/v1/ai/prompt-templates/sprint61-category-match` and assert the same `prompt_version` and `content` are returned.
  5. Configure `category_match` to use an enabled local model, then invoke the template with `TRACE_ID=$(curl -sS -X POST http://localhost:8000/api/v1/ai/capabilities/category_match/invoke -H 'Content-Type: application/json' -d '{"template_key":"sprint61-category-match","template_variables":{"material_name":"高压电缆"}}' | jq -r '.trace_id')`.
  6. Assert the invoke response content or trace metadata shows the rendered prompt value `Classify material: 高压电缆`.
  7. Run `curl -sS http://localhost:8000/api/v1/debug/trace/${TRACE_ID}` and assert at least one span exposes `template_key` equal to `sprint61-category-match` and `prompt_version` equal to `v2026.06.04-contract`.

### Scope

In:
- Persist prompt/completion/total token counts from OpenAI-compatible `usage` payloads when `call_model_config` returns successfully.
- Persist and expose AI capability token prices, keyed by capability, with prompt and completion prices in CNY per 1,000 tokens.
- Calculate and expose `cost_cny` on trace detail using captured token counts and the active `AiCapabilityPrice` record for the invoked capability.
- Add prompt template persistence with `template_key`, `capability`, `prompt_version`, `content`, and `enabled`.
- Allow capability invocation to use a stored prompt template and include `template_key` and `prompt_version` in trace detail.
- Keep all Sprint 61 verification possible through HTTP API calls against `http://localhost:8000`.

Out:
- Frontend dashboards, charts, or navigation changes for AI observability.
- Authentication or tenant-scoping changes beyond existing API behavior.
- Historical backfill for traces created before Sprint 61.
- Non-CNY pricing, exchange-rate conversion, or per-provider billing exports.
- Streaming token accounting.
- Changes to the Evaluator-owned `eval-result-*` files or any `SPRINT PASS` / `SPRINT FAIL` verdict.

---
CONTRACT APPROVED

Sprint: 61
Approved criteria: 4
Notes:
- C1: AI_DEBUG=true is redundant (codebase default is "true") but harmless. New endpoint PUT/GET /api/v1/ai/capability-prices/{capability} is an acceptable Sprint 61 deliverable.
- C2: The Python http.server stub is necessary because the existing `mock` provider short-circuits via `local_model_completion` and does not emit `usage` data, so the stub is the only way to exercise the OpenAI usage parsing path. "Metadata or explicit span fields" is acceptable since TracerSpan.metadata_json stores an arbitrary dict. Step 4 leaves mapping-id extraction to the evaluator — use `jq -r '.[] | select(.capability=="category_match") | .id'` on the GET response.
- C3: Accepting both `0.00213` and `0.002130` covers Python float representation. No rounding rule is required.
- C4: New endpoints POST/GET /api/v1/ai/prompt-templates are acceptable Sprint 61 deliverables. Step 7 requires template_key and prompt_version visible on at least one span in the trace detail JSON.
