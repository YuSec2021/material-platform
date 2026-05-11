# Eval Result — Sprint 6
Date: 2026-05-11T14:33:00Z

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 7/10  | >= 7      | PASS   |
| Originality     | 6/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 10/10 | >= 8      | PASS   |

## Verdict: SPRINT PASS

## Evidence

### Criterion: New category multi-node approval flow creates category
Result: PASS
Evidence:
- API `POST /api/v1/workflows/applications` with `type: new_category` returns `status: pending_department_head`, `current_node: department_head`, `application_no: APP-421C48FBE2`, and `approval_history` with submit event
- Department head approve → `status: pending_asset_management`, `current_node: asset_management`, 2 history events
- Asset management approve → `status: approved`, `current_node: approved`, 3 history events, `created_resource_type: category`, `created_resource_id: 8`
- Category `验证测试类目-1778510007` (code `CAT-E0AD687E`) found in category library at `GET /api/v1/categories?search=验证测试类目-1778510007`

### Criterion: Category application rejection requires reason and does not create category
Result: PASS
Evidence:
- Reject without comment → `{"detail":"A rejection reason is required"}` (422)
- Reject with reason `"类目名称不符合标准命名规则"` → `status: rejected`, `rejection_reason` preserved
- Search for `测试驳回类目*` returns no category matches (confirmed via category list)

### Criterion: Material code application requires 3 images and creates material on approval
Result: PASS
Evidence:
- Submit with 2 images → `{"detail":"Three required reference images must be uploaded before submission"}` (422)
- Submit with 3 images in simple mode → `status: pending_approval`, `current_node: approver`
- Single approve → `status: approved`, `created_resource_type: material`, `created_resource_id: 32`
- Material ID 32: `name: 测试编码物料-1778510110`, `code: MAT-496AB47F`, `status: normal`, `attributes._reference_mall_link: https://example.com/material-code-test`

### Criterion: Material code rejection preserves evidence and does not create material
Result: PASS
Evidence:
- Rejection detail page shows `reference_mall_link: https://example.com/reject-test` and `image_count: 3`
- Search for `驳回物料码*` → 0 materials found

### Criterion: Approval mode switch without restart
Result: PASS
Evidence:
- Config `PUT /api/v1/system/config` with `{"approval_mode": "simple"}` → `"approval_mode": "simple"` (no backend restart)
- Category application in simple mode → `status: pending_approval` (not `pending_department_head`)
- Switch to `multi_node` → Category application → `status: pending_department_head`
- Both modes respected without restart

### Criterion: Workflow APIs documented and state-machine enforced
Result: PASS
Evidence:
- OpenAPI lists 8 workflow/system endpoints: `/api/v1/system/config` (GET/PUT/POST), `/api/v1/workflows/applications` (GET/POST), `/api/v1/workflows/applications/{id}` (GET), `/api/v1/workflows/applications/{id}/approve` (POST), `/api/v1/workflows/applications/{id}/reject` (POST), `/api/v1/workflows/tasks` (GET), plus typed shortcuts
- Wrong-node approve on app ID 10 → `{"detail":"Current workflow node is department_head, not asset_management"}` (409)
- Wrong-node approve on app ID 16 → `{"detail":"Current workflow node is approver, not wrong_node"}`
- Unit test `test_openapi_documents_workflow_paths` passes, asserting `/approve`, `/reject`, `/workflows/applications`, `/workflows/tasks`, `/system/config` in OpenAPI

### Backend tests
Result: PASS
Evidence: All 10 tests pass including 4 Sprint 6 tests:
- `test_new_category_multi_node_approval_creates_category`
- `test_rejection_requires_reason_and_does_not_create_category`
- `test_material_code_validation_approval_and_simple_mode`
- `test_openapi_documents_workflow_paths`

### Frontend routes
Result: PASS
Evidence: Navigation includes all required paths: `/workflows/new-category`, `/workflows/new-material-code`, `/workflows/tasks`, `/workflows/applications`, `/system/config`, `/categories`. Client-side router in `app.js` handles all 7 workflow routes plus existing routes. Tests confirm all routes are mapped.

## Scope violations
None. All 13 changed files (1279 insertions) are within the sprint contract scope: workflow models/schemas/routes, frontend workflow pages and routing, and test file `tests/test_sprint6_api.py`.