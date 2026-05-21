## Sprint 42: Material Library Permission Isolation (Backend + Frontend)

### Features
- F29-Backend API filtering: `GET /api/v1/material-libraries` automatically filters results to only libraries where the current user has admin role (`material_library_admin_id` matches a role assigned to the user); `super_admin` users bypass the filter and see all libraries.
- F29-Backend material list filtering: `GET /api/v1/materials` automatically filters results to only materials in libraries where the current user has admin role; `super_admin` users bypass the filter.
- F29-Backend material detail APIs verify the material's library is accessible to the current user before returning data and return 403 if inaccessible.
- F29-Backend create/update constraints: `POST`/`PUT /api/v1/materials` and `POST`/`PUT /api/v1/material-libraries` verify the user has admin rights to the target library; non-admins cannot create materials in libraries they do not administer.
- F29-Frontend sidebar filtering: material library navigation entries show only libraries accessible to the current user; `super_admin` sees all entries with a visual indicator.
- F29-Frontend material library list shows only accessible libraries; non-admin users see a filtered list with no indication that other libraries exist.
- F29-Frontend material list pages filter by accessible libraries; if the user has no admin role for any library, show an appropriate empty state.
- F29-Frontend create material flow: the library selection dropdown shows only accessible libraries, and users cannot see or select inaccessible libraries.
- F29-Frontend permission indicators show a badge or icon indicating the user's relationship to the library, such as admin, read-only, or no access where applicable.
- F29-zh-CN and en-US i18n for empty state messages explaining why a user sees no libraries, access denied messages, and library access role labels.
- F29-Remove hardcoded library references or demo data that bypass the permission filter.
- F29-Frontend test coverage: Playwright tests verify that a non-`super_admin` user sees only assigned libraries and cannot access other libraries' data.

### Success criteria (black-box-verifiable)
- [ ] A non-`super_admin` user only receives and sees material libraries assigned through one of their roles, while `super_admin` still sees all libraries.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in as `super_admin`, and use the UI or public API to create two enabled roles named `sprint42-role-allowed-{timestamp}` and `sprint42-role-denied-{timestamp}`.
  3. Assign `sprint42-role-allowed-{timestamp}` to an existing non-`super_admin` user such as `hcm_zhangsan`, and ensure `sprint42-role-denied-{timestamp}` is not assigned to that user.
  4. Create two material libraries at `http://localhost:5173/material/library`: `sprint42-allowed-lib-{timestamp}` with material library admin set to `sprint42-role-allowed-{timestamp}`, and `sprint42-denied-lib-{timestamp}` with material library admin set to `sprint42-role-denied-{timestamp}`.
  5. As `super_admin`, navigate to `http://localhost:5173/material/library` and assert both `sprint42-allowed-lib-{timestamp}` and `sprint42-denied-lib-{timestamp}` are visible in the list.
  6. Sign out, sign in as `hcm_zhangsan`, and navigate to `http://localhost:5173/material/library`.
  7. Assert `sprint42-allowed-lib-{timestamp}` is visible, `sprint42-denied-lib-{timestamp}` is not visible anywhere on the page, and the browser network response from `GET http://localhost:8000/api/v1/material-libraries` contains the allowed library but not the denied library.
  8. Reload `http://localhost:5173/material/library` and assert the filtered visibility remains the same after a fresh page load.

- [ ] Material list, material detail, and sidebar navigation are scoped to accessible material libraries and do not leak inaccessible library names or materials.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using the setup from the previous criterion or equivalent browser-visible setup, create one material in `sprint42-allowed-lib-{timestamp}` named `sprint42-allowed-material-{timestamp}` and one material in `sprint42-denied-lib-{timestamp}` named `sprint42-denied-material-{timestamp}` while signed in as `super_admin`.
  3. Open `http://localhost:5173/login`, sign in as `hcm_zhangsan`, and navigate to `http://localhost:5173/material/list`.
  4. Assert `sprint42-allowed-material-{timestamp}` is visible in the material list and `sprint42-denied-material-{timestamp}` is not visible after searching or filtering by the unique `sprint42` prefix.
  5. Assert the browser network response from `GET http://localhost:8000/api/v1/materials` contains only materials whose material library is accessible to `hcm_zhangsan`.
  6. Inspect the material library entries in the sidebar or material navigation menu and assert `sprint42-allowed-lib-{timestamp}` is shown while `sprint42-denied-lib-{timestamp}` is not shown.
  7. Attempt to open the denied material detail route directly from its known ID or URL and assert the external result is an access-denied state or a 403 response, not a rendered detail page exposing the denied material name.
  8. Sign back in as `super_admin`, navigate to `http://localhost:5173/material/list`, and assert both allowed and denied materials remain visible to the super admin.

