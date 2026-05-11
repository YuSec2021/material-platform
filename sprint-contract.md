## Sprint 4: Material Management Core

### Features
- F07-Material CRUD (backend + frontend)
- F07-AI material governance pipeline (capability: material_governance)
- F19-Material state machine enforcement
- Frontend: material list with status badges, search/filter
- Excel import preview and batch confirmation UI

### Material Model Fields
A Material record contains:
- `id` (integer, primary key)
- `code` (string, auto-generated, e.g. `MAT-ABC12345`)
- `name` (string, required, unique within a product-name scope)
- `product_name_id` (integer, FK to product_name)
- `material_library_id` (integer, FK to material_library)
- `category_id` (integer, FK to category)
- `unit` (string, e.g. "台", "个")
- `brand_id` (integer, FK to brand, optional)
- `status` (string, enum: `normal` (initial), `stop_purchase`, `stop_use`)
- `description` (string, optional)
- `attributes` (JSON object mapping attribute names to values, e.g. `{"打印速度": "30", "颜色模式": "彩色"}`)
- `enabled` (boolean, default true)
- `created_at`, `updated_at` (timestamps)

### Success criteria (black-box-verifiable)
- [ ] A user can create, view, edit, search, filter, and delete materials from the browser UI, with status badges visible in the material list.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Navigate to the material management area (a "Material" or "物料管理" nav link must be present). Create a material with: name (unique), material library selection, category/product-name binding, unit, brand (optional), and at least one attribute name-value pair.
  3. Assert the created material appears in the list with an auto-generated material code (format `MAT-XXXXXXXX`) and a `normal` status badge.
  4. Search by the unique material name and assert only the matching material remains visible.
  5. Filter the list by `normal` status using a status filter control (dropdown or toggle) and assert the created material is still visible with the same status badge.
  6. Edit the material description or attribute value, save, reopen the material detail, and assert the updated value is displayed.
  7. Delete the material from the UI and assert it no longer appears when searching for the unique name.

- [ ] Material state transitions are enforced through externally visible workflow controls and invalid transitions are blocked.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Create a new material through the material management UI and assert it is listed with `normal` status.
  3. Attempt to move the `normal` material directly to `stop_use` from the UI and assert the action is disabled or an error message explains that stop use requires stop purchase first.
  4. Move the material from `normal` to `stop_purchase`, providing an exemption or transition reason when prompted, and assert the list status badge changes to `stop_purchase`.
  5. Move the same material from `stop_purchase` to `stop_use`, providing a reason when prompted, and assert the list status badge changes to `stop_use`.
  6. Attempt to return the `stop_use` material to `normal` or `stop_purchase` and assert the UI blocks the action or displays a non-reversible state error.

- [ ] Excel material governance import provides an AI preview, validates rows before write, and batch-confirms accepted materials.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Navigate to the material import or AI governance area at `http://localhost:5173` and upload an Excel file (.xlsx) or CSV file containing at least two materials: one valid row and one row with a missing required field.
  3. Trigger AI material governance preview and assert the preview table shows proposed structured material fields, extracted attribute values, and row-level validation status.
  4. Assert the invalid row is marked with a visible error and cannot be selected for batch confirmation.
  5. Select the valid preview row, confirm batch import, and assert a success message reports one imported material.
  6. Search the material list for the imported material name and assert it appears with an auto-generated material code, extracted attributes, and `normal` status.

- [ ] Material creation and AI governance actions are available through documented HTTP surfaces used by the browser, while the browser remains the primary verification surface.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:8000/openapi.json` in a browser.
  2. Assert the OpenAPI document lists material CRUD endpoints under `/api/v1/materials`.
  3. Assert the OpenAPI document lists an AI material governance preview or import endpoint (e.g., `/api/v1/materials/governance/preview` or `/api/v1/ai/material-governance/preview`) that exposes the `material_governance` capability in the response body.
  4. Open `http://localhost:5173` in a browser and assert the material management UI can complete the same create and import preview flows without direct source-code access.