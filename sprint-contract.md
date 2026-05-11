## Sprint 3: Standard Management - Attribute and Brand Modules

### Features
- F04-Attribute Management with AI Governance (backend + frontend)
- F04-AI attribute recommendation (capability: attr_recommend)
- F04-Attribute version control and change logs
- F05-Brand Management (backend + frontend with logo upload)

### Success criteria (black-box-verifiable)
- [ ] Attributes can be created, displayed, searched, edited, and deleted for a selected product name from the browser UI.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173/standard/product-names` in a browser and ensure a product name `Sprint 3 A4 彩色激光打印机` exists with unit `台` and a visible category binding.
  2. Open `http://localhost:5173/standard/attributes`, select product name `Sprint 3 A4 彩色激光打印机`, and create attributes `打印速度` with type `number`, unit `页/分钟`, required enabled, and `颜色模式` with type `enum`, options `黑白, 彩色`, default `彩色`.
  3. Assert the attribute list shows both attributes under `Sprint 3 A4 彩色激光打印机`, with generated immutable attribute codes, data types, required/default values, options, and product-name binding.
  4. Search for `颜色` and assert `颜色模式` remains visible; search for `不存在的属性` and assert the created attributes are not shown.
  5. Edit `打印速度` default value to `30`, refresh `http://localhost:5173/standard/attributes`, and assert the updated value persists.
  6. Delete `颜色模式` and assert it no longer appears while `打印速度` remains visible.

- [ ] Attribute AI governance import preview standardizes pasted or uploaded attribute rows without requiring external model credentials.
  Evaluator steps:
  1. Open `http://localhost:5173/standard/attributes/ai-governance` in a browser and enter or upload rows for product `Sprint 3 A4 彩色激光打印机` containing `速度/每分钟页数/数值`, `打印颜色/黑白彩色/枚举`, and `纸张尺寸/A4 A5/枚举`.
  2. Run the AI governance analysis and assert the preview table shows standardized attribute names, normalized data types, generated attribute codes, option lists where applicable, source row references, and confidence values for each row.
  3. Confirm the preview import, open `http://localhost:5173/standard/attributes`, select `Sprint 3 A4 彩色激光打印机`, and assert the imported attributes appear with their standardized types and options.

- [ ] AI attribute recommendation returns suggested attributes with sources and confidence through the product-facing UI.
  Evaluator steps:
  1. Open `http://localhost:5173/standard/attribute-recommend` in a browser and select product name `Sprint 3 A4 彩色激光打印机`.
  2. Run attribute recommendation and assert the result displays capability label `attr_recommend`, at least three recommended attributes, numeric confidence values, and source labels such as category common attributes, historical data, or standard references.
  3. Accept at least one recommended attribute, open `http://localhost:5173/standard/attributes`, and assert the accepted attribute is persisted under `Sprint 3 A4 彩色激光打印机` with its recommendation source visible in the detail view or change log.

- [ ] Attribute version control records observable change history for every attribute update.
  Evaluator steps:
  1. Open `http://localhost:5173/standard/attributes`, select `Sprint 3 A4 彩色激光打印机`, open the detail view for attribute `打印速度`, and record the displayed current version.
  2. Change `打印速度` type-compatible metadata by updating unit to `ppm`, default value to `35`, and description to `每分钟输出页数`, then save.
  3. Open `http://localhost:5173/standard/attributes/changes` and assert a new change-log entry appears for `打印速度` with incremented version, operator, timestamp, changed fields, before values, and after values.
  4. Refresh `http://localhost:5173/standard/attributes/changes` and assert the same version history remains visible.

- [ ] Brands can be created, edited, searched, displayed with logo thumbnails, and deleted from the browser UI.
  Evaluator steps:
  1. Open `http://localhost:5173/standard/brands` in a browser and create a brand named `Sprint 3 联想` with description `办公设备品牌` and a logo image upload.
  2. Assert the brand list displays `Sprint 3 联想`, an auto-generated immutable brand code, description, enabled status, and a visible logo thumbnail.
  3. Search for `联想` and assert the created brand remains visible; search for `不存在的品牌` and assert the created brand is not shown.
  4. Edit the description to `办公电脑与打印设备品牌`, upload a replacement logo image, refresh `http://localhost:5173/standard/brands`, and assert the description and logo thumbnail update while the brand code remains unchanged.
  5. Delete `Sprint 3 联想` and assert it no longer appears in the brand list.

- [ ] Sprint 3 backend contracts are observable through browser-executed HTTP requests.
  Evaluator steps:
  1. From a browser automation context, request `http://localhost:8000/openapi.json` and assert it includes paths for attribute CRUD, attribute governance preview/import, attribute recommendation, attribute version/change-log retrieval, and brand CRUD.
  2. From the same context, send authenticated requests with `X-User-Role: super_admin` to create an attribute at `http://localhost:8000/api/v1/attributes`, update it at `http://localhost:8000/api/v1/attributes/{attribute_id}`, retrieve its changes at `http://localhost:8000/api/v1/attributes/{attribute_id}/changes`, and call `http://localhost:8000/api/v1/ai/attribute-recommend`.
  3. Assert the API responses include generated immutable attribute codes, persisted product-name bindings, incremented version numbers, before/after change-log values, recommendation results with `capability` equal to `attr_recommend`, confidence scores, and source labels.
  4. From the same context, create a brand at `http://localhost:8000/api/v1/brands`, update its logo metadata at `http://localhost:8000/api/v1/brands/{brand_id}`, and assert the responses include generated immutable brand code, name, description, logo metadata, and enabled status.

---
CONTRACT APPROVED

Sprint: 3
Approved criteria: 6
Notes: All criteria observable through browser verification mode. All have >= 4 test steps with full URLs. Scope matches Sprint 3 from planner-spec.json (F04 attribute management + AI governance, F04 attribute recommendation with attr_recommend capability, F04 version control, F05 brand management with logo upload).
