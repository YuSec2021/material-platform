## Sprint 11: System Configuration and Audit Logging

### Features
- F16-System configuration: system info maintenance for system name and icon.
- F16-Reason options maintenance for stop purchase and stop use reason lists.
- F16-Approval mode switch between simple approval and multi-node workflow.
- F20-Operational audit log covering backend write operations with user, resource, action, before value, after value, timestamp, and source.
- F20-Frontend audit log list view with filters, pagination, and role-based visibility.
- F20-Before/after value diff view for audited changes.
- F20-Excel export for compliance audit.

### Success criteria (black-box-verifiable)
- [ ] Administrators can maintain system identity settings and see those settings persist in the browser.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser as a seeded administrator.
  2. Open the system configuration page from the system administration navigation, or directly open its documented route under `http://localhost:5173`.
  3. Change the system name to `Sprint 11 System <timestamp>` and upload or select a visible system icon through the configuration UI.
  4. Save the configuration, reload `http://localhost:5173`, and assert the visible app header, title area, or configuration form shows `Sprint 11 System <timestamp>` and the selected icon.
  5. Open `http://localhost:8000/openapi.json`, identify the documented system configuration read endpoint, and send a real HTTP request as the same administrator.
  6. Assert the API response exposes the saved system name and icon metadata without requiring source-code inspection.

- [ ] Administrators can manage stop purchase and stop use reason options, and workflow forms consume the configured options.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` as a seeded administrator.
  2. On the system configuration page, add an enabled stop purchase reason named `Sprint 11 Stop Purchase <timestamp>` and an enabled stop use reason named `Sprint 11 Stop Use <timestamp>`.
  3. Save the reason configuration, reload `http://localhost:5173`, and assert both new reasons remain listed with their enabled status.
  4. Open the stop purchase application form from `http://localhost:5173` and assert the stop purchase reason selector includes `Sprint 11 Stop Purchase <timestamp>`.
  5. Open the stop use application form from `http://localhost:5173` and assert the stop use reason selector includes `Sprint 11 Stop Use <timestamp>`.
  6. Disable or delete the two Sprint 11 reason options, reload the relevant forms, and assert the removed or disabled options are no longer selectable for new submissions.

- [ ] The approval mode switch persists and changes externally visible workflow behavior.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` as a seeded administrator.
  2. On the system configuration page, set approval mode to simple approval and save.
  3. Open a new material category or new material code application workflow at `http://localhost:5173`, create a draft request, and assert the approval route preview or submitted request shows a single approval step.
  4. Return to system configuration, set approval mode to multi-node workflow, and save without restarting backend or frontend services.
  5. Create another new material category or new material code application request from `http://localhost:5173` and assert the approval route preview or submitted request shows multiple approval nodes such as department approval followed by asset management approval.
  6. Reload `http://localhost:5173`, reopen system configuration, and assert the selected approval mode remains multi-node workflow.

- [ ] Backend write operations create operational audit records that are visible in the audit log list with filters and pagination.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` as a seeded administrator.
  2. Perform at least three distinct write operations through the browser or documented API surface, including updating the system name, adding a reason option, and changing the approval mode.
  3. Open the audit log page from system administration, or directly open its documented route under `http://localhost:5173`.
  4. Assert the audit log list includes entries for the three writes with user, resource, action, timestamp, and source values visible.
  5. Use the audit log filters for time range, resource or type, and user; assert the list includes matching entries and excludes non-matching entries.
  6. Create enough additional write operations to exceed one page of audit entries, use the pagination controls, and assert entries can be viewed across pages without losing the active filters.
  7. Open `http://localhost:8000/openapi.json`, identify the documented audit log list endpoint, and assert real HTTP requests return the same audited resource/action data shown in the browser.

- [ ] Audit details show before/after changes as a readable diff without exposing unrelated sensitive values.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` as a seeded administrator.
  2. Change the system name from one unique value to another, such as `Sprint 11 Before <timestamp>` to `Sprint 11 After <timestamp>`.
  3. Open the audit log page at `http://localhost:5173` and locate the audit record for that system configuration update.
  4. Open the audit detail or diff view for the record and assert it shows the changed field, the before value `Sprint 11 Before <timestamp>`, and the after value `Sprint 11 After <timestamp>`.
  5. Repeat with a reason option update and assert the diff view clearly identifies added, removed, or edited reason values.
  6. Assert the detail view does not display plaintext secrets such as model API keys from prior LLM gateway configuration records.

- [ ] Audit visibility is role-based and restricts non-administrator access.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` as a seeded administrator.
  2. Confirm the administrator can open the audit log page under `http://localhost:5173` and can view audit entries.
  3. Sign out or switch to a seeded non-administrator user with no audit-log permission.
  4. Attempt to open the same audit log route under `http://localhost:5173` and assert the UI hides the navigation item and blocks direct access with an access-denied, not-found, or redirect state.
  5. Open `http://localhost:8000/openapi.json`, identify the documented audit log list endpoint, and send a real HTTP request as the non-administrator user.
  6. Assert the API rejects the non-administrator audit log request with an authorization failure such as HTTP 401 or HTTP 403.

- [ ] Administrators can export filtered audit logs to an Excel file suitable for compliance review.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then generate at least two Sprint 11 audit entries from `http://localhost:5173` using unique values that include `Sprint 11 Export <timestamp>`.
  2. Open the audit log page, apply a filter that includes the generated Sprint 11 audit entries and excludes unrelated historical entries.
  3. Click the Excel export action and assert the browser downloads an `.xlsx` file without server errors.
  4. Open the downloaded workbook with a standard spreadsheet reader or script, and assert it contains column headers for timestamp, user, resource, action, source, before value, and after value.
  5. Assert the workbook contains the filtered Sprint 11 audit entries and does not contain entries outside the active filter.
  6. Assert the workbook preserves readable before/after values for compliance review.

---

CONTRACT APPROVED
