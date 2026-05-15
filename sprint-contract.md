## Sprint 26: Material Code Rule: Data Models, Backend APIs, and Code Generation Engine

### Features
- Add material-code rule persistence for material library rule versions, serial counters, change batches, change details, and code mappings.
- Extend material libraries with `auto_code_enabled`, `recode_enabled`, and `current_rule_version_id` so each library can own its active code rule.
- Extend material records with original/previous code metadata, rule-version linkage, code-change count, and code status.
- Support creating a material library with embedded code rule configuration; creation auto-generates active rule version V1.
- Return code-rule summary data from material library list and detail APIs while keeping basic library updates separate from rule edits.
- Add current-rule, version-list, new-version, and version-detail APIs under `/api/v1/material-libraries/:id/code-rules`.
- Implement the code generation engine for fixed text, category path, attribute code, date, and serial number segments.
- Implement serial number strategy options for length, start, step, padding, scope, and year/month reset behavior.
- Validate generated and configured codes for allowed characters, uniqueness, required attributes, and maximum length.

### Success criteria (black-box-verifiable)
- [ ] A super_admin can create a material library with an embedded code rule, and the API creates active V1 rule metadata.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Send `POST http://localhost:8000/api/v1/material-libraries` with header `X-User-Role: super_admin` and a unique JSON body containing `name`, `description`, `enabled: true`, `auto_code_enabled: true`, `recode_enabled: true`, and `code_rule` with `rule_name`, `separator: "-"`, and segments for fixed text `MAT`, date `YYYYMMDD`, and a global serial number of length 3 starting at 1.
  3. Assert the response status is 200 or 201 and the response body includes a library `id`, generated library `code`, `auto_code_enabled: true`, `recode_enabled: true`, a non-null `current_rule_version_id`, and a code-rule summary showing version `1` or `V1` with status `active`.
  4. Send `GET http://localhost:8000/api/v1/material-libraries` with header `X-User-Role: super_admin` and assert the created library appears with the same code-rule summary fields.
  5. Send `GET http://localhost:8000/api/v1/material-libraries/<created_library_id>` with header `X-User-Role: super_admin` and assert the detail response includes `current_rule_version_id`, `auto_code_enabled`, `recode_enabled`, and library statistics or material count fields.
  6. Send `PUT http://localhost:8000/api/v1/material-libraries/<created_library_id>` with header `X-User-Role: super_admin` to change only `description`, then assert the returned `current_rule_version_id` and active rule summary are unchanged.

- [ ] Code-rule version APIs expose the active rule, create draft versions without overwriting history, and return parsed segment details.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Create a unique auto-code material library through `POST http://localhost:8000/api/v1/material-libraries` as `super_admin` using a fixed text plus serial-number rule.
  3. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/current` with header `X-User-Role: super_admin` and assert it returns the active V1 rule with `rule_config`, parsed `segments`, `separator`, `status: active`, and the created `rule_name`.
  4. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/versions?page=1&page_size=10` with header `X-User-Role: super_admin` and assert the response contains the V1 rule with version number, status, created-by metadata, and effective time.
  5. Send `POST http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/versions` with header `X-User-Role: super_admin` and a JSON body containing a new `rule_name`, valid `rule_config`, and `change_reason`.
  6. Assert the new-version response creates a separate V2 record with status `draft`, preserves the submitted `change_reason`, and does not change the library `current_rule_version_id`.
  7. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/versions/<v2_id>` and assert the response returns the full V2 rule config and parsed segments.
  8. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/current` again and assert it still returns the original active V1 rule.