- [ ] Create and update flows prevent non-admin users from selecting or mutating inaccessible material libraries.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in as `hcm_zhangsan`, and navigate to `http://localhost:5173/material/list`.
  3. Open the create material flow and expand the material library selector.
  4. Assert the selector includes `sprint42-allowed-lib-{timestamp}` and does not include `sprint42-denied-lib-{timestamp}`.
  5. Create a material named `sprint42-user-created-{timestamp}` in `sprint42-allowed-lib-{timestamp}` and assert the save succeeds with a success toast/message and the new material appears in the list.
  6. In Playwright, attempt a direct black-box request as `hcm_zhangsan` to `POST http://localhost:8000/api/v1/materials` with `material_library_id` set to the denied library's ID and assert the response is 403 or another explicit authorization failure, not 2xx.
  7. Attempt a direct black-box request as `hcm_zhangsan` to `PUT http://localhost:8000/api/v1/material-libraries/{deniedLibraryId}` and assert the response is 403 or another explicit authorization failure, not 2xx.
  8. Return to `http://localhost:5173/material/library` as `hcm_zhangsan` and assert there is no visible edit action for `sprint42-denied-lib-{timestamp}` because that library is not present in the filtered list.

- [ ] Users with no material library scope see an empty state, access-denied text is localized, and permission relationship indicators are visible where applicable.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in as a non-`super_admin` user with no material library admin role, such as `regular_user` if available, and navigate to `http://localhost:5173/material/library`.
  3. Assert the material library list shows an empty state that explains the user has no accessible material libraries, without showing any real library names from other users.
  4. Navigate to `http://localhost:5173/material/list` and assert the material list shows a matching empty state rather than unscoped demo materials.
  5. Switch the top-bar language control to en-US and assert the empty state, access-denied message, and library access role labels are shown in English with no raw i18n keys.
  6. Switch the language back to zh-CN and assert the same empty state, access-denied message, and role labels are shown in Chinese with no raw i18n keys.
  7. Sign in as `super_admin`, navigate to `http://localhost:5173/material/library`, and assert each visible material library row or detail view shows an access relationship indicator such as `管理员`, `只读`, `无权限`, `Admin`, `Read-only`, or `No access` as appropriate.
  8. Sign in again as `hcm_zhangsan`, navigate to `http://localhost:5173/material/library`, and assert accessible libraries show an admin/access indicator while inaccessible library names remain absent.

- [ ] Automated frontend coverage verifies material library permission isolation for non-`super_admin` users.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. From the repository root, run `cd prototype_code && npx playwright test`.
  3. Assert at least one Playwright test file or test case specifically covers Sprint 42 material library permission isolation for a non-`super_admin` user.
  4. Assert that test verifies an assigned library is visible and an unassigned library is hidden for the non-`super_admin` user.
  5. Assert that test verifies inaccessible material data cannot be displayed or selected in the material create/list flow.
  6. Assert the Playwright command exits with status 0.

---
CONTRACT APPROVED
Sprint: 42
Approved criteria: 5
Notes: Criterion 4 step 2 references `regular_user` as a fallback test user. `regular_user` is a backend mock auth only (not a real database user) and cannot sign in through the browser login page. Use `hcm_zhangsan` (seeded in `ensure_hcm_seed_users`) who has no material library admin role assigned as the no-scope test user. All other criteria use `hcm_zhangsan` consistently.
