## Sprint 25: Frontend Rule Engine UI: Management Pages with i18n and Access Control

### Features
- Add a Rule Engine navigation entry (`规则引擎` / `Rule Engine`) in the sidebar, positioned after AI管理 when AI管理 is visible, using a Shield or Cog-style icon consistent with the existing layout.
- Add `/rules/categories` showing all six rule categories with icon, localized display name, localized description, and rule count badge; selecting a category navigates to `/rules` filtered by that category.
- Add `/rules` showing a data table of rules with columns for name, category, pattern/value preview, priority, enabled state, and actions; support category filtering, search by name/pattern, and pagination.
- Add an inline enabled/disabled switch in the rule list that calls `PATCH /api/v1/rules/:id/toggle`; it is usable only by super_admin users.
- Add `/rules/new` create form with category select, name, description, pattern, value, options, priority, and enabled fields, including required-field validation.
- Add `/rules/:id/edit` edit form pre-populated from `GET /api/v1/rules/:id`, with the same layout and validation as create.
- Restrict create, edit, delete, and toggle actions to super_admin users; regular users can view category and rule list pages in read-only mode without action buttons or enabled switches.
- Add zh-CN and en-US i18n for module name, page titles, table column headers, form labels, validation messages, toast notifications, and empty states.
- Show a confirmation dialog before rule deletion, including the rule name in the dialog text.

### Success criteria (black-box-verifiable)
- [ ] Super_admin users can discover and open the Rule Engine module from the sidebar.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login` in a browser, enter username `super_admin`, submit the login form, and wait for the app shell to render.
  3. Assert the sidebar contains the `规则引擎` navigation entry, or `Rule Engine` after switching language to English.
  4. Assert the Rule Engine navigation entry appears after `AI管理` / `AI Management` when the AI Management section is visible for the super_admin user.
  5. Click the Rule Engine categories navigation target, or directly open `http://localhost:5173/rules/categories`, and assert the final URL is `http://localhost:5173/rules/categories`.
  6. Assert the page renders a localized title for the rule category list and does not show a Vite error overlay or blank page.

- [ ] The category list page displays all six backend rule categories and links into the filtered rule list.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Log in at `http://localhost:5173/login` as `super_admin`.
  3. Open `http://localhost:5173/rules/categories` and wait for the browser to complete `GET http://localhost:8000/api/v1/rules/categories`.
  4. Assert the page shows exactly the six category slugs or localized category names corresponding to `unit_normalization`, `brand_alias`, `title_cleaning`, `enum_validation`, `required_field_check`, and `blackwhite_list`.
  5. Assert each category item shows an icon or visual category marker, a localized display name, a localized description, and a numeric rule count badge.
  6. Click the `unit_normalization` category item and assert the browser navigates to `http://localhost:5173/rules` with a category filter applied in the URL query string or selected filter control.
  7. Assert the filtered rule list completes `GET http://localhost:8000/api/v1/rules` with a `category_id` query parameter.

- [ ] The rule list page supports table display, search, category filtering, pagination, and super_admin toggle.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Log in at `http://localhost:5173/login` as `super_admin`.
  3. Open `http://localhost:5173/rules` and wait for `GET http://localhost:8000/api/v1/rules?page=1` or an equivalent paginated rules request.
  4. Assert the rule list renders table headers for name, category, pattern or value preview, priority, enabled state, and actions.
  5. Use the category filter to select one category and assert the browser sends `GET http://localhost:8000/api/v1/rules` with a `category_id` query parameter.
  6. Enter a search term matching a seeded rule pattern or name, assert the browser sends `GET http://localhost:8000/api/v1/rules` with a `search` query parameter, and assert the table updates without losing the page shell.
  7. Change page or page size using the pagination control and assert the browser sends `GET http://localhost:8000/api/v1/rules` with updated pagination query parameters.
  8. Toggle an enabled switch for a visible rule and assert the browser sends `PATCH http://localhost:8000/api/v1/rules/<rule_id>/toggle`, then assert the visible enabled state changes or a localized success toast appears.

