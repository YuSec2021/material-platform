## Sprint 30: Frontend: Batch Recoding Preview, Execution, and Code Mapping

### Features
- Add a `重编码预览` experience that is triggered after editing a material library code rule and selecting `全部物料重编码` or `选中物料重编码`.
- Show a preview summary header with total materials, expected success count, expected failure count, and an error breakdown by `缺少属性`, `编码冲突`, and `类目编码缺失`.
- Display preview rows in a paginated table with 50 rows per page and columns for material name, specification, category path, old code, new code, status, and failure reason.
- Use visually distinct pass/fail row states for preview results, with localized statuses `通过` and `失败`.
- Provide a CSV download for preview results containing every visible preview column.
- Add a guarded recode execution flow with a prominent confirmation dialog that includes library name, material count, and an external-system impact warning.
- Show loading and progress feedback while recode preview and execution are running.
- Fill the `重编码记录` tab with recode batch rows and batch detail views containing batch metadata and per-material change details.
- Fill the `编码映射` tab with searchable/filterable code mappings, pagination, and Excel export.
- Add per-batch rollback from the recode record detail with a risk-warning confirmation dialog.
- Implementation must extend `prototype_code/src/app/api/client.ts` with typed API client methods for the recode APIs, including `recodePreview`, `recodeBatch`, `recodePreviewRows`, `executeRecodeBatch`, `rollbackRecodeBatch`, `codeMappings`, and a code mapping export/download method.

### Success criteria (black-box-verifiable)
- [ ] A super_admin can trigger all-material recode preview from the edit-rule flow and see the preview summary.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login` in a browser, sign in with username `super_admin` and an empty password, then navigate to `http://localhost:5173/material/library`.
  3. Using Playwright request context or an equivalent HTTP client with headers `X-Username: super_admin`, `X-User-Role: super_admin`, and `Authorization: Bearer super_admin`, create the test data through backend APIs: call `GET http://localhost:8000/api/v1/product-names` and `GET http://localhost:8000/api/v1/categories` to choose valid IDs; call `POST http://localhost:8000/api/v1/material-libraries` with a unique name, `auto_code_enabled: true`, `recode_enabled: true`, and a code rule containing fixed segment `S30` plus a serial segment; then call `POST http://localhost:8000/api/v1/materials` with that library ID, the chosen product/category IDs, material name `Sprint 30 Preview Material`, status `normal`, and attributes `{}`.
  4. Refresh `http://localhost:5173/material/library`, open the created material library detail view, click `编码规则`, click `编辑规则`, make a small segment change, enter change reason `Sprint 30 all recode preview`, select `全部物料重编码`, and save.
  5. Assert the preview view opens as a modal or drawer inside the selected library detail on `http://localhost:5173/material/library`; the visible container must have heading `重编码预览`, show the selected library name, and show the generated batch ID.
  6. Assert the preview view shows a summary header with total materials, expected success count, expected failure count, and an error breakdown containing labels for `缺少属性`, `编码冲突`, and `类目编码缺失`.
  7. Assert visible loading or progress feedback appears while the preview is being generated, even if the preview completes quickly.

- [ ] The recode preview table exposes complete row data, status styling, pagination, and CSV download.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. In a browser session authenticated as `super_admin`, create an automatic-code, recode-enabled library and at least one material through backend calls to `GET http://localhost:8000/api/v1/product-names`, `GET http://localhost:8000/api/v1/categories`, `POST http://localhost:8000/api/v1/material-libraries`, and `POST http://localhost:8000/api/v1/materials`, using the same authentication headers from criterion 1.
  3. Navigate to `http://localhost:5173/material/library`, open the created library, and create or open a recode preview through the `全部物料重编码` edit-rule flow.
  4. Assert the preview table contains columns labeled for material name, specification, category path, old code, new code, status, and failure reason.
  5. Assert pass rows show localized status `通过` with a green visual state and failed rows, when present, show localized status `失败` with a red visual state and a visible failure reason.
  6. If the preview contains more than 50 rows, use the pagination control and assert the page size is 50 rows and navigating pages keeps the browser in the `重编码预览` modal or drawer on `http://localhost:5173/material/library`.
  7. Click the preview CSV download action and assert a `.csv` file is downloaded.
  8. Open the downloaded CSV and assert it contains headers for material name, specification, category path, old code, new code, status, and failure reason.

- [ ] Recode execution requires explicit confirmation, shows progress, and writes a completed batch record.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, then create an automatic-code, recode-enabled library and one material through backend calls to `GET http://localhost:8000/api/v1/product-names`, `GET http://localhost:8000/api/v1/categories`, `POST http://localhost:8000/api/v1/material-libraries`, and `POST http://localhost:8000/api/v1/materials`.
  3. Navigate to `http://localhost:5173/material/library`, open the created library, and open an all-material recode preview through the edit-rule flow.
  4. Click the execute or confirm recode action and assert a confirmation dialog appears before execution.
  5. Assert the confirmation dialog includes the selected library name, the material count being recoded, and a warning about external system impact.
  6. Cancel the dialog and assert no success message or new completed batch is shown.
  7. Reopen the confirmation dialog, confirm execution, and assert the UI shows loading or progress feedback during execution.
  8. Assert execution finishes with a success or completed state and the UI offers a way to view the related `重编码记录`.
  9. Navigate to the `重编码记录` tab in the same library detail view and assert a batch row appears with batch ID, old version, new version, change mode, total count, success count, failed count, status, created_by, and created_at.

