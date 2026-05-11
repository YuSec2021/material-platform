## Sprint 6: Material Application Workflows - New Category and Code

### Features
- F10-New Material Category Application workflow
- F11-New Material Code Application workflow
- Approval mode configuration for simple approval and multi-node workflow
- Frontend: workflow form, approval history, status tracking, approver task list
- Backend: workflow state machine with approval, rejection, return reason, and immutable workflow history
- Approved category applications auto-create categories in the category library
- Approved material code applications auto-add materials to the material catalog

### Workflow Application Fields
A workflow application record contains:
- `id` (integer, primary key)
- `application_no` (string, auto-generated, stable user-facing number)
- `type` (string enum: `new_category`, `new_material_code`)
- `status` (string enum: `draft`, `submitted`, `pending_department_head`, `pending_asset_management`, `pending_approval`, `approved`, `rejected`)
- `applicant` or applicant identity fields visible in the UI
- `current_node` (string, current approval step or terminal state)
- `reason` or `business_reason` (string, required on submit)
- `approval_history` (ordered list of submit/approve/reject events with actor, node, action, comment, and timestamp)
- `created_at`, `updated_at` (timestamps)

A new material category application contains:
- `material_library_id` or target library selection
- target parent category selection when applicable
- proposed category name (required)
- proposed category code or auto-generated category code preview
- category level/path preview
- description or business justification

A new material code application contains:
- `material_library_id` (required)
- category and product-name binding (required)
- material name (required)
- unit (required)
- brand (optional unless selected product rules require it)
- attributes object with user-entered attribute values
- reference mall link (required URL)
- exactly three or more uploaded reference images, with three images required before submission
- duplicate/matching warning from existing material catalog when available

### Success criteria (black-box-verifiable)
- [ ] A material manager can submit a new material category application, complete a multi-node approval flow, and see the approved category created in the category library.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open the approval configuration area from visible navigation, or open `http://localhost:5173/system/config`, set approval mode to multi-node workflow, and save.
  3. Open the new category application page from visible navigation, or open `http://localhost:5173/workflows/new-category`.
  4. Submit a unique category request as a material manager with a target category library, optional parent category, category name such as `测试新增类目-<timestamp>`, description, and business reason.
  5. Assert the application detail page shows an auto-generated application number, status `pending_department_head`, current node for department-head approval, and a submit event in approval history.
  6. Open the approver task list from visible navigation, or open `http://localhost:5173/workflows/tasks`, approve the application as the department head, and assert the status changes to `pending_asset_management`.
  7. Approve the same application as asset management and assert the final status is `approved` with both approval events visible in chronological approval history.
  8. Open the category management page at `http://localhost:5173/categories`, search for the unique category name, and assert the category exists under the selected library/path with a generated or accepted category code.

- [ ] Category application rejection returns the request to the applicant with a required reason and does not create a category.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open `http://localhost:5173/workflows/new-category` and submit a unique category request with a target library, category name such as `测试驳回类目-<timestamp>`, description, and business reason.
  3. Open `http://localhost:5173/workflows/tasks`, attempt to reject without a comment, and assert the UI blocks the action or displays a validation error requiring a rejection reason.
  4. Reject the application with a visible reason such as `类目名称不符合标准命名规则`.
  5. Assert the applicant-facing application list at `http://localhost:5173/workflows/applications` shows the request with status `rejected` and displays the rejection reason in the detail/history view.
  6. Open `http://localhost:5173/categories`, search for the rejected category name, and assert no category was created.

- [ ] A material manager can submit a new material code application with a reference mall link and three required images, approve it, and find the new material in the catalog.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open the new material code application page from visible navigation, or open `http://localhost:5173/workflows/new-material-code`.
  3. Fill the form with a unique material name such as `测试编码物料-<timestamp>`, material library, category/product-name binding, unit, brand when available, at least two attribute values, reference mall link `https://example.com/material-code-test`, and business reason.
  4. Attempt to submit with fewer than three uploaded images and assert the UI blocks submission with a visible validation message for the three required reference images.
  5. Upload three valid image files, submit the application, and assert the application detail shows an auto-generated application number, submitted material fields, uploaded image thumbnails, reference mall link, and pending approval status.
  6. Approve the application through `http://localhost:5173/workflows/tasks` using the configured approval flow and assert the final application status is `approved`.
  7. Open the material list at `http://localhost:5173/materials`, search for the unique material name, and assert the material appears with an auto-generated material code in `MAT-XXXXXXXX` format, `normal` status, the submitted unit/attributes, and the reference link or images visible in detail.

- [ ] Material code application rejection returns the request with reason, preserves submitted evidence, and does not add the material to the catalog.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open `http://localhost:5173/workflows/new-material-code` and submit a unique material code application with a reference mall URL, three uploaded images, required category/product/material fields, and attribute values.
  3. Open `http://localhost:5173/workflows/tasks`, reject the application with a reason such as `商城链接与申请物料不一致`.
  4. Assert the applicant-facing detail page shows status `rejected`, the rejection reason, the original submitted reference mall link, and the three uploaded image thumbnails.
  5. Open `http://localhost:5173/materials`, search for the rejected material name, and assert no material was created in the catalog.

- [ ] Simple approval mode can be configured externally and shortens both application workflows to a single approval step without restarting the system.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173/system/config` in a browser.
  2. Change approval mode from multi-node workflow to simple approval and save; do not restart the backend or rerun `bash init.sh`.
  3. Submit a new category application from `http://localhost:5173/workflows/new-category` and assert its status is `pending_approval` or an equivalent single approver state, not `pending_department_head`.
  4. Approve the category application once from `http://localhost:5173/workflows/tasks` and assert it becomes `approved` and the category appears at `http://localhost:5173/categories`.
  5. Submit a new material code application from `http://localhost:5173/workflows/new-material-code` with a valid reference mall link and three images.
  6. Approve the material code application once from `http://localhost:5173/workflows/tasks` and assert it becomes `approved` and the material appears at `http://localhost:5173/materials`.

- [ ] Workflow APIs are documented and enforce state-machine rules independently of source-code inspection.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:8000/openapi.json` in a browser.
  2. Assert the OpenAPI document lists endpoints for workflow application creation, listing/detail, approval, rejection, approval-mode configuration, and task retrieval under paths such as `/api/v1/workflows/applications`, `/api/v1/workflows/tasks`, or `/api/v1/system/config`.
  3. Send a real HTTP request to create a new category application and assert the JSON response includes `application_no`, `type: "new_category"`, non-terminal pending status, current node, and an approval history entry for submission.
  4. Send an invalid approval request for the wrong current node or for an already terminal application and assert the API returns a 4xx response with a clear state-transition error instead of mutating the workflow.
  5. Send valid approval requests for the configured approval mode and assert the terminal response is `approved` and contains the full ordered approval history.
  6. Verify through a real HTTP request or browser page at `http://localhost:5173/categories` or `http://localhost:8000/openapi.json`-listed category endpoint that the approved category application created a category in the target library.
  7. Repeat the API flow for a new material code application and assert approval creates a material catalog entry while rejection returns `rejected` and creates no material.

---

CONTRACT APPROVED
