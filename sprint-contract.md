## Sprint 10: LLM Gateway and AI Infrastructure

### Features
- F17-LLM Gateway: model_config CRUD for DashScope, Azure OpenAI, vLLM, and Ollama providers.
- F17-Capability model mapping for AI capabilities, including hot-switch behavior without application restart.
- F17-AES-256 encrypted API key storage with masked browser/API reads and usable persisted credentials.
- F17-Connection test on save and explicit connection test action.
- F17-Fallback model auto-switch when the primary model times out or returns 5xx.
- F18-AITracer framework: @trace decorator, SpanCollector, persisted tracer.spans records, and trace debug UI at /debug/trace.

### Success criteria (black-box-verifiable)
- [ ] Administrators can create, edit, disable, and safely view LLM model configurations without exposing stored API keys.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser as a seeded administrator.
  2. Open the LLM model management page from system administration, or directly open its documented route from `http://localhost:5173` navigation.
  3. Create a model configuration named `Sprint 10 Primary <timestamp>` with provider `vLLM` or `Ollama`, base URL `http://127.0.0.1:18080`, model name `primary-model`, and API key `sprint10-secret-primary`.
  4. Reload the model management page and assert the new model remains listed with provider, model name, base URL, status, and a masked API key value that does not reveal `sprint10-secret-primary`.
  5. Open `http://localhost:8000/openapi.json`, identify the documented model configuration list/detail endpoints, and send real HTTP requests as the same administrator.
  6. Assert the API responses contain the saved model metadata but do not contain the literal string `sprint10-secret-primary`.
  7. Edit the model display name or timeout setting, save, reload `http://localhost:5173`, and assert the edited value persists.
  8. Disable the model, reload the page, and assert the model remains visible as disabled and is unavailable for new capability mappings.

- [ ] Connection testing uses the configured provider endpoint and records clear success and failure results.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then start a local OpenAI-compatible mock provider at `http://127.0.0.1:18080` that accepts `POST /v1/chat/completions` and returns HTTP 200 with a minimal chat completion JSON body.
  2. In the browser at `http://localhost:5173`, create or edit an enabled model configuration named `Sprint 10 Connection OK <timestamp>` that points to `http://127.0.0.1:18080` and model `connection-ok`.
  3. Trigger the connection test from the save flow or explicit test action and assert the UI reports success without requiring a page reload.
  4. Stop or reconfigure the mock provider so `http://127.0.0.1:18081/v1/chat/completions` is unreachable or returns HTTP 500.
  5. Create or edit a model configuration named `Sprint 10 Connection Fail <timestamp>` pointing to `http://127.0.0.1:18081`, trigger the connection test, and assert the UI reports a failure with a human-readable timeout, network, or 5xx error.
  6. Reload `http://localhost:5173` and assert the latest connection status or last test result for each model remains visible.

- [ ] Capability-to-model mappings can be changed at runtime and the active model hot-switches without restarting backend or frontend services.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then start two local OpenAI-compatible mock providers at `http://127.0.0.1:18080` and `http://127.0.0.1:18082`; each provider must return a response body that uniquely identifies its model, such as `primary-model` and `secondary-model`.
  2. In `http://localhost:5173`, create two enabled model configurations named `Sprint 10 Primary <timestamp>` and `Sprint 10 Secondary <timestamp>` pointing to those two provider URLs.
  3. Open the capability mapping UI and map an AI capability such as `category_match`, `material_analysis`, or another documented capability to `Sprint 10 Primary <timestamp>`.
  4. From the browser or documented API surface, trigger that capability through the application and assert the externally visible result, mock-provider request log, or response metadata shows `primary-model` was used.
  5. Without rerunning `bash init.sh` or restarting any process, change the same capability mapping to `Sprint 10 Secondary <timestamp>` and save.
  6. Trigger the same capability again and assert the result, mock-provider request log, or response metadata now shows `secondary-model` was used.
  7. Reload `http://localhost:5173`, reopen the mapping UI, and assert the saved mapping still points to `Sprint 10 Secondary <timestamp>`.

- [ ] The gateway falls back to the configured fallback model when the primary provider times out or returns a 5xx response.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then start a primary mock provider at `http://127.0.0.1:18083` that returns HTTP 500 or intentionally delays past the configured timeout for `POST /v1/chat/completions`.
  2. Start a fallback mock provider at `http://127.0.0.1:18084` that returns HTTP 200 with a response body identifying `fallback-model`.
  3. In `http://localhost:5173`, create enabled model configurations for both providers, configure the primary model with a short timeout, and set the fallback model as its fallback or as the fallback for the same capability mapping.
  4. Map an AI capability such as `category_match`, `material_analysis`, or another documented capability to the primary model.
  5. Trigger that capability through the browser or documented API surface and assert the user receives a successful AI result from `fallback-model` rather than an unhandled failure.
  6. Assert the mock-provider logs show the primary provider was attempted before the fallback provider.
  7. Change the primary mock provider to return HTTP 200, trigger the same capability again, and assert the primary model is used and the fallback provider is not called for that successful request.

- [ ] AITracer records trace spans for gateway activity and exposes them through the debug trace UI.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then trigger at least one successful LLM gateway-backed capability from `http://localhost:5173` using a local mock provider such as `http://127.0.0.1:18080`.
  2. Open `http://localhost:5173/debug/trace` in the same browser session.
  3. Assert the debug trace list includes a new trace for the gateway-backed capability with a trace ID, start time, status, duration, and root operation name.
  4. Open the trace detail view and assert it shows a parent-child span tree containing at least one application chain span and one LLM/provider span.
  5. Assert the LLM/provider span shows model/provider metadata, status, latency or duration, and an error field only when the request failed.
  6. Reload `http://localhost:5173/debug/trace` and assert the trace remains visible, proving spans were persisted rather than kept only in memory.

- [ ] The trace debug UI supports practical investigation controls and is blocked when AI debug mode is disabled.
  Evaluator steps:
  1. Start the system with `bash init.sh`, generate at least one successful gateway trace and one failed or fallback gateway trace, then open `http://localhost:5173/debug/trace`.
  2. Use the trace UI filters for status, operation or capability name, and time range; assert the trace list updates to include matching traces and exclude non-matching traces.
  3. Open a failed or fallback trace and assert the detail view displays the failure reason or fallback decision without exposing plaintext API keys.
  4. Stop the running services, restart the application with `AI_DEBUG=false` using the documented startup command or environment override, and open `http://localhost:5173/debug/trace`.
  5. Assert the debug trace page is unavailable in non-debug mode by showing a 403/access-denied state, a not-found state, or a redirect to a safe page.
  6. Restart the application with `AI_DEBUG=true` and assert `http://localhost:5173/debug/trace` is available again to an administrator.

---

CONTRACT APPROVED
