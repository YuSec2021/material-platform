# Eval Result -- Sprint 4
Date: 2026-05-11

## Scores

| Dimension       | Score | Threshold | Result |
|----------------|-------|-----------|--------|
| Design quality  | 7/10  | >= 7      | PASS   |
| Originality     | 7/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 8/10  | >= 8      | PASS   |

## Verdict: SPRINT PASS

## Evidence

### Criterion: A user can create, view, edit, search, filter, and delete materials from the browser UI, with status badges visible in the material list.
Result: PASS

Evidence:
- **API layer verified**: GET /api/v1/materials returns materials with `code` (format `MAT-C3B15A5C`), `status` (enum: `normal`/`stop_purchase`/`stop_use`), `attributes` JSON object, and full binding fields (`product_name`, `material_library`, `category`, `brand`).
- **Create**: POST /api/v1/materials auto-generates `MAT-XXXXXXXX` code and sets status to `normal`.
- **Search/filter**: GET /api/v1/materials?search=... and ?status=normal query parameters are supported. API unit tests assert both search and filtered results.
- **Status badges**: Frontend `statusBadge()` function renders `normal`, `stop_purchase`, `stop_use` as styled `<span class="status-badge">` elements in the material table.
- **Edit/update**: PUT /api/v1/materials/{id} updates description and attributes. Detail view shows attributes as formatted JSON.
- **Delete**: DELETE /api/v1/materials/{id} returns `{"deleted": true}` and material no longer appears in search.
- **Frontend complete**: Material management UI at http://localhost:5173/materials includes: create form with all required fields, material table with code/status/binding/brand/attributes/actions columns, search input, status filter dropdown, edit/detail/delete/transition buttons.
- **Unit test passes**: `test_material_crud_search_filter_and_status_machine` passes all assertions.

### Criterion: Material state transitions are enforced through externally visible workflow controls and invalid transitions are blocked.
Result: PASS

Evidence:
- **API enforces state machine**: POST /api/v1/materials/{id}/transition with `{"target_status": "stop_use"}` on a `normal` material returns HTTP 400. Sequential transitions `normal -> stop_purchase -> stop_use` succeed. Reverse transitions (e.g. `stop_use -> normal`) return HTTP 400.
- **Frontend controls invalid transitions**: `transitionButtons()` renders `normal` materials with "Stop Purchase" enabled and "Stop Use" disabled with title "stop_use requires stop_purchase first". `stop_purchase` materials see "Stop Use" enabled and "Return Normal" disabled with title "Status is non-reversible". `stop_use` materials see all buttons disabled with titles indicating finality.
- **Transition reason required**: Frontend prompts with `window.prompt()` for a reason before calling the transition API.
- **Unit test passes**: `test_material_crud_search_filter_and_status_machine` asserts that skipping `stop_purchase` returns 400, sequential transitions succeed, and reverse transitions return 400.

### Criterion: Excel material governance import provides an AI preview, validates rows before write, and batch-confirms accepted materials.
Result: PASS

Evidence:
- **Governance preview endpoint**: POST /api/v1/materials/governance/preview accepts `rows` (CSV string), `file_name`, `file_content` (base64), along with binding IDs. Returns `{"capability": "material_governance", "count": 2, "items": [...]}`.
- **Row validation**: Valid rows are marked `selectable: true` with empty `errors`. Invalid rows (missing material name) are marked `selectable: false` with `errors: ["Material name is required"]`.
- **AI-structured fields**: Preview items include `name`, `code`, `material_library`, `category`, `product_name`, `attributes` (extracted attribute key-value pairs), `validation_status`, `confidence`, `source_row`.
- **Batch import**: POST /api/v1/materials/governance/import accepts selected items and creates materials in batch. Returns created material array with auto-generated codes and `normal` status.
- **Frontend governance UI**: At http://localhost:5173/materials/governance -- textarea for pasted CSV rows, file upload for .csv/.xlsx, "Run AI material governance preview" button, preview table with checkbox selection, "Confirm selected materials" button enabled only when selectable items exist.
- **API test passes**: `test_material_governance_preview_import_and_openapi` asserts `preview["capability"] == "material_governance"`, one valid and one invalid item, extracted attributes, and successful batch import.

### Criterion: Material creation and AI governance actions are available through documented HTTP surfaces used by the browser, while the browser remains the primary verification surface.
Result: PASS

Evidence:
- **OpenAPI spec**: GET /openapi.json lists material CRUD endpoints: `/api/v1/materials` (GET/POST), `/api/v1/materials/{material_id}` (GET/PUT/DELETE), state transition: `/api/v1/materials/{material_id}/transition` (POST), AI governance: `/api/v1/materials/governance/preview` (POST) and `/api/v1/materials/governance/import` (POST).
- **Capability exposed in response**: Live API call to `POST /api/v1/materials/governance/preview` returns `"capability": "material_governance"` in the JSON body. The operation description in OpenAPI reads "AI material governance preview. capability: material_governance".
- **Browser usage**: Frontend `request()` function calls all `/api/v1/materials*` endpoints. Nav links at `/materials` and `/materials/governance` route to material management and governance UI respectively.
- **OpenAPI assertions in test**: `test_material_governance_preview_import_and_openapi` asserts the OpenAPI document contains `/api/v1/materials`, `/api/v1/materials/governance/preview`, and the string `material_governance`.

## Scope Verification
Changed files are contained within Sprint 4 contract scope: backend/app/main.py (FastAPI routes, models, schemas), frontend/app.js (material CRUD UI + governance UI), frontend/index.html (nav links), frontend/styles.css (status badges, governance table), tests/test_sprint4_api.py (API integration tests). No scope violations detected.
