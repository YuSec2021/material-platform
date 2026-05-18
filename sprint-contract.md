## Sprint 31: Frontend: Recode Integration and Code Rule Wizard Polish

### Features
- Integrate code generation into the material creation flow so a material created in an auto-code-enabled material library receives and displays a generated material code before save.
- Polish the code rule segment builder with drag-to-reorder behavior, segment type icons, inline help tooltips, and segment-specific validation highlighting.
- Enhance the attribute code mapping table with attribute-name autocomplete from existing attributes and CSV bulk import for value-to-code mappings.
- Add serial number scope preview showing current serial values for each applicable scope key before material or rule creation.
- Improve recode conflict handling by highlighting conflict rows in red with specific conflict details and blocking execution unless the user explicitly forces execution through an extra confirmation.
- Expand code mapping export with date range filtering, batch filtering, old_code/new_code search, and CSV/Excel format selection.
- Complete zh-CN and en-US i18n coverage for all code rule and recode labels, buttons, messages, table headers, validation errors, status badges, and empty states.
- Improve responsive layout for code rule, recode, and mapping list views on narrow browser widths.

### Success criteria (black-box-verifiable)
- [ ] A super_admin creating a material in an auto-code-enabled library sees the generated material code before saving, and the saved material keeps that code.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login` in a browser, sign in with username `super_admin` and an empty password, then navigate to `http://localhost:5173/material/library`.
  3. Using Playwright request context or an equivalent HTTP client with headers `X-Username: super_admin`, `X-User-Role: super_admin`, and `Authorization: Bearer super_admin`, create setup data through backend APIs: call `GET http://localhost:8000/api/v1/product-names` and `GET http://localhost:8000/api/v1/categories` to choose valid IDs; call `POST http://localhost:8000/api/v1/material-libraries` with a unique name, `auto_code_enabled: true`, `recode_enabled: true`, and a code rule containing fixed segment `S31` plus a serial segment.
  4. In the browser, open the created material library detail view from `http://localhost:5173/material/library`, navigate to the material list or material creation entry point, and start creating a new material in that library.
  5. Fill the required material fields using product/category IDs from setup and material name `Sprint 31 Auto Code Material`; before clicking the final save/create action, assert the form visibly shows a generated code beginning with `S31` in a material code field, preview row, or read-only generated-code display.
  6. Save the material and assert the success state appears without manually typing a material code.
  7. Reopen the created material from the UI or call `GET http://localhost:8000/api/v1/materials?material_library_id={library_id}` with the same headers and assert the material code is present, begins with `S31`, and matches the generated code shown before save.

- [ ] The code rule segment builder supports drag reorder, icons, tooltips, and segment-level validation feedback.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, then create or open an auto-code-enabled material library at `http://localhost:5173/material/library`.
  3. Open the library detail view, click `编码规则`, click `编辑规则`, and assert each visible segment row shows an icon or type-specific visual marker for fixed text, category path, attribute code, date, or serial number segments.
  4. Hover or focus the help affordance for at least two segment types and assert an inline tooltip appears explaining that segment type.
  5. Add at least three segments, drag the last segment above the first segment, and assert the visual order changes and the live preview code updates to reflect the new order.
  6. Create an invalid segment configuration, such as an empty fixed-text value or an attribute-code segment without an attribute name, and attempt to preview or save.
  7. Assert the specific invalid segment is highlighted with a localized validation error near that segment, and unrelated valid segments are not marked as invalid.

- [ ] Attribute code mapping supports attribute autocomplete and CSV bulk import.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using backend APIs with super_admin headers, ensure there is at least one product/category/attribute available by calling `GET http://localhost:8000/api/v1/product-names`, `GET http://localhost:8000/api/v1/categories`, and the existing attribute list endpoint if available; then open `http://localhost:5173/login`, sign in as `super_admin`, and navigate to `http://localhost:5173/material/library`.
  3. Open a material library code rule create or edit form and add an attribute-code segment.
  4. Click the attribute name input and type the first characters of an existing attribute name; assert an autocomplete list appears and selecting an option fills the attribute name field.
  5. Prepare a CSV file with headers `value,code` and at least two rows such as `Red,RD` and `Blue,BL`; use the bulk import action in the attribute mapping table to upload that file.
  6. Assert the mapping table now shows rows for `Red` -> `RD` and `Blue` -> `BL`.
  7. Save or preview the rule and assert no validation error is shown for the imported mapping rows.

