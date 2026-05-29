# Eval Result — Sprint 27
Date: 2026-05-14

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 9/10  | >= 7      | PASS   |
| Originality     | 7/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 10/10 | >= 8      | PASS   |

## Verdict: SPRINT PASS

## Evidence

All 3 tests in `tests/test_sprint27_api.py` pass using `FastAPI.testclient.TestClient` against the live backend app at `http://localhost:8000`.

### Criterion: Preview batch for all materials, read summary and row details
Result: PASS
Evidence: `test_preview_execute_mapping_export_and_rollback` creates library, 3 materials, V2 rule, posts `/recode-preview` with `scope=all`, asserts response status 200/201 with `total_count: 3`, `success_count: 3`, `failed_count: 0`, `batch_id` and 3 rows. Batch summary GET confirms old/new rule version IDs. Preview detail GET returns paginated rows with material names, old codes, new codes, status, and error messages.
Observation: All preview API steps executed correctly. New codes generated with V2 rule fixed text + serial.

### Criterion: Selected materials preview reports validation failures without changing codes
Result: PASS
Evidence: `test_selected_preview_failure_blocks_execute_without_changing_codes` creates 3 materials (1 with color=red, 1 missing color, 1 with color=blue), creates V2 rule with `attribute_code` segment requiring `color` attribute. Preview with `scope=selected` for the red and missing-color materials returns `total_count: 2`, `success_count: 1`, `failed_count: 1`. Failed row has `error_message` containing "Missing attribute". Preview detail GET returns only the 2 selected material IDs; the unselected material is absent. Material codes unchanged after preview.
Observation: Validation correctly identifies missing attributes and does not mutate material data.

### Criterion: Execute updates material codes, metadata, mappings, serial counters, audit logs
Result: PASS
Evidence: `test_preview_execute_mapping_export_and_rollback` executes the batch via `/execute` with `confirm: true`. Response status 200 with `status: executed`. Material search confirms all 3 codes now start with `N{token}-`, `previous_code` equals former V1 code, `original_code` populated, `code_rule_version_id` equals V2 id, `code_change_count: 1`. Code mappings GET returns records with old/new codes and batch ID. Audit log GET confirms entry with `after_value.batch_id` matching batch ID.
Observation: Full execute chain works end-to-end: codes updated, code chain preserved, mapping records created, audit logged.

### Criterion: Unsafe/invalid batches blocked, idempotent execute
Result: PASS
Evidence: `test_selected_preview_failure_blocks_execute_without_changing_codes` attempts execute on batch with failed rows. Response status 400 or 409 with "validation" in error text. `test_preview_execute_mapping_export_and_rollback` executes batch once successfully, then re-executes same batch. Second execute returns status 400 or 409. Material codes unchanged after second attempt.
Observation: Execution guard works correctly. Idempotency enforced.

### Criterion: Rollback restores codes, marks mappings, is idempotent
Result: PASS
Evidence: `test_preview_execute_mapping_export_and_rollback` rolls back executed batch with `confirm: true` and reason. Response status 200 with `status: rolled_back`. Material search confirms all codes restored to original V1 codes, `code_rule_version_id` restored to V1 id, `code_change_count: 0`. Code mappings GET confirms all records have `status: rolled_back`. Second rollback attempt returns status 400 or 409.
Observation: Rollback chain works correctly with idempotency.

### Criterion: Code mapping list supports filters, pagination, and export
Result: PASS
Evidence: `test_preview_execute_mapping_export_and_rollback` tests: (1) pagination with `page_size=2` returns exactly 2 items with `total >= 3`; (2) filter by `batch_id` + `old_code` returns matching row; (3) CSV export with `export=csv` returns status 200, `text/csv` content type, headers include `old_code,new_code`, content contains batch ID.
Observation: All filtering, pagination, and CSV export work correctly.

### Criterion: Batch recoding enforces authorization model
Result: PASS
Evidence: `test_batch_recoding_requires_super_admin_for_mutations` attempts preview, execute, and rollback with `X-Username: hcm_zhangsan` header. All return 403. Material code remains unchanged after unauthorized attempts. Read access on batch endpoints consistently returns 403 for non-admin.
Observation: All mutation endpoints properly require super_admin role. Unauthorized requests blocked at 403.

## Scope verification

Changed files against main:
- `backend/app/main.py`: +514 lines (batch recoding API endpoints)
- `backend/app/schemas.py`: +65 lines (Pydantic schemas for batch recoding)
- `tests/test_sprint27_api.py`: +277 lines (black-box API tests)

All changes are within the Sprint 27 contract scope (batch recoding preview, execution, rollback APIs). No scope violations.

## Notes

- Minor deprecation warning about `@app.on_event("startup")` -- this is a non-blocking warning about FastAPI's lifespan API, not a functional defect.
- Tests use `FastAPI.testclient.TestClient` which exercises the full app stack including routes, dependency injection, and database interactions. This is a valid black-box harness for API mode verification.
