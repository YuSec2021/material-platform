## Sprint 7: Material Application Workflows - Stop Purchase and Stop Use

### Features
- F12-Material Stop Purchase Application workflow
- F12-Admin manual stop purchase with exemption reason
- F13-Material Stop Use Application workflow with `stop_purchased` / `stop_purchase` material precondition
- Frontend: stop purchase and stop use forms with reason selection
- State transition UI indicators throughout material lifecycle
- Backend: workflow state machine integration for stop purchase and stop use, including approval, rejection, precondition checks, and immutable lifecycle history
- Approved stop purchase applications update material status from `normal` to `stop_purchase`
- Approved stop use applications update material status from `stop_purchase` to terminal `stop_use`

### Stop Workflow Fields
A stop purchase or stop use workflow application record contains:
- `id` (integer, primary key)
- `application_no` (string, auto-generated, stable user-facing number)
- `type` (string enum: `stop_purchase`, `stop_use`)
- `status` (string enum: `draft`, `submitted`, `pending_department_head`, `pending_asset_management`, `pending_approval`, `approved`, `rejected`)
- `material_id` and visible material summary fields: material code, material name, material library, category/product-name path, current material status
- `reason_code` or selected reason option (required)
- `reason` or business reason text (required)
- `current_node` (string, current approval step or terminal state)
- `approval_history` (ordered list of submit/approve/reject events with actor, node, action, comment, and timestamp)
- `created_at`, `updated_at` (timestamps)

A stop purchase application contains:
- target material selection, limited to materials currently in `normal` status
- selected stop-purchase reason option
- detailed business justification
- optional effective date or remark when exposed by the UI

A stop use application contains:
- target material selection, limited to materials currently in `stop_purchase` status
- selected stop-use reason option
- detailed business justification
- explicit irreversible/terminal-state warning visible before submission or approval

An admin manual stop purchase action contains:
- target material currently in `normal` status
- selected or entered exemption reason (required)
- operator identity or visible action source indicating admin/manual operation
- lifecycle history entry showing the status changed from `normal` to `stop_purchase`

### Success criteria (black-box-verifiable)
- [ ] A material manager can submit a stop purchase application for a normal material, complete approval, and see the material status update to `stop_purchase`.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open the material list at `http://localhost:5173/materials`, create or locate a unique material in `normal` status such as `测试停采物料-<timestamp>`, and assert the list/detail page shows a `normal` lifecycle badge.
  3. Open the stop purchase application page from visible navigation, from the material row action, or directly at `http://localhost:5173/workflows/stop-purchase`.
  4. Select the normal material, choose a visible stop-purchase reason option such as `供应商停产` or another configured option, enter a business justification, and submit the application.
  5. Assert the application detail page shows an auto-generated application number, type `stop_purchase`, the selected material code/name, selected reason, non-terminal pending approval status, and a submit event in approval history.
  6. Approve the application through the approver task list at `http://localhost:5173/workflows/tasks` using the configured approval flow until the application reaches `approved`.
  7. Return to `http://localhost:5173/materials`, search for the unique material name, and assert the material row and detail page show status `stop_purchase` with a visible lifecycle indicator or timeline entry for the approved stop purchase application.

- [ ] Stop purchase application rejection requires a reason, preserves the submitted material and reason evidence, and does not change the material status.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Create or locate a unique `normal` material such as `测试停采驳回物料-<timestamp>`.
  3. Submit a stop purchase application for that material from `http://localhost:5173/workflows/stop-purchase` with a selected reason option and business justification.
  4. Open `http://localhost:5173/workflows/tasks`, attempt to reject without a comment, and assert the UI blocks the action or displays a validation error requiring a rejection reason.
  5. Reject the application with a visible reason such as `停采依据不足`.
  6. Assert the applicant-facing application list at `http://localhost:5173/workflows/applications` shows the request with status `rejected` and displays the rejection reason, original selected stop-purchase reason, and target material evidence in the detail/history view.
  7. Open `http://localhost:5173/materials`, search for the unique material name, and assert the material still has `normal` status.