- [ ] Serial number scope preview shows current values for configured scope keys before creation or rule activation.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in as `super_admin`, navigate to `http://localhost:5173/material/library`, and open the create-library flow or an existing library's code rule edit form.
  3. Add or select a serial-number segment, configure length, start value, and scope `全局` or its en-US equivalent, then assert the form shows a serial scope preview section with a current value for the global scope before saving.
  4. Change the serial scope to `按类目` or its en-US equivalent and choose a category when prompted.
  5. Assert the serial scope preview updates to show at least one category scope key and its current serial value.
  6. Save or preview the rule and assert the generated example code uses the displayed serial configuration.

- [ ] Conflict rows in recode preview are highlighted, execution is blocked by default, and force execution requires an extra confirmation.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using backend APIs with super_admin headers, create an auto-code-enabled, recode-enabled library, two materials, and a draft code rule version that produces at least one duplicate or conflicting `new_code` by calling `GET http://localhost:8000/api/v1/product-names`, `GET http://localhost:8000/api/v1/categories`, `POST http://localhost:8000/api/v1/material-libraries`, `POST http://localhost:8000/api/v1/materials`, `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions`, and `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions/{version_id}/recode-preview`.
  3. In a browser session authenticated as `super_admin`, navigate to `http://localhost:5173/material/library`, open the created library, and open the recode preview for the conflict batch.
  4. Assert rows with conflict status are visually highlighted red and show a specific conflict reason such as duplicate code, existing code conflict, or `编码冲突`.
  5. Click the normal execute/confirm recode action and assert execution is blocked with an error or disabled action while conflicts exist.
  6. Enable the explicit force option if the UI provides it, then click the force execute action.
  7. Assert a second confirmation dialog appears that explicitly mentions force execution and code conflicts before any execution request is sent.
  8. Cancel the force confirmation and assert the batch remains in preview or pending state in the UI.

- [ ] Code mapping export supports date range, batch filter, search, and CSV/Excel format selection.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using backend APIs with super_admin headers, create an auto-code-enabled, recode-enabled library, at least one material, and one executed recode batch by calling `GET http://localhost:8000/api/v1/product-names`, `GET http://localhost:8000/api/v1/categories`, `POST http://localhost:8000/api/v1/material-libraries`, `POST http://localhost:8000/api/v1/materials`, `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions`, `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions/{version_id}/recode-preview`, and `POST http://localhost:8000/api/v1/material-code-change-batches/{batch_id}/execute`.
  3. Open `http://localhost:5173/login`, sign in as `super_admin`, navigate to `http://localhost:5173/material/library`, open the created library detail view, and click the `编码映射` tab.
  4. Enter an old code, new code, or material name visible in the table into the search field and assert the table filters to matching mapping rows.
  5. Apply the executed batch ID filter and a date range that includes the mapping change time; assert the table remains filtered to the selected batch and date range.
  6. Open the export action and assert it offers format choices for CSV and Excel.
  7. Choose CSV, download the file, and assert the `.csv` content contains only rows matching the active search/filter criteria and includes columns for old code, new code, material name, batch ID, change time, and status.
  8. Choose Excel, download the file, and assert an `.xlsx` file is downloaded for the same active search/filter criteria.

- [ ] Code rule and recode pages have complete zh-CN/en-US labels and stay usable on a narrow viewport.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in as `super_admin`, navigate to `http://localhost:5173/material/library`, and open a material library detail view containing code rule, recode record, and code mapping tabs.
  3. In zh-CN locale, visit the code rule edit form, recode preview, recode records, and code mapping tab; assert no visible key-like fallback text such as `codeRule.`, `recode.`, `mapping.`, `undefined`, or `missing` appears in labels, buttons, table headers, validation messages, status badges, or empty states.
  4. Switch to en-US locale using the app's language control and repeat the same page visits; assert English labels are visible and no key-like fallback text appears.
  5. Resize the browser viewport to `390x844`, return to `http://localhost:5173/material/library`, and open the same library detail view.
  6. Assert the code rule, recode records, and code mapping list views remain usable without overlapping text or clipped primary actions; tables may scroll horizontally, but tab labels, filters, and primary buttons must remain reachable.
  7. On the narrow viewport, open the code rule edit form and assert segment rows, validation errors, and save/cancel actions remain visible and operable.

---
CONTRACT APPROVED

Sprint: 31
Approved criteria: 7
Notes: All criteria map cleanly to browser-mode verification with Playwright. Test steps are concrete and unambiguous. Each criterion has at least 6 test steps covering setup, action, and assertion phases. Good calibration on conflict handling (multi-step confirmation), export (CSV and Excel verification), and responsive (viewport boundary at 390x844).
