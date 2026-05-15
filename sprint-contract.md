## Sprint 28: Frontend: Create Material Library with Code Rule Configuration

### Features
- Update the material library create flow at `http://localhost:5173/material/library` so automatic material coding can be configured when creating a new material library.
- Add an automatic coding toggle; the code rule configuration UI is visible only when automatic coding is enabled.
- Add a visual code rule segment builder with add, remove, and reorder controls for fixed text, category path, attribute code, date, and serial number segments.
- Provide type-specific segment inputs: fixed literal text; category path level and per-level length; attribute name plus value-to-code mapping rows; date format; serial number length, start value, and scope.
- Add optional single-character separator configuration for generated material codes.
- Show a live example code preview while users edit the rule, including a visible preview error when required mock material data or attribute mappings are missing.
- Validate before save: at least one unique-generating segment is required, generated code length must not exceed 64 characters, and ambiguous duplicate segment configurations are blocked.
- Add zh-CN and en-US i18n for labels, placeholders, validation messages, buttons, segment type names, preview text, and empty states in the create-rule UI.
- On save, call `POST /api/v1/material-libraries` with the library fields, `auto_code_enabled: true`, and embedded `code_rule` containing the separator and ordered segment definitions; then display the created library with its V1/current rule summary.

### Success criteria (black-box-verifiable)
- [ ] A super_admin can reveal and hide code rule configuration from the material library create flow.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login` in a browser, sign in with username `super_admin` and an empty password, then navigate to `http://localhost:5173/material/library`.
  3. Click `新建物料库` and assert the create dialog or page contains basic fields for library name, description, enabled status, and an automatic coding control labeled `自动编码` or equivalent.
  4. Assert the separator, live preview, and segment builder controls are hidden or disabled while automatic coding is off.
  5. Turn automatic coding on and assert the separator, live preview, and segment builder controls become visible and usable.
  6. Enter a library name, turn automatic coding off again, and assert the code rule controls are hidden or disabled while the entered library name remains unchanged.

- [ ] The segment builder supports all Sprint 28 segment types with type-specific controls and stable add, remove, and reorder behavior.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, click `新建物料库`, enter a unique library name, and enable automatic coding.
  3. Add a fixed text segment and assert it exposes a literal value input; enter `MAT`.
  4. Add a category path segment and assert it exposes a level selector with 1/2/3 options plus per-level length inputs; choose level 2 and set lengths to 2 and 2.
  5. Add an attribute code segment and assert it exposes an attribute name input plus a value-to-code mapping table with add/remove row controls; enter attribute `color` and rows `red -> R` and `blue -> B`.
  6. Add a date segment and assert it exposes a format selector containing `YYYY`, `YYMM`, and `YYYYMMDD`; choose `YYMM`.
  7. Add a serial number segment and assert it exposes length, start, and scope controls; set length 4, start 1, and scope `全局` or equivalent.
  8. Use the reorder controls to move the serial number segment before the date segment, then assert the visual order changes without losing the configured values above.
  9. Remove the attribute code segment and assert the remaining fixed text, category path, serial number, and date segments keep their configured values.

- [ ] Live preview and validation update immediately as the rule is edited.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, click `新建物料库`, enter a unique library name, enable automatic coding, and set the separator to `-`.
  3. Configure fixed text `MAT`, date format `YYMM`, and serial number length 3/start 1/scope `全局`, then assert the preview shows an example containing the fixed text, the date token or current date value, separators, and a zero-padded serial value such as `001`.
  4. Change the separator to `_` and assert the preview updates to use `_` without saving.
  5. Remove every serial number and category path segment, leaving only non-unique segments, then save or trigger validation and assert a visible validation message explains that at least one unique-generating segment is required.
  6. Enter a fixed text value long enough to push the generated code over 64 characters, then assert a visible validation message explains the maximum length limit and the library is not submitted.
  7. Configure an attribute code segment for attribute `color` without a mapping for the preview's mock value, then assert the live preview shows a clear missing-attribute or missing-mapping error instead of a generated code.

- [ ] Saving an automatic-code material library sends embedded `code_rule` and displays the created V1/current rule summary.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. In Playwright or an equivalent browser test, listen for `POST http://localhost:5173/api/v1/material-libraries` before interacting with the UI.
  3. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, click `新建物料库`, and enter a unique library name and description.
  4. Enable automatic coding, set separator `-`, add fixed text `AUTO`, add a serial number segment with length 3/start 1/scope `全局`, and save the form.
  5. Assert the captured POST request body includes `name`, `description`, `enabled`, `auto_code_enabled: true`, and `code_rule` with `separator: "-"` plus ordered segment definitions for fixed text and serial number.
  6. Assert the POST response succeeds with status 200 or 201.
  7. Assert `http://localhost:5173/material/library` displays the created library name and a visible automatic-code or V1/current rule summary such as `V1`, `自动编码`, `编码规则`, or the generated rule preview.
  8. Send `GET http://localhost:8000/api/v1/material-libraries` with super_admin authentication, for example header `X-User-Role: super_admin`, and assert the created library is present with `auto_code_enabled` true and a `code_rule_summary` or `current_rule_version_id`.

- [ ] The create-rule UI is localized for zh-CN and en-US and preserves form state across language changes.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, click `新建物料库`, and enable automatic coding.
  3. Assert the default zh-CN view includes localized text for automatic coding, code rule configuration, segment type, separator, live preview, fixed text, category path, attribute code, date, serial number, save, and cancel.
  4. Enter a unique library name, configure fixed text `LOC`, separator `-`, and a serial number segment with length 3/start 1.
  5. Use the app language switcher while staying in the create flow and assert the UI now shows en-US labels for automatic coding, code rule configuration, segment type, separator, live preview, fixed text, category path, attribute code, date, serial number, save, and cancel.
  6. Assert the previously entered library name, fixed text `LOC`, separator `-`, serial length, and serial start values are preserved after the language change.
  7. Trigger the missing unique-generating segment validation in en-US and assert the visible error message is in English, then switch back to zh-CN and assert the corresponding validation message appears in Chinese.

---
CONTRACT APPROVED

Sprint: 28
Approved criteria: 5
Notes: Backend schema confirmed ready (MaterialLibraryIn supports auto_code_enabled and code_rule fields; MaterialLibraryOut includes code_rule_summary). Language switcher confirmed at MainLayout level (not modal-internal). All evaluator steps use browser (Playwright) mode per planner-spec.json verification.mode.
