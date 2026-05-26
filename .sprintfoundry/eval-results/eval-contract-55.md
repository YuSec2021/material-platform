# Contract Review -- Sprint 55
Date: 2026-05-26

## Sprint: 55
## Title: AI模型配置架构重构：数据迁移 + 旧表清理 + E2E验收测试

---

## Contract Review Verdict: PASS

---

## Analysis

### Scope Alignment
The sprint contract correctly maps to Sprint 55 in `planner-spec.json`. The features section covers data migration (model_config + ai_agent_config -> Model), capability mapping migration, idempotency, mock data handling, legacy table cleanup, E2E testing, regression testing, performance verification, and final version bump -- all of which are precisely described in the Sprint 55 feature block in `planner-spec.json` (lines 1145-1154).

### Verification Mode
The contract correctly uses `browser` mode, matching the `planner-spec.json` `verification.mode` of `browser` with base URL `http://localhost:5173`.

### Success Criteria Review

#### Criterion 1: Legacy AI configuration data migrated idempotently
- **Observable via browser**: Yes. Login flow, UI navigation, and API calls from browser context are all browser-verifiable.
- **Specific enough**: Yes. Exact URLs (login, models list, migration endpoint, API list), exact response field assertions (`status`, `legacy_models_seen >= 414`, `models_created = 0`), and exact idempotency checksum assertion are all specified.
- **Mapped to evaluator steps**: Yes. Steps 1-5 provide concrete assertions covering first migration, second migration (idempotency check), duplicate absence, is_test flag, and key masking.
- **Issue with Step 3**: "assert the first response reports `legacy_models_seen >= 414`" -- this assumes the migration target has at least 414 mock ModelConfig records. Per the contract Features section, this is the expected state ("process the 414 mock ModelConfig records"). However, if the database has been partially migrated by a previous attempt, the count could differ. The evaluator should treat this as a lower bound assertion.

#### Criterion 2: Capability mappings migrated with agent precedence and null-safe references
- **Observable via browser**: Yes. UI navigation to capability-mappings and API assertions are all browser-verifiable.
- **Specific enough**: Yes. Exact capability names, exact model ID validation against `/models` response, exact `migration_source` field assertion, and exact UI placeholder rendering are all specified.
- **Mapped to evaluator steps**: Yes. Steps 1-5 cover UI visibility, capability presence, model ID integrity, agent precedence, and null placeholder display.

#### Criterion 3: Legacy AI config surfaces removed after verified cleanup
- **Observable via browser**: Yes. Navigation to legacy routes, HTTP status assertions, and UI element inspection are all browser-verifiable.
- **Specific enough**: Yes. Step 3 explicitly expects 404 or 410 for legacy endpoints and 200 for unified endpoints. Step 1 specifies exact navigation entries to check absence of.
- **Mapped to evaluator steps**: Yes. Steps 1-4 cover navigation inspection, route redirect/blocking, legacy endpoint 404/410, and unified endpoint 200.
- **Note**: The `410 Gone` status is a good choice for indicating the resource existed but is now permanently removed. The evaluator should accept either 404 or 410.

#### Criterion 4: Model Gateway and Capability Mapping E2E flows against unified tables
- **Observable via browser**: Yes. Full CRUD cycle (create, edit, test connection, assign mapping, resolve-model, delete) is all browser-verifiable.
- **Specific enough**: Yes. Exact field values (model name, provider, base URL, API key), exact UI interactions (edit save, connection test), exact resolution API assertion, and exact deletion verification are all specified.
- **Mapped to evaluator steps**: Yes. Steps 1-6 cover the complete E2E cycle from create to delete.
- **Minor note**: Step 1 specifies `local://sprint55-e2e` as base URL for the connection test. This is a `local://` scheme, which the evaluator expects to produce either a success or a failure UI result (not necessarily a real HTTP success). This is acceptable -- the test only requires a completed result within 30 seconds.
- **Cross-sprint dependency**: This criterion builds on Sprint 53's Model Gateway page (`/ai/models`) and Sprint 54's Capability Mapping page (`/ai/capability-mappings`). Both are listed as complete in the sprint history.

