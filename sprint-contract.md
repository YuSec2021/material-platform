## Sprint 55: AI模型配置架构重构：数据迁移 + 旧表清理 + E2E验收测试

### Features
- Data migration script: migrate all `model_config` and `ai_agent_config` records into the unified `Model` table, preserving provider, model name, base URL, encrypted key, timeout, display name, temperature, max tokens, enabled state, and connection state where available.
- Duplicate handling: when `model_config` and `ai_agent_config` contain the same `(provider, model_name)`, keep one unified model row and prefer the richer agent configuration fields without creating duplicates.
- Mapping migration: migrate `capability_model_mapping` and `capability_agent_mapping` into `CapabilityMapping`; when both legacy tables define the same capability, prefer the agent mapping, and set missing model references to `null` with a migration warning instead of failing the run.
- Migration idempotency: running the migration repeatedly produces the same unified model and mapping rows, records migrated state with `migration_data_version`, and leaves a rollback path available until final cleanup is explicitly completed.
- Migration with existing data: process the 414 mock `ModelConfig` records and any existing `AIAgentConfig` records; migrated mock/test records are marked with `is_test` in the unified model surface.
- Old table cleanup: after successful verification, remove legacy AI config surfaces backed by `model_config`, `ai_agent_config`, `capability_model_mapping`, and `capability_agent_mapping`; remove the Sprint 52 backward compatibility path and legacy Pydantic/API references.
- E2E testing of the complete refactor: cover Model Gateway CRUD, credential edit masking, connection test, delete constraints, Capability Mapping primary/fallback assignment, resolved-model usage in an AI capability flow, and migration verification through the browser test surface.
- Regression testing: verify F21 rule evaluation, F25 category recognition, and F33/F34 material-category matching still resolve models through the unified `CapabilityMapping` path after migration.
- Performance verification: `model_for_capability()` single lookup is under 10 ms, a batch of 10 lookups is under 100 ms, and model connection testing returns before the configured 30 second timeout.
- Final cleanup and version bump: update API documentation and externally visible version metadata to `15.0.0` for the breaking schema change.

### Success criteria (black-box-verifiable)
- [ ] Legacy AI configuration data is migrated into unified models idempotently.
  Evaluator steps:
  1. Start the system with `bash init.sh`, open `http://localhost:5173/login`, sign in as `super_admin`, and navigate to `http://localhost:5173/ai/models`.
  2. In the same Playwright browser context, call `POST http://localhost:8000/api/v1/model-gateway-migration/run` twice with the active browser session.
  3. Assert the first response reports `status` as `migrated` or `already_migrated`, `legacy_models_seen >= 414`, and `model_rows_after >= 414`.
  4. Assert the second response reports `models_created = 0`, `mappings_created = 0`, and the same `migration_checksum` as the first response.
  5. Fetch `GET http://localhost:8000/api/v1/models?page=1&page_size=1000` and assert there are no duplicate `(provider, model_name)` pairs, migrated mock rows have `is_test: true`, and no response field exposes a plaintext API key.

- [ ] Capability mappings are migrated with agent precedence and null-safe model references.
  Evaluator steps:
  1. Open `http://localhost:5173/ai/capability-mappings` after migration completes.
  2. Fetch `GET http://localhost:8000/api/v1/capability-mappings` and assert the standard capabilities `material_add`, `category_recognition`, `material_match`, `attr_recommend`, and `material_governance` are present exactly once.
  3. Assert every `primary_model_id` and `fallback_model_id` in the response is either `null` or matches an `id` returned by `GET http://localhost:8000/api/v1/models?page=1&page_size=1000`.
  4. If the migration response reports any `agent_preferred_conflicts`, assert those capabilities show `migration_source: "agent"` in `GET http://localhost:8000/api/v1/capability-mappings`.
  5. Assert mappings with `null` model references render as visible unconfigured placeholders on `http://localhost:5173/ai/capability-mappings`, not as broken IDs or blank table cells.

- [ ] Legacy AI config surfaces are removed after verified cleanup.
  Evaluator steps:
  1. Open `http://localhost:5173/ai/models` and `http://localhost:5173/ai/capability-mappings`, then assert the AI Management navigation does not contain legacy `Agent Configs` or `Providers` CRUD entries.
  2. Navigate directly to `http://localhost:5173/ai/agent-configs` and `http://localhost:5173/ai/providers`; assert each route redirects to a supported AI page or shows a not-found state with no legacy create/edit/delete controls.
  3. From the browser context, fetch `GET http://localhost:8000/api/v1/ai/agent-configs`, `GET http://localhost:8000/api/v1/ai/providers`, and `GET http://localhost:8000/api/v1/ai/capability-mappings`; assert each returns HTTP 404 or 410.
  4. Fetch `GET http://localhost:8000/api/v1/models` and `GET http://localhost:8000/api/v1/capability-mappings`; assert both return HTTP 200 and JSON from the unified tables.

