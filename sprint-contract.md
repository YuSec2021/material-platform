## Sprint 9: Permission System Implementation

### Features
- F15-Feature permission configuration with directory/menu, button/action, and API-level RBAC enforcement.
- Backend: RBAC enforcement on all protected endpoints based on the requesting user's effective feature permissions.
- Frontend: permission-based navigation, page, and action control visibility.
- Material library scoped access control so users can be limited to specific material libraries and cannot read or mutate out-of-scope library data.

### Permission Model Requirements
- A permission configuration is assigned through roles and becomes effective for users bound to those roles.
- Effective permissions are enforced independently by the backend; hiding UI controls is not sufficient.
- Directory/menu permissions control whether a user can navigate to or directly open a feature page.
- Button/action permissions control visible action controls and the corresponding write/export/import/approval API operations.
- API-level permissions control direct HTTP access to documented backend endpoints.
- Material library scope limits both list/detail reads and write operations for material libraries and materials inside those libraries.
- A super-admin or equivalent seeded administrator remains able to configure roles, users, permissions, and scopes for evaluator setup.

### Success criteria (black-box-verifiable)
- [ ] A role's directory/menu permission controls whether bound users can see and open protected frontend modules.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. As a seeded administrator, create or identify a local test user and an enabled test role from `http://localhost:5173/system/users` and `http://localhost:5173/system/roles`.
  3. Configure the test role at `http://localhost:5173/system/roles` with no directory/menu permission for material archives, attribute management, or material library management, then bind the local test user to that role.
  4. Sign in or switch to the local test user through the public login/session surface, then reload `http://localhost:5173`.
  5. Assert the protected module entries for material archives, attribute management, and material library management are absent from visible navigation.
  6. Directly open `http://localhost:5173/materials`, `http://localhost:5173/standard/attributes`, and `http://localhost:5173/material-libraries`; assert each denied page shows an access-denied state, redirects to a safe page, or otherwise prevents viewing protected content.
  7. As the administrator, grant one of those directory/menu permissions to the same role, sign back in as the local test user, reload `http://localhost:5173`, and assert only the granted module becomes visible and openable while the ungranted modules remain unavailable.

- [ ] Button/action permissions control both visible UI actions and the backend operations behind those actions.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then use `http://localhost:5173/system/roles` to create or open a test role with directory access to material library management but without create, edit, delete, import, export, or approval action permissions for that module.
  2. Bind a local test user to the role, sign in as that user, and open `http://localhost:5173/material-libraries`.
  3. Assert the material library page is readable but create, edit, delete, import, export, and approval action controls that the role lacks are hidden or disabled.
  4. Send a real HTTP request as that same user to the documented create material library API path from `http://localhost:8000/openapi.json` and assert the response is `403 Forbidden` or an equivalent authorization failure.
  5. As the administrator, grant the material library create action and matching API permission to the role, sign back in as the local test user, and reload `http://localhost:5173/material-libraries`.
  6. Assert the create control is now visible and can create a uniquely named material library, while still-ungranted edit/delete/import/export/approval controls remain hidden or disabled.
  7. Send the same documented create material library HTTP request as the local test user and assert it succeeds, then send an ungranted edit or delete request and assert it still returns an authorization failure without mutating data.

