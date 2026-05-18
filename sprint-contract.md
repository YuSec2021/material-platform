## Sprint 29: Frontend: Material Library Detail - Code Rule View, Version Management, and Edit

### Features
- Add a material library detail experience reachable from `http://localhost:5173/material/library` with tabs for `基础信息`, `编码规则`, `规则版本`, `物料列表`, `重编码记录`, and `编码映射`.
- In the `编码规则` tab, display the current active rule version with parsed segment visualization, serial number strategy summary, effective time, created_by, and actions for `编辑规则`, `查看历史版本`, and `导出编码映射`.
- In the `规则版本` tab, display a paginated version table with version number, rule name, status badge, effective time, created_by, and change reason; selecting a version shows full segment detail.
- Add an edit rule flow that loads the current rule into the segment builder, allows users to modify/add/remove segments, requires `change_reason`, supports effective modes `仅新增物料生效`, `全部物料重编码`, and `选中物料重编码`, and provides an example-code preview action.
- Implement effective mode behavior: `仅新增物料生效` creates and activates a new version, while `全部物料重编码` and `选中物料重编码` create a draft version and prompt the user to run recode preview.
- Show localized rule version status badges for `草稿`, `启用`, `已停用`, and `启用失败` with visually distinct gray, green, red, and orange states.
- Enforce permissions so only `super_admin` or the material library admin can edit rules; regular users can view detail and rule information read-only.
- Add zh-CN and en-US i18n for the new detail tabs, rule displays, version table, edit form, effective mode labels, validation messages, and action buttons.

### Success criteria (black-box-verifiable)
- [ ] A super_admin can open a material library detail page and navigate all required tabs.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login` in a browser, sign in with username `super_admin` and an empty password, then navigate to `http://localhost:5173/material/library`.
  3. If no automatic-code material library is visible, create one from the UI with a unique name, automatic coding enabled, fixed text segment `S29`, and a serial number segment with length `3`, start `1`, and global scope.
  4. From `http://localhost:5173/material/library`, open the created or existing automatic-code library detail view by clicking its row, detail action, or library name.
  5. Assert the detail view shows the selected library name and tab controls labeled `基础信息`, `编码规则`, `规则版本`, `物料列表`, `重编码记录`, and `编码映射`.
  6. Click each tab and assert the browser remains in the material library detail experience at `http://localhost:5173/material/library` or a nested detail URL under it, with the active tab content changing visibly for each tab.

- [ ] The code rule tab presents the current active rule with parsed segments, serial strategy, metadata, and rule actions.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, and open an automatic-code material library detail view.
  3. Click the `编码规则` tab and assert it shows a current active rule summary containing version `V1` or a current-version indicator, a green enabled/active status, effective time, and created_by information.
  4. Assert the rule segments are displayed as separate ordered visual items rather than one raw JSON block, including labels for fixed text and serial number segments when the library was created with those segments.
  5. Assert the serial number strategy summary includes length, start value, and scope information.
  6. Assert action buttons or links for `编辑规则`, `查看历史版本`, and `导出编码映射` are visible from the `编码规则` tab.
  7. Click `查看历史版本` and assert the active view changes to the `规则版本` tab or an equivalent history view without losing the selected library context.

- [ ] The rule versions tab lists versions with statuses and opens full segment detail.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. In a browser session authenticated as `super_admin`, create or open an automatic-code material library at `http://localhost:5173/material/library`.
  3. Open the library detail view, click `规则版本`, and assert a table or list is visible with columns or labels for version number, rule name, status, effective time, created_by, and change reason.
  4. Assert the active version row displays a localized enabled status badge such as `启用` in green.
  5. Use the browser or Playwright request context to create a draft rule version through `POST http://localhost:8000/api/v1/material-libraries/{library_id}/code-rules/versions` with super_admin authentication, then refresh `http://localhost:5173/material/library` and reopen the same library's `规则版本` tab.
  6. Assert the new draft row appears with a localized `草稿` status badge in gray and its change reason visible in the table.
  7. Click either the active version row or the draft version row and assert a detail drawer, modal, expanded panel, or detail page shows the selected version's full ordered segment configuration.
  8. If the table has more rows than one page, use the pagination control and assert changing pages does not leave the material library detail view.

