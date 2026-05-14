## Sprint 24: Backend Rule Engine: DB Tables, CRUD APIs, and Evaluate Endpoint

### Features
- Add backend persistence for rule engine categories and rules.
- Seed all six deterministic rule categories on startup: `unit_normalization`, `brand_alias`, `title_cleaning`, `enum_validation`, `required_field_check`, and `blackwhite_list`.
- Seed at least two default enabled rule examples per category, for at least 12 default rules total.
- Expose `GET /api/v1/rules/categories` with category metadata, rule counts, and `sort_order` ordering.
- Expose `CRUD /api/v1/rules` with category filtering, search, enabled filtering, pagination, detail, create, update, and delete.
- Expose `PATCH /api/v1/rules/:id/toggle` to enable or disable a single rule.
- Expose `POST /api/v1/rules/evaluate` to run enabled rules against submitted material fields and return structured per-rule results.
- Add Pydantic v2 API schemas for rule category, rule CRUD/toggle, evaluate request, evaluate result, and evaluate response payloads.
- Require super_admin authorization for all rule write endpoints: `POST`, `PUT`, `DELETE`, and toggle `PATCH`.

### Success criteria (black-box-verifiable)
- [ ] Rule categories and default rules are seeded and exposed through the API.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Request `GET http://localhost:8000/api/v1/rules/categories` with header `X-User-Role: super_admin`.
  3. Assert the response status is `200` and contains exactly the six category slugs `unit_normalization`, `brand_alias`, `title_cleaning`, `enum_validation`, `required_field_check`, and `blackwhite_list`.
  4. Assert each category object includes `id`, `slug`, `display_name_zh`, `display_name_en`, `description_zh`, `description_en`, `icon`, `sort_order`, `created_at`, and `rule_count`.
  5. Assert the categories are sorted by ascending `sort_order` and each category has `rule_count >= 2`.
  6. Request `GET http://localhost:8000/api/v1/rules?page=1&page_size=100` with header `X-User-Role: super_admin` and assert the response reports at least 12 total rules.

- [ ] Rule CRUD APIs support create, list filtering, detail, update, pagination, and deletion.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Request `GET http://localhost:8000/api/v1/rules/categories` with header `X-User-Role: super_admin` and capture the `id` for the `unit_normalization` category.
  3. Request `POST http://localhost:8000/api/v1/rules` with header `X-User-Role: super_admin` and JSON body containing that `category_id`, a unique `name`, `description`, `pattern`, `value`, `options`, `priority`, and `enabled: true`; assert status `200` or `201` and capture the returned rule `id`.
  4. Request `GET http://localhost:8000/api/v1/rules?category_id=<captured_category_id>&search=<unique_name>&enabled=true&page=1&page_size=5` with header `X-User-Role: super_admin` and assert the created rule appears in `items` and pagination metadata is present.
  5. Request `GET http://localhost:8000/api/v1/rules/<captured_rule_id>` with header `X-User-Role: super_admin` and assert the response contains the created rule fields and nested or referenced category data.
  6. Request `PUT http://localhost:8000/api/v1/rules/<captured_rule_id>` with header `X-User-Role: super_admin` and JSON body changing `description`, `value`, `priority`, and `enabled`; assert the response reflects the updates.
  7. Request `DELETE http://localhost:8000/api/v1/rules/<captured_rule_id>` with header `X-User-Role: super_admin`, then request `GET http://localhost:8000/api/v1/rules/<captured_rule_id>` and assert the deleted rule no longer loads.

- [ ] Rule toggling works and all rule write endpoints reject non-super_admin callers.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Create a temporary local user by requesting `POST http://localhost:8000/api/v1/users` with header `X-User-Role: super_admin` and a unique username; capture the returned user `id`.
  3. Create a temporary enabled rule through `POST http://localhost:8000/api/v1/rules` with header `X-User-Role: super_admin`; capture the returned rule `id`.
  4. Request `PATCH http://localhost:8000/api/v1/rules/<captured_rule_id>/toggle` with header `X-User-Role: super_admin` and JSON body `{"enabled": false}`; assert the returned rule has `enabled: false`.
  5. Request the same toggle endpoint with JSON body `{"enabled": true}` and assert the returned rule has `enabled: true`.
  6. Using header `X-User-Id: <captured_user_id>`, assert `POST http://localhost:8000/api/v1/rules`, `PUT http://localhost:8000/api/v1/rules/<captured_rule_id>`, `PATCH http://localhost:8000/api/v1/rules/<captured_rule_id>/toggle`, and `DELETE http://localhost:8000/api/v1/rules/<captured_rule_id>` each return `403`.
  7. Delete the temporary rule as super_admin and assert cleanup succeeds.

- [ ] The evaluate endpoint returns structured deterministic results for all six rule categories.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Request `GET http://localhost:8000/api/v1/rules/categories` with header `X-User-Role: super_admin` and capture category IDs for all six category slugs.
  3. Create one enabled high-priority test rule in each category through `POST http://localhost:8000/api/v1/rules` with header `X-User-Role: super_admin`: normalize `KG` to `kg`, normalize brand alias `苹果` to `Apple`, clean repeated title whitespace, require enum attribute `color` to be one of `red` or `blue`, require missing attribute `voltage`, and blacklist keyword `FORBIDDEN`.
  4. Request `POST http://localhost:8000/api/v1/rules/evaluate` with header `X-User-Role: super_admin` and JSON body `{"name":"  FORBIDDEN   material  ","brand":"苹果","unit":"KG","attributes":{"color":"green"}}`.
  5. Assert the response status is `200` and contains a result array with entries for all six category slugs.
  6. Assert every result entry includes `category_slug`, `rule_id`, `rule_name`, `passed`, `message`, and `suggestion`.
  7. Assert the test rules for unit normalization, brand alias, title cleaning, enum validation, required field check, and blacklist each return `passed: false`, include a non-empty Chinese-readable `message`, and include an applicable `suggestion` such as `kg`, `Apple`, a cleaned name, an allowed enum value, the missing `voltage` field, or removal/blocking guidance.

- [ ] OpenAPI documents the rule engine paths and Pydantic schemas.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Request `GET http://localhost:8000/openapi.json`.
  3. Assert the OpenAPI paths include `GET /api/v1/rules/categories`, `GET /api/v1/rules`, `POST /api/v1/rules`, `GET /api/v1/rules/{rule_id}`, `PUT /api/v1/rules/{rule_id}`, `DELETE /api/v1/rules/{rule_id}`, `PATCH /api/v1/rules/{rule_id}/toggle`, and `POST /api/v1/rules/evaluate`.
  4. Assert the OpenAPI components include schemas named `RuleCategoryRead`, `RuleCreate`, `RuleUpdate`, `RuleRead`, `RuleToggle`, `EvaluateRequest`, `EvaluateResult`, and `EvaluateResponse`, or equivalent schema names that expose those exact fields.

---
CONTRACT APPROVED

Sprint: 24
Approved criteria: 5
Notes: All criteria are black-box verifiable via HTTP calls against localhost:8000. Auth rejection tested via X-User-Id header for a non-super_admin user. Evaluate endpoint has concrete input/output assertions. Sprint-level verification mode override to "api" is correctly specified in planner-spec.json.