- [ ] Material creation in an auto-code library uses the active rule to generate unique material codes and serial numbers.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Send `GET http://localhost:8000/api/v1/categories` and `GET http://localhost:8000/api/v1/product-names` with header `X-User-Role: super_admin`, then select an existing enabled category id and product name id for test material creation.
  3. Create a unique auto-code material library through `POST http://localhost:8000/api/v1/material-libraries` with a rule config composed of fixed text `AUTO`, date format `YYYYMMDD`, and a global serial number with length 3, start 1, step 1, and left-zero padding.
  4. Send `POST http://localhost:8000/api/v1/materials` with header `X-User-Role: super_admin` and a unique material name, the selected `product_name_id`, selected `category_id`, the created `material_library_id`, unit, description, and at least one attributes object.
  5. Assert the material response has code metadata linked to the active rule, including a generated `code` matching `AUTO-<current YYYYMMDD>-001`, `code_rule_version_id` equal to the library current rule version, `code_status` indicating success or active, and `code_change_count` equal to 0.
  6. Send a second `POST http://localhost:8000/api/v1/materials` for the same library with a different unique material name and assert its generated `code` matches `AUTO-<current YYYYMMDD>-002`.
  7. Send `GET http://localhost:8000/api/v1/materials?search=<unique_material_prefix>` with header `X-User-Role: super_admin` and assert both materials are returned with distinct codes and the same rule-version id.

- [ ] Code-rule validation rejects invalid configurations and material inputs before persisting bad generated codes.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Send `POST http://localhost:8000/api/v1/material-libraries` with header `X-User-Role: super_admin` and `auto_code_enabled: true`, but with a rule config whose serial segment has `length: 11`; assert status 400 or 422 and an error message mentioning serial length.
  3. Send `POST http://localhost:8000/api/v1/material-libraries` with header `X-User-Role: super_admin` and a rule config that uses lowercase or unsupported characters in a fixed segment so a generated code would violate the uppercase-letter/digit/hyphen/underscore format; assert status 400 or 422 and an error message mentioning code format.
  4. Send `POST http://localhost:8000/api/v1/material-libraries` with header `X-User-Role: super_admin` and a rule config containing only fixed text and date segments, with no category path, attribute code, or serial segment; assert status 400 or 422 and an error message explaining that at least one uniqueness-producing segment is required.
  5. Create a valid auto-code material library whose active rule includes an attribute-code segment requiring attribute `color` with a value-to-code mapping.
  6. Send `POST http://localhost:8000/api/v1/materials` for that library with attributes that omit `color`; assert status 400 or 422, an error message mentions the missing attribute, and `GET http://localhost:8000/api/v1/materials?search=<failed_material_name>` does not return the failed material.

- [ ] Code-rule data persists across startup and remains available through public API responses.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Create a unique auto-code material library through `POST http://localhost:8000/api/v1/material-libraries` with a valid code rule and record the returned library id and current rule version id.
  3. Create one material in that library through `POST http://localhost:8000/api/v1/materials` and record its generated code and code-rule version id.
  4. Run `bash init.sh` again to simulate a fresh process start without deleting the database.
  5. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>` and assert the same `current_rule_version_id`, `auto_code_enabled`, and rule summary are still present.
  6. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/current` and assert the same rule version id and rule config are returned.
  7. Send `GET http://localhost:8000/api/v1/materials?search=<created_material_name>` and assert the material still has the generated code and the same code-rule version id.

- [ ] New material-code rule write operations follow the existing authorization model.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Send `POST http://localhost:8000/api/v1/material-libraries` with header `X-User-Role: super_admin` and a valid embedded code rule, then record the returned library id.
  3. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/current` with header `X-User-Role: super_admin` and assert status 200.
  4. Send `POST http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/versions` with header `X-Username: hcm_zhangsan` and a valid rule-change body; assert status 403 and that no V2 rule is created.
  5. Send `POST http://localhost:8000/api/v1/material-libraries` with header `X-Username: hcm_zhangsan` and a valid embedded code rule body; assert status 403.
  6. Send `GET http://localhost:8000/api/v1/material-libraries/<library_id>/code-rules/versions?page=1&page_size=10` with header `X-User-Role: super_admin` and assert the version list still contains only the authorized versions created by super_admin.

---
CONTRACT APPROVED

Sprint: 26
Approved criteria: 6
Notes: API-mode verification appropriate for backend-only sprint. Test steps are executable without source code inspection. All assertions are specific and verifiable through HTTP responses. Aligned with F22 (Sprint 26) in planner-spec.json.