- [ ] API-level RBAC is enforced across protected backend endpoints and cannot be bypassed with direct HTTP requests.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:8000/openapi.json` and identify protected endpoints for users, roles, permissions, material libraries, materials, attributes, applications, and audit or system configuration where present.
  2. As a seeded administrator, create or identify a local test user with a role that has no API-level permissions except those required for login/session bootstrap.
  3. Authenticate as the local test user through the documented login or session endpoint and retain the browser session or authorization header returned by the public API.
  4. Send direct HTTP requests as that user to at least five protected API endpoints from different modules, including one user/role endpoint, one permission endpoint, one material library endpoint, one material endpoint, and one attribute or application endpoint.
  5. Assert each ungranted request returns `403 Forbidden` or an equivalent authorization failure, and no response leaks protected records beyond the authorization error payload.
  6. As the administrator, grant exactly one of the tested API permissions to the user's role, repeat all tested requests as the local test user, and assert only the newly granted endpoint succeeds while the other ungranted endpoints continue to fail.
  7. Disable the user's role or remove the granted API permission, repeat the previously successful request, and assert it returns an authorization failure after reload or re-authentication.

- [ ] Permission changes are persisted and reflected in both frontend behavior and backend authorization after reload or re-authentication.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173/system/roles` as a seeded administrator.
  2. Configure a test role with a specific combination of one directory/menu permission, one button/action permission, and one API-level permission for material archives, attribute management, or material library management.
  3. Save the role permission configuration, reload `http://localhost:5173/system/roles`, reopen the same role, and assert the exact directory/menu, button/action, and API-level selections remain selected.
  4. Sign in as a user bound to the role and assert the frontend exposes only the granted module/action combination at `http://localhost:5173`.
  5. Send direct HTTP requests as the bound user to one granted and one ungranted API endpoint identified from `http://localhost:8000/openapi.json`; assert the granted request succeeds and the ungranted request fails authorization.
  6. As the administrator, remove the role's action and API permission while leaving the directory/menu permission selected, then sign in again as the bound user or reload the session.
  7. Assert the page remains visible but the removed action control disappears or becomes disabled, and the previously successful direct API request now fails authorization.

- [ ] Material library scope restricts library and material visibility to explicitly assigned scopes.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then as a seeded administrator create or identify two distinct material libraries at `http://localhost:5173/material-libraries`, named for example `Sprint 9 Scope A <timestamp>` and `Sprint 9 Scope B <timestamp>`.
  2. Ensure each library contains at least one externally visible material record through the UI at `http://localhost:5173/materials` or through the documented material API listed in `http://localhost:8000/openapi.json`.
  3. Create or identify a local test user and bind the user to a role with material library read and material read permissions scoped only to `Sprint 9 Scope A <timestamp>`.
  4. Sign in as the scoped user and open `http://localhost:5173/material-libraries`; assert only the Scope A library is visible and Scope B is absent from the list/search results.
  5. Open `http://localhost:5173/materials` as the scoped user and assert visible material rows are limited to Scope A, with no Scope B material names, codes, or library labels present.
  6. Directly request the documented material library detail/list API and material list/detail API for Scope B as the scoped user; assert each response is `403 Forbidden`, `404 Not Found`, or a filtered result that does not expose Scope B data.
  7. As the administrator, add Scope B to the user's material library scope, sign in again as the scoped user, and assert both Scope A and Scope B libraries and their materials become visible through the UI and documented APIs.

- [ ] Material library scoped write permissions prevent out-of-scope mutations even when the user has the matching feature action.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then as a seeded administrator create or identify two distinct material libraries at `http://localhost:5173/material-libraries`.
  2. Configure a local test user with material create/edit action permissions and matching API permissions, but scope the user only to the first material library.
  3. Sign in as the scoped user, open `http://localhost:5173/materials`, and create or edit a material inside the in-scope library; assert the operation succeeds and the changed material is visible after reload.
  4. Attempt to create or edit a material in the out-of-scope library through the UI; assert the out-of-scope library is unavailable in selectors or the operation returns a visible authorization error.
  5. Send a direct HTTP request as the scoped user to create or edit a material in the out-of-scope library using the documented material API from `http://localhost:8000/openapi.json`.
  6. Assert the out-of-scope HTTP mutation returns `403 Forbidden` or an equivalent authorization failure and the out-of-scope library's material list remains unchanged after reload.
  7. As the administrator, add the second library to the user's material library scope, repeat the same create or edit operation as the scoped user, and assert it now succeeds.

---

CONTRACT APPROVED
