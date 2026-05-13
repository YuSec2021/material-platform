## Sprint 21: Brand Update: 智料通 and About Dialog

### Features
- Update frontend i18n app branding from AI物料中台 to 智料通.
- Update app.system copy to 专属于企业的AI物料中台.
- Add a top-bar 关于 button next to the user avatar in MainLayout.
- Show an About modal or alert dialog with name 智料通, version v4.2.0, and description 专属于企业的AI物料中台.
- Restrict implementation to prototype_code/src/ with no backend API changes.

### Success criteria (black-box-verifiable)
- [ ] The application shell shows the new 智料通 brand in the Chinese UI and does not expose the old AI物料中台 name in the visible primary app branding.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173` in a browser and set the app language to Chinese if it is not already Chinese.
  3. Assert the loaded application shell visibly shows `智料通` as the app name.
  4. Assert the visible primary app branding no longer shows `AI物料中台`.

- [ ] The top bar exposes a visible 关于 button next to the user avatar area.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173` in a browser as a seeded administrator.
  3. Locate the top bar user avatar area and assert a visible button labeled `关于` appears next to it.

- [ ] Clicking 关于 opens an About modal or alert dialog with the requested product information.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173` in a browser as a seeded administrator.
  3. Click the visible `关于` button in the top bar.
  4. Assert a modal or alert dialog is visible and contains `名称：智料通`, `版本：v4.2.0`, and `描述：专属于企业的AI物料中台`.

- [ ] The brand update is frontend-only and preserves existing app navigation.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173` in a browser as a seeded administrator.
  3. Navigate to at least two existing sidebar routes, such as `http://localhost:5173/materials` and `http://localhost:5173/system/config`.
  4. Assert each route renders without a blank page, uncaught browser error overlay, or failed navigation caused by the brand update.

---
CONTRACT APPROVED

Sprint: 21
Approved criteria: 4
Notes: All criteria are black-box verifiable via browser mode. Test steps map directly to the configured verification surface (Playwright/browser against localhost:5173). Scope is clean -- frontend-only with no backend changes. No calibration notes needed.