## Sprint 23: AI Management UI: Model Gateway and Capability Mapping

### Features
- Add a super_admin-only AI管理 navigation module with routes for model providers, capability mappings, and token usage statistics.
- Implement /ai/providers frontend CRUD for ModelConfig fields including display name, provider, model_name, base_url, API key password input, timeout, enabled state, connection status, and test connection actions.
- Implement /ai/capability-mappings UI for configuring primary and fallback models for material_add, material_match, category_match, material_analysis, attr_recommend, and material_governance.
- Implement /ai/token-usage as a simple statistics dashboard aggregating call count, capability distribution, and model distribution from existing /api/v1/debug/trace data.
- Restrict AI management navigation and routes to super_admin users, redirecting non-super_admin users to the home page.
- Follow existing shadcn-ui layout and zh-CN/en-US i18n patterns, with status badges for ok, error, and untested connection states.
- Restrict implementation to frontend code under prototype_code/src/ with no backend API changes.

### Success criteria (black-box-verifiable)
- [ ] A seeded super_admin can access the AI管理 module and open all three AI management pages.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173` in a browser as a seeded super_admin user.
  3. Assert the sidebar or primary navigation contains an `AI管理` module entry.
  4. Navigate to `http://localhost:5173/ai/providers` and assert the page renders a model provider management view with a title, operation/search area, and data table.
  5. Navigate to `http://localhost:5173/ai/capability-mappings` and assert the page renders mapping controls for AI capability domains.
  6. Navigate to `http://localhost:5173/ai/token-usage` and assert the page renders a token or call usage statistics dashboard.

- [ ] The model provider management page supports visible frontend CRUD and connection-test workflows against the existing provider APIs.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/ai/providers` in a browser as a seeded super_admin user.
  3. Click the create provider action and assert a dialog or form appears with fields for display name, provider, model name, base URL, API key, timeout, enabled state, and connection status or test action.
  4. Assert the API key input uses password masking while editing.
  5. Submit a valid provider using visible form controls and assert the created provider appears in the table.
  6. Reopen the created provider and assert the saved API key is displayed in masked form such as `**...**`, not as the raw entered secret.
  7. Click the provider test connection action and assert the connection status badge visibly changes or reports an ok, error, or untested state without a blank page or uncaught browser error.

- [ ] The capability mapping page lets a seeded super_admin configure primary and fallback models for all six AI capability domains.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/ai/capability-mappings` in a browser as a seeded super_admin user.
  3. Assert the page lists or otherwise exposes controls for `material_add`, `material_match`, `category_match`, `material_analysis`, `attr_recommend`, and `material_governance`.
  4. Select a primary model and a fallback model for at least one capability using visible controls.
  5. Save the mapping changes.
  6. Reload `http://localhost:5173/ai/capability-mappings` and assert the saved primary and fallback selections remain visible.

- [ ] The token usage page aggregates trace data into visible call, capability, and model summaries.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/ai/token-usage` in a browser as a seeded super_admin user.
  3. Assert the page shows a recent call count summary derived from existing trace data.
  4. Assert the page shows a capability distribution summary using trace capability names where trace data is available.
  5. Assert the page shows a model distribution summary using trace model names where trace data is available.
  6. Assert the page remains readable and renders an empty state instead of failing when no trace rows are available.

- [ ] AI management navigation and routes are restricted to super_admin users.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173` in a browser as a seeded non-super_admin user.
  3. Assert the navigation does not show the `AI管理` module entry.
  4. Navigate directly to `http://localhost:5173/ai/providers`.
  5. Assert the app redirects to `http://localhost:5173` or another home route rather than rendering the provider management page.
  6. Repeat direct navigation to `http://localhost:5173/ai/capability-mappings` and `http://localhost:5173/ai/token-usage`, asserting both routes are blocked for the non-super_admin user.

- [ ] The sprint is frontend-only and preserves existing app localization behavior.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/ai/providers` in a browser as a seeded super_admin user using zh-CN locale and assert the AI management labels render in Chinese.
  3. Switch the app to en-US using the existing language control or local app setting.
  4. Assert the AI management navigation label, page titles, and primary actions render in English.
  5. Navigate to an existing route such as `http://localhost:5173/system/info` and assert it still renders without a blank page, uncaught browser error overlay, or failed navigation.

---
CONTRACT APPROVED

Sprint: 23
Approved criteria: 6
Notes: Criterion 6 step 5 route reference corrected from system/config to system/info, matching the actual route in routes.tsx. All six criteria are browser-verifiable with concrete URLs and observable assertions.
