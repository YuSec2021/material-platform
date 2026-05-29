# Eval Result -- Sprint 53
Date: 2026-05-25

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 8/10  | >= 7      | PASS   |
| Originality     | 7/10  | >= 6      | PASS   |
| Craft           | 7/10  | >= 7      | PASS   |
| Functionality   | 7/10  | >= 8      | FAIL   |

## Verdict: SPRINT FAIL

## Evidence

### Criterion: /ai/models page renders model card grid with provider and connection status
Result: PASS
Evidence: Playwright navigated to http://localhost:5173/ai/models as super_admin. Page rendered with body text length 15353 chars. Title "模型网关" / "Model Gateway" confirmed in both zh-CN and en-US.
Observation: Page loads correctly with model cards visible.

### Criterion: Super admin can create a model through the create dialog
Result: PASS (spot-check, passed in initial evaluation)
Evidence: Previous eval (Sprint 53 FAIL) confirmed create dialog works end-to-end.
Observation: No changes to create dialog since initial implementation.

### Criterion: Super admin can edit an existing model
Result: PASS (spot-check, passed in initial evaluation)
Evidence: Previous eval confirmed edit dialog pre-populates fields and API key masking works.
Observation: No changes to edit dialog since initial implementation.

### Criterion: Enabled toggles and connection tests are observable without page reload
Result: PASS (spot-check, passed in initial evaluation)
Evidence: Previous eval confirmed toggle and test mutation with optimistic UI updates.
Observation: No changes to toggle/test mutations since initial implementation.

### Criterion: Delete behavior uses confirmation dialog
Result: PASS (spot-check, passed in initial evaluation)
Evidence: Previous eval confirmed delete confirmation dialog with model name and constraint blocking.
Observation: No changes to delete dialog since initial implementation.

### Criterion: zh-CN and en-US localization covers the full Model Gateway workflow
Result: FAIL
Evidence:
- zh-CN: `modelGateway.provider.mock` renders as literal text on 39+ model cards (all with `provider="mock"` from the backend). Counted via Playwright: `page.textContent("body").includes("modelGateway.provider.mock")` = true.
- en-US: Same broken key `modelGateway.provider.mock` renders as literal text.
- Root cause in i18n.ts:
  - zh-CN `modelGateway` has two duplicate `provider:` keys (lines 162-171 and 173-182). JavaScript object literal uses the last value, so the second `provider` (without `mock`) overwrites the first (with `mock`).
  - en-US `modelGateway.provider` (lines 922-931) does not include `mock`.
  - The `ModelCard` component (line 469) calls `t('modelGateway.provider.${model.provider}')` for provider badge labels. The backend has 39 models with `provider="mock"`, causing the broken key to appear 40 times on the page.

Observation: The retry fix (372c37d) added `mock` to the first `provider` object in zh-CN, but the second `provider` object overwrites it. The `mock` key remains absent from the effective zh-CN `modelGateway.provider` object. en-US `provider` also lacks `mock`.

### Criterion: The page respects existing role restrictions for model management
Result: PASS
Evidence:
- Playwright logged in as `regular_user` (`is_super_admin: false` from backend), navigated to `/ai/models`.
- Final URL: `http://localhost:5173/` (redirected away from `/ai/models`).
- Page body does not contain "模型网关" or "Model Gateway".
- Backend returned 403 Forbidden for the API request.
- Code review of `routes.tsx` confirms `/ai/models` is nested inside `SuperAdminRoute` (lines 111-112), and `SuperAdminRoute` redirects to `/` when `!auth.user?.is_super_admin`.
- Super admin (`super_admin`) successfully accesses `/ai/models` with full controls visible.
- 2 console errors: `403 Forbidden` - expected, backend blocks non-admin API access.

Observation: SuperAdminRoute correctly restricts `/ai/models` to super_admin users. Non-super-admin users are redirected to `/`.

## Required fixes

1. **zh-CN: Fix duplicate `provider` key in `modelGateway`**: The second `provider` object at i18n.ts line 173-182 must include `mock: "Mock Provider"` added to it. The first `provider` (lines 162-171) is shadowed by the second and can be removed. Alternatively, remove the second `provider` object entirely and keep only the first (which already has `mock`).

2. **en-US: Add `mock` to nested `provider` object**: In `modelGateway.provider` at i18n.ts line 922-931, add `mock: "Mock Provider"` to the nested provider object so the badge renders correctly for mock models.

3. **Verification**: After fixing, reload the page in zh-CN and en-US. The 40 instances of `modelGateway.provider.mock` on the page should be replaced with "Mock Provider" text.

## Scope violations
None. The retry commit (372c37d) only touches i18n.ts and routes.tsx, both within sprint scope.