- [ ] Editing a rule validates required fields, previews generated examples, and applies effective-mode behavior.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, open an automatic-code library detail view, click `编码规则`, and click `编辑规则`.
  3. Assert the edit rule flow loads the current rule into a segment builder with the existing segment values prefilled.
  4. Add or modify a fixed text segment to `EDIT29`, add or keep a serial number segment with length `4`, start `1`, and global scope, then click the preview action and assert an example code containing `EDIT29` and a zero-padded serial value such as `0001` is displayed without saving.
  5. Clear the change reason and attempt to save with effective mode `仅新增物料生效`; assert a visible validation message requires a change reason and no successful save message is shown.
  6. Enter change reason `Sprint 29 new materials only`, select `仅新增物料生效`, save, and assert the UI reports success and returns to a current-rule view showing a newly active version number greater than `V1`.
  7. Reopen `编辑规则`, make another small rule change, enter change reason `Sprint 29 all recode draft`, select `全部物料重编码`, save, and assert the UI prompts for recode preview and shows a draft or pending version rather than immediately replacing the active current rule.
  8. Reopen `编辑规则` again, select `选中物料重编码`, save with a change reason, and assert the UI prompts for selecting materials or running selected-material recode preview before execution.

- [ ] Regular users have read-only access while super_admin users can edit.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, and ensure an automatic-code material library exists.
  3. Assert that a `super_admin` can open the library detail view and see an enabled `编辑规则` action in the `编码规则` tab.
  4. Sign out, open `http://localhost:5173/login`, sign in with username `regular_user` and an empty password, then navigate to `http://localhost:5173/material/library`.
  5. Open the same library detail view and assert the `编码规则` and `规则版本` content is readable.
  6. Assert `编辑规则` and other mutating rule actions are hidden or disabled for `regular_user`.
  7. Attempt to reach the edit rule URL directly if one is exposed under `http://localhost:5173/material/library`; assert the app blocks editing, redirects away, or shows a read-only/permission-denied state.

- [ ] The detail and edit rule UI is localized for zh-CN and en-US and preserves state across language changes.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/material/library`, and open an automatic-code library detail view.
  3. In the default zh-CN view, assert localized labels are visible for `基础信息`, `编码规则`, `规则版本`, `物料列表`, `重编码记录`, `编码映射`, `编辑规则`, `查看历史版本`, `导出编码映射`, `规则名称`, `状态`, `生效时间`, `创建人`, and `变更原因`.
  4. Open `编辑规则`, change a fixed text segment to `LOC29`, enter change reason `Locale preservation`, and select effective mode `仅新增物料生效` without saving.
  5. Use the app language switcher while staying in the edit flow and assert the UI now shows English labels for the detail tabs, edit rule, version history, export code mappings, rule name, status, effective time, created by, change reason, new-materials-only, all-materials recode, selected-materials recode, preview, save, and cancel.
  6. Assert the entered fixed text `LOC29`, change reason `Locale preservation`, and selected effective mode are preserved after the language change.
  7. Clear the change reason in the English view, attempt to save, and assert the validation message is in English; switch back to zh-CN and assert the corresponding validation message is shown in Chinese.

---
CONTRACT APPROVED

Sprint: 29
Approved criteria: 6
Notes: All criteria are browser-verifiable via Playwright MCP at http://localhost:5173. Minor openness in criterion 2 (version format) and criterion 5 ("hidden or disabled") is acceptable since both states are visually distinguishable. Criterion 3 step 39 depends on having a library ID -- this is resolved by running criterion 1's setup flow first.