- [ ] Model Gateway and Capability Mapping E2E flows work against the unified tables.
  Evaluator steps:
  1. On `http://localhost:5173/ai/models`, create a model named `Sprint55 E2E Model` with provider `custom`, model name `sprint55-e2e-model`, base URL `local://sprint55-e2e`, API key `sprint55-secret`, timeout `30`, enabled state on, and test-friendly generation settings.
  2. Assert the new model card appears, the API key is masked on edit, and editing the display name to `Sprint55 E2E Model Edited` persists after page reload.
  3. Click the model connection test control and assert the UI reports a completed success or failure result within 30 seconds, including latency or an error message.
  4. On `http://localhost:5173/ai/capability-mappings`, assign `Sprint55 E2E Model Edited` as the primary model for `material_governance` and as a fallback for one other capability, then save.
  5. Fetch `GET http://localhost:8000/api/v1/ai/resolve-model?capability=material_governance` and assert the returned provider/model identifies `Sprint55 E2E Model Edited` / `sprint55-e2e-model` from the unified `Model` table.
  6. Remove the mapping references and delete the test model from `http://localhost:5173/ai/models`; assert it disappears from the card grid and from `GET http://localhost:8000/api/v1/models`.

- [ ] Existing AI features still resolve models through the unified mapping path after migration.
  Evaluator steps:
  1. Ensure enabled unified models are assigned for `material_governance`, `category_recognition`, and `material_match` on `http://localhost:5173/ai/capability-mappings`.
  2. From the browser context, call `POST http://localhost:8000/api/v1/rules/evaluate` with `{"name":" Apple  手机 ","brand":"APPLE","unit":"KG","attributes":{"color":"black"}}`; assert HTTP 200, a non-empty `results` array, `capability: "material_governance"`, non-empty `provider` and `model`, and `resolution_source: "capability_mapping"`.
  3. Fetch `GET http://localhost:8000/api/v1/category-libraries`, choose an available category library id, then call `POST http://localhost:8000/api/v1/ai/category-recognition/recognize` with `{"text":"苹果手机充电器","category_library_id":<id>}`; assert HTTP 200, a `categories` array, non-empty `provider` and `model`, and `resolution_source: "capability_mapping"`.
  4. Ensure at least one selected category library is Qdrant-enabled through the existing category library surface, then call `POST http://localhost:8000/api/v1/ai/material-category-match` with `{"material_name":"苹果手机充电器","brand":"Apple","description":"USB-C fast charger","category_library_ids":[<id>]}`; assert HTTP 200, `capability: "material_match"`, non-empty `provider` and `model`, and `resolution_source: "capability_mapping"`.

- [ ] Resolver performance and connection-test timeout meet the Sprint 55 thresholds.
  Evaluator steps:
  1. From the browser context, call `GET http://localhost:8000/api/v1/ai/resolve-model?capability=material_governance&include_metrics=true` ten times and assert every response includes `lookup_ms < 10`.
  2. Call `POST http://localhost:8000/api/v1/ai/resolve-model/batch` with ten capability names, including repeated valid capabilities, and assert the response includes `batch_lookup_ms < 100` and ten resolved result entries.
  3. On `http://localhost:5173/ai/models`, run a connection test for one enabled model and assert the browser observes a completed result in less than 30 seconds with no hung spinner.

- [ ] API documentation and version metadata reflect the final breaking migration.
  Evaluator steps:
  1. Fetch `GET http://localhost:8000/openapi.json` and assert `info.version` is `15.0.0`.
  2. Assert the OpenAPI paths include `/api/v1/models`, `/api/v1/capability-mappings`, and `/api/v1/ai/resolve-model`, and do not include `/api/v1/ai/agent-configs`, `/api/v1/ai/providers`, or `/api/v1/ai/capability-mappings`.
  3. Fetch `GET http://localhost:8000/health` and assert the JSON includes `{"status":"ok","version":"15.0.0"}`.
  4. Open `http://localhost:5173/ai/models` and `http://localhost:5173/ai/capability-mappings`; assert there is no user-facing text that refers to `model_config`, `ai_agent_config`, `legacy`, or backward compatibility mode.