- [ ] The recode records tab supports batch browsing and full batch detail.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using backend APIs with super_admin headers, create an automatic-code, recode-enabled library and one material through `GET http://localhost:8000/api/v1/product-names`, `GET http://localhost:8000/api/v1/categories`, `POST http://localhost:8000/api/v1/material-libraries`, and `POST http://localhost:8000/api/v1/materials`.
  3. Using backend APIs, create an executed batch for that library: call `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions` with `activate: false` and a changed fixed segment such as `S30R`; call `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions/{version_id}/recode-preview` with body `{ "scope": "all", "material_ids": [] }`; then call `POST http://localhost:8000/api/v1/material-code-change-batches/{batch_id}/execute` with body `{ "confirm": true, "reason": "Sprint 30 record setup" }`.
  4. In a browser session authenticated as `super_admin`, navigate to `http://localhost:5173/material/library`, open the created material library detail view, and click the `重编码记录` tab.
  5. Assert the batch list shows columns or labels for batch ID, old version, new version, change mode, total count, success count, failed count, status, created_by, and created_at.
  6. Click a batch row or detail action and assert a drawer, modal, expanded panel, or detail page opens for that batch.
  7. Assert the batch detail shows batch metadata and per-material change details including material name, old code, new code, status, and failure reason when applicable.
  8. If the batch list has more rows than one page, use the pagination control and assert page changes keep the browser in the selected library's `重编码记录` experience under `http://localhost:5173/material/library`.

- [ ] The code mapping tab supports search, filters, pagination, and Excel export.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using backend APIs with super_admin headers, create an automatic-code, recode-enabled library, one material, and one executed recode batch by calling `GET http://localhost:8000/api/v1/product-names`, `GET http://localhost:8000/api/v1/categories`, `POST http://localhost:8000/api/v1/material-libraries`, `POST http://localhost:8000/api/v1/materials`, `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions`, `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions/{version_id}/recode-preview`, and `POST http://localhost:8000/api/v1/material-code-change-batches/{batch_id}/execute`.
  3. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, open the created material library detail view, and click the `编码映射` tab.
  4. Assert the mapping table shows columns or labels for old code, new code, material name, batch ID, change time, and status.
  5. Enter an old code, new code, or material name visible in the table into the search field and assert the table filters to matching rows.
  6. Apply a batch ID filter or date range filter and assert the table updates without leaving `http://localhost:5173/material/library` or the selected library detail modal under it.
  7. If more mappings exist than fit on one page, use the pagination control and assert the next page shows different rows.
  8. Click the Excel export action and assert an `.xlsx` file is downloaded containing mapping columns for old code, new code, material name, batch ID, change time, and status.

- [ ] A selected-material recode preview limits execution to the chosen materials.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password.
  3. Using backend APIs with super_admin headers, create an automatic-code, recode-enabled library through `POST http://localhost:8000/api/v1/material-libraries` after fetching valid product/category IDs from `GET http://localhost:8000/api/v1/product-names` and `GET http://localhost:8000/api/v1/categories`.
  4. Create exactly two materials in that library with two separate `POST http://localhost:8000/api/v1/materials` requests, using names `Sprint 30 Selected A` and `Sprint 30 Selected B`.
  5. Navigate to `http://localhost:5173/material/library`, open the created library, click `编码规则`, click `编辑规则`, make a small segment change, enter change reason `Sprint 30 selected recode`, select `选中物料重编码`, and save.
  6. Assert the app opens a selected-material selection modal or drawer headed `选择重编码物料` that contains a searchable material table with a checkbox column as the first column and rows for the two materials created through the API.
  7. Check exactly one material row checkbox and click the generate-preview action.
  8. Assert the preview summary total materials count is `1` and the preview table contains only the selected material.
  9. Execute the selected-material recode after confirmation and assert the resulting `重编码记录` batch shows selected-material change mode and total count `1`.

- [ ] Rollback is available per completed batch and requires a risk-warning confirmation.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using backend APIs with super_admin headers, create rollback preconditions: call `GET http://localhost:8000/api/v1/product-names` and `GET http://localhost:8000/api/v1/categories`; call `POST http://localhost:8000/api/v1/material-libraries` for an automatic-code, recode-enabled library; call `POST http://localhost:8000/api/v1/materials` to create at least one material; call `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions` with `activate: false`; call `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions/{version_id}/recode-preview` with body `{ "scope": "all", "material_ids": [] }`; and call `POST http://localhost:8000/api/v1/material-code-change-batches/{batch_id}/execute` with body `{ "confirm": true, "reason": "Sprint 30 rollback setup" }`.
  3. In a browser session authenticated as `super_admin`, navigate to `http://localhost:5173/material/library`, open the created material library detail view, and click the `重编码记录` tab.
  4. Open the completed batch detail and assert a rollback action is visible for rollback-eligible batches.
  5. Click the rollback action and assert a confirmation dialog appears with a warning about external system references or downstream code usage.
  6. Cancel the rollback dialog and assert the batch status and the `编码映射` table row for that batch still show an active status such as `生效中` or `active`.
  7. Reopen the rollback dialog, confirm rollback, and assert loading or progress feedback appears while rollback is running.
  8. Assert the UI reports rollback completion and the batch status changes to a rolled-back state such as `已回滚` or `rolled_back`.
  9. Navigate to the `编码映射` tab, apply the batch ID filter for the rolled-back batch, and assert the mapping table's `状态` cell for each affected row displays `已回滚` or `rolled_back`; no row for that batch may show `生效中` or `active`.


---
CONTRACT APPROVED

Sprint: 30
Approved criteria: 7
Notes: API client methods listed in features (item 14) are internal implementation details exercised transitively by UI interaction tests -- not independently observable through browser verification, which is acceptable for a black-box contract. All test steps use exact URLs, auth headers, API endpoints with path parameters, and concrete UI assertions including file download content verification.