#### Criterion 5: Existing AI features still resolve through unified mapping path (regression)
- **Observable via browser**: Yes. From browser context, the evaluator makes API calls within the authenticated Playwright browser session. This is a valid browser-mode approach -- the browser session provides authentication context while the evaluator observes API response shapes.
- **Specific enough**: Yes. Exact request payloads, exact capability names, exact `resolution_source: "capability_mapping"` assertion, and exact response field names are all specified.
- **Mapped to evaluator steps**: Yes. Steps 1-4 cover F21 (rules/evaluate), F25 (category-recognition/recognize), and F33/F34 (material-category-match) with all three verifying `resolution_source: "capability_mapping"`.
- **Note**: The category recognition test (Step 3) requires fetching a valid `category_library_id` first. The evaluator should first fetch `GET /api/v1/category-libraries` to discover available IDs, then use one in the recognition request. This is implicit in "choose an available category library id".

#### Criterion 6: Resolver performance and connection-test timeout
- **Observable via browser**: Yes. Performance metrics from API responses and UI connection test completion are browser-verifiable.
- **Specific enough**: Yes. Exact thresholds are specified: `lookup_ms < 10` for single lookup, `batch_lookup_ms < 100` for batch of 10, and 30-second timeout for connection test. The evaluator can measure these in real time.
- **Mapped to evaluator steps**: Yes. Steps 1-3 cover single lookup (10x), batch lookup (10 repeated capabilities), and UI connection test timeout.

#### Criterion 7: API documentation and version metadata reflect breaking migration
- **Observable via browser**: Yes. OpenAPI JSON fetch, health endpoint, and UI text inspection are all browser-verifiable.
- **Specific enough**: Yes. Exact version `15.0.0`, exact path inclusion/exclusion lists, and exact user-facing text exclusions are all specified.
- **Mapped to evaluator steps**: Yes. Steps 1-4 cover OpenAPI version, path list, health endpoint, and UI text scan for legacy references.

### Cross-Sprint Dependencies
The contract has the following cross-sprint dependencies:
- Sprint 53 (Model Gateway page at `/ai/models`) -- used in Criteria 1, 2, 3, and 4
- Sprint 54 (Capability Mapping page at `/ai/capability-mappings`) -- used in Criteria 2, 3, 4, and 7
- F21 Rule Engine (implemented Sprint 24/25) -- regression tested in Criterion 5
- F25 Category Recognition (implemented Sprint 25) -- regression tested in Criterion 5
- F33/F34 Material-Category Matching with Qdrant (implemented Sprint 44) -- regression tested in Criterion 5

These are all established features with completed eval results in the sprint history. The cross-sprint regression testing (Criterion 5) validates that the migration does not break existing AI features.

### Minor Calibrations (non-blocking)
1. Criterion 1, Step 3: `legacy_models_seen >= 414` is a lower bound. If the database was partially migrated, the count may be lower. The evaluator should check that at minimum the mock records are present; the exact count depends on database state.
2. Criterion 5: "choose an available category library id" requires fetching `GET /api/v1/category-libraries` first. This is implicit but executable.
3. Criterion 4: Connection test uses `local://` scheme. The evaluator should accept either success or failure UI result, as long as the test completes within 30 seconds.

---

## Conclusion

All 7 success criteria are black-box verifiable through the browser verification surface at `http://localhost:5173`. Each criterion specifies observable user actions, concrete API request/response assertions, and exact UI element verifications. The contract is complete, correct, and covers the full scope of the Sprint 55 feature set (data migration, capability mapping migration, legacy cleanup, E2E flows, regression testing, performance verification, and version bump). The minor calibration notes above do not prevent approval.

---
CONTRACT APPROVED

Sprint: 55
Approved criteria: 7
Notes: Cross-sprint dependency on Sprint 53 (Model Gateway) and Sprint 54 (Capability Mapping) for criteria 1-4, 7. Regression testing in Criterion 5 depends on F21/F25/F33/F34 features from earlier sprints. Criterion 1 Step 3 lower-bound assertion may vary if database was partially pre-migrated.