- [ ] Super_admin users can create, edit, and delete rules through browser forms.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Log in at `http://localhost:5173/login` as `super_admin`.
  3. Open `http://localhost:5173/rules/new` and assert the form shows controls for category, name, description, pattern, value, options, priority, and enabled.
  4. Submit the empty form and assert localized required-field validation messages appear without sending `POST http://localhost:8000/api/v1/rules`.
  5. Fill the form with a unique rule name such as `Eval UI Rule <timestamp>`, select an existing category, provide pattern, value, valid options content, priority, and enabled state, then submit.
  6. Assert the browser sends `POST http://localhost:8000/api/v1/rules`, shows a localized success toast or navigates back to the rule list, and the created rule is visible after searching by the unique name.
  7. Open the created rule's edit action or directly open `http://localhost:5173/rules/<created_rule_id>/edit`; assert the page completes `GET http://localhost:8000/api/v1/rules/<created_rule_id>` and pre-populates the form with the created values.
  8. Change the description, value, priority, or enabled state, submit the form, and assert the browser sends `PUT http://localhost:8000/api/v1/rules/<created_rule_id>` and displays the updated values after returning to the list or detail view.
  9. Click the created rule's delete action, assert a confirmation dialog appears and includes `Eval UI Rule` in the dialog text, confirm deletion, and assert the browser sends `DELETE http://localhost:8000/api/v1/rules/<created_rule_id>`.
  10. Search for the unique rule name again and assert the deleted rule is no longer shown, or that the table displays a localized empty state.

- [ ] Regular users can view rule data but cannot perform super_admin-only actions.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, enter username `hcm_zhangsan`, submit the login form, and wait for the app shell to render as a non-super_admin user.
  3. Open `http://localhost:5173/rules/categories` and assert the category list loads with category names and rule count badges.
  4. Open `http://localhost:5173/rules` and assert the rule list table loads rule names, categories, pattern/value previews, priorities, and enabled states.
  5. Assert the regular-user rule list does not show create, edit, delete, or enabled toggle controls.
  6. Directly open `http://localhost:5173/rules/new` and assert the user is redirected away from the create form, or shown an access-denied state without a submittable create form.
  7. If a rule id is visible from the list request, directly open `http://localhost:5173/rules/<visible_rule_id>/edit` and assert the user is redirected away from the edit form, or shown an access-denied state without a submittable edit form.

- [ ] zh-CN and en-US translations are complete for the Rule Engine UI without regressing existing routes.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. In a fresh browser context, set the persisted language to `zh-CN`, open `http://localhost:5173/login`, and log in as `super_admin`.
  3. Open `http://localhost:5173/rules/categories`, `http://localhost:5173/rules`, and `http://localhost:5173/rules/new`; assert visible module names, page titles, table headers, form labels, validation messages, buttons, toast messages, confirmation text, and empty states are Chinese where shown.
  4. In a fresh browser context, set the persisted language to `en-US`, open `http://localhost:5173/login`, and log in as `super_admin`.
  5. Open `http://localhost:5173/rules/categories`, `http://localhost:5173/rules`, and `http://localhost:5173/rules/new`; assert visible module names, page titles, table headers, form labels, validation messages, buttons, toast messages, confirmation text, and empty states are English where shown.
  6. Open `http://localhost:5173/system/info` and `http://localhost:5173/ai/providers` as `super_admin` after the language switch and assert both existing routes still render without a blank page or Vite error overlay.

---
CONTRACT APPROVED

Sprint: 25
Approved criteria: 6
Notes: All criteria are concrete and browser-testable via Playwright. Access control tested for both super_admin and regular user (hcm_zhangsan). All six rule categories explicitly enumerated. i18n verified in both zh-CN and en-US with regression check on existing routes. Delete confirmation dialog verified with rule name assertion. All four routes covered across multiple criteria.