- [ ] An admin can manually stop purchase for a normal material only after providing an exemption reason, and the manual transition is visible in lifecycle history.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open `http://localhost:5173/materials`, create or locate a unique material in `normal` status such as `测试管理员停采物料-<timestamp>`.
  3. From the material row action or detail page, choose the admin/manual stop purchase action.
  4. Attempt to confirm manual stop purchase without an exemption reason and assert the UI blocks the action or displays a validation error requiring an exemption reason.
  5. Confirm manual stop purchase with an exemption reason such as `紧急质量风险停采`.
  6. Assert the material list and detail page show status `stop_purchase` immediately, without requiring a workflow approval task.
  7. Assert the material detail lifecycle history or status timeline shows a manual/admin source, the exemption reason, and the status transition from `normal` to `stop_purchase`.

- [ ] Stop use applications enforce the stop-purchase precondition, approve only eligible materials, and update eligible materials to terminal `stop_use`.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Create or locate one unique material in `normal` status such as `测试停用前置拦截-<timestamp>` and one unique material already in `stop_purchase` status such as `测试停用物料-<timestamp>`.
  3. Open the stop use application page from visible navigation, from the material row action, or directly at `http://localhost:5173/workflows/stop-use`.
  4. Attempt to submit a stop use application for the `normal` material and assert the material is unavailable/disabled in the selector or submission fails with a visible error explaining that stop use requires prior stop purchase.
  5. Select the `stop_purchase` material, choose a visible stop-use reason option such as `长期无库存且无业务需求` or another configured option, enter a business justification, acknowledge any irreversible-state warning when present, and submit.
  6. Approve the application through `http://localhost:5173/workflows/tasks` using the configured approval flow until the application reaches `approved`.
  7. Open `http://localhost:5173/materials`, search for the eligible material name, and assert the material row and detail page show terminal status `stop_use` with lifecycle history linking to the approved stop use application.
  8. Attempt to change the `stop_use` material back to `normal` or `stop_purchase` from any visible lifecycle action and assert the UI blocks the action or displays a non-reversible terminal-state error.

- [ ] Stop workflow forms expose selectable reason options and lifecycle status indicators consistently across application, task, material list, and material detail views.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open `http://localhost:5173/workflows/stop-purchase` and assert the form contains a required reason selection control with at least two visible stop-purchase reason options or an option plus required custom reason entry.
  3. Open `http://localhost:5173/workflows/stop-use` and assert the form contains a required reason selection control with at least two visible stop-use reason options or an option plus required custom reason entry.
  4. Submit one stop purchase or stop use application and assert the application detail page, approver task list at `http://localhost:5173/workflows/tasks`, and applicant application list at `http://localhost:5173/workflows/applications` all display the selected reason and current workflow status.
  5. Open `http://localhost:5173/materials` and assert material lifecycle states are visually distinguishable in the list, including at least `normal`, `stop_purchase`, and `stop_use` badges or equivalent indicators after test data is created.
  6. Use the material list status filter for `stop_purchase` and `stop_use` and assert each filter returns materials with the matching visible lifecycle indicator and excludes materials in other statuses.
  7. Open a material detail page for each lifecycle state and assert the current status, available next actions, and blocked invalid actions match the lifecycle order `normal -> stop_purchase -> stop_use`.

- [ ] Stop purchase and stop use APIs are documented and enforce material lifecycle state-machine rules independently of source-code inspection.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:8000/openapi.json` in a browser.
  2. Assert the OpenAPI document lists endpoints for workflow application creation, listing/detail, approval, rejection, task retrieval, material listing/detail, and an admin/manual stop purchase action under paths such as `/api/v1/workflows/applications`, `/api/v1/workflows/tasks`, `/api/v1/materials`, or `/api/v1/materials/{id}/stop-purchase`.
  3. Send a real HTTP request to create a stop purchase application for a `normal` material and assert the JSON response includes `application_no`, `type: "stop_purchase"`, target material fields, selected reason, non-terminal pending status, current node, and an approval history entry for submission.
  4. Send valid approval requests for the configured approval mode and assert the terminal response is `approved`; then verify through a real HTTP request to the material endpoint that the target material status is `stop_purchase`.
  5. Send a real HTTP request attempting to create a stop use application for a `normal` material and assert the API returns a 4xx response with a clear precondition or state-transition error and does not mutate the material status.
  6. Send a real HTTP request to create and approve a stop use application for a `stop_purchase` material and assert the material endpoint returns terminal status `stop_use`.
  7. Send invalid lifecycle requests such as manual stop purchase without an exemption reason, stop purchase for an already `stop_use` material, or reverting a `stop_use` material, and assert each returns a 4xx response with a clear error instead of mutating the material.

---

CONTRACT APPROVED
