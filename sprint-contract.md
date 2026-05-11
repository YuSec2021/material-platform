## Sprint 8: User Management and HCM Synchronization

### Features
- F14-User management (HCM sync view + local user CRUD)
- F14-Frontend: user list with department/unit filtering
- F14-HCM-synced users are visible as externally owned, read-only user records
- F14-Local users can be added, edited, password-reset, and deleted from the user management surface
- F14-User records expose account ownership so evaluators can distinguish HCM-synced accounts from local accounts
- F15-Role management (CRUD, enable/disable, user binding)
- F15-Role-user binding from the role management surface and from user detail where exposed
- F15-Feature permission configuration for roles, covering visible directory/menu permissions, button/action permissions, and API permission entries for material archives, attribute management, and material library modules
- Backend: user, role, role-user binding, and role permission APIs are documented and enforce validation independently of source-code inspection

### User Management Fields
A user record contains:
- `id` (integer or stable string identifier)
- `username` (unique login/account name)
- `display_name` or real name
- `unit` (business unit)
- `department`
- `team`
- `email` or contact field when exposed by the UI/API
- `account_owner` or equivalent ownership/source value (for example `HCM` / `local`)
- `status` (for example `active`, `disabled`, or equivalent user-facing state)
- `roles` or visible role binding summary
- `created_at`, `updated_at` timestamps when returned by the API

An HCM-synced user contains:
- visible ownership/source indicating the account is managed by HCM
- unit, department, team, username, and display name populated from the HCM sync dataset
- disabled or unavailable edit/delete/password-reset controls, or a visible validation error when those local-only actions are attempted

A local user contains:
- ownership/source indicating the account is local
- required username and display name
- editable unit, department, team, contact, and status fields where exposed
- password reset action with a visible success result or a returned temporary credential / reset token
- delete action with confirmation and clear success/failure feedback

### Role Management Fields
A role record contains:
- `id` (integer or stable string identifier)
- `name` (unique role name)
- `code` (stable role code when exposed)
- `description`
- `enabled` or visible enabled/disabled status
- `users` or visible bound user count/list
- `permissions` grouped by module, directory/menu, button/action, and API entries where exposed
- `created_at`, `updated_at` timestamps when returned by the API

A role permission configuration contains:
- at least one directory/menu permission entry for material archives, attribute management, or material library modules
- at least one button/action permission entry such as create, edit, delete, approve, export, import, or reset password where exposed
- at least one API permission entry or endpoint-level permission identifier visible through UI detail or API response
- persisted selections that remain visible after saving and reloading the role detail page

### Success criteria (black-box-verifiable)
- [ ] The user management page displays HCM-synced users, account ownership, and unit/department/team filters without requiring source-code inspection.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173` in a browser.
  2. Open the user management page from visible system administration navigation or directly at `http://localhost:5173/system/users`.
  3. Assert the user list displays at least one HCM-owned user row with visible ID or username, display name, unit, department, team, and account ownership/source.
  4. Use the unit filter with a visible unit value from an HCM user row and assert every returned row shows the selected unit.
  5. Use the department filter with a visible department value from an HCM user row and assert every returned row shows the selected department.
  6. Use the team filter or combined unit/department filters where available and assert the result count and visible rows update without a page error.
  7. Open an HCM-owned user detail or edit action and assert HCM-managed fields are read-only, local-only destructive actions are unavailable, or the UI displays a validation error explaining that HCM-owned users cannot be locally edited/deleted.

- [ ] A system administrator can create, edit, reset the password for, and delete a local user while HCM ownership remains distinct from local ownership.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173/system/users` in a browser.
  2. Create a unique local user such as `s8_local_user_<timestamp>` with display name `Sprint 8 Local User`, unit `测试单位A`, department `测试部门A`, team `测试班组A`, and any required contact/status fields.
  3. Assert the new user appears in the user list with ownership/source shown as local rather than HCM.
  4. Edit the local user display name, department, or team, save the change, reload `http://localhost:5173/system/users`, search for the unique username, and assert the edited values persist.
  5. Trigger password reset for the local user, confirm the action, and assert the UI shows a reset success message, temporary password, reset token, or equivalent externally visible reset result.
  6. Delete the local user through the UI confirmation flow and assert the user no longer appears in search results after reloading the user list.
  7. Attempt the same edit, reset, or delete action on an HCM-owned user and assert the action is disabled or returns a visible validation error instead of mutating the HCM-owned row.

- [ ] Role management supports role CRUD, uniqueness validation, and enable/disable state that is visible in lists and details.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open the role management page from visible system administration navigation or directly at `http://localhost:5173/system/roles`.
  2. Create a unique role such as `Sprint 8 Role <timestamp>` with code `S8_ROLE_<timestamp>` and description `Sprint 8 role management verification`.
  3. Assert the role appears in the role list with visible name, code where exposed, description, enabled status, and bound-user count or equivalent user-binding summary.
  4. Edit the role name or description, save the change, reload `http://localhost:5173/system/roles`, and assert the updated values persist.
  5. Attempt to create another role with the same name or code and assert the UI or API returns a visible uniqueness validation error.
  6. Disable the role and assert the role list/detail shows disabled status and that disabled status persists after reload.
  7. Re-enable the role and assert the role list/detail shows enabled status again and the role can be selected in role-user binding controls.

- [ ] Role-user binding lets an administrator assign and remove users from a role, and the binding is visible from both role and user management surfaces or documented APIs.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then create or locate a local user at `http://localhost:5173/system/users` and create or locate an enabled role at `http://localhost:5173/system/roles`.
  2. Open the role detail or role-user binding panel for the enabled role.
  3. Add the local user to the role, save the binding, reload the role detail page, and assert the user appears in the role's bound user list or bound user count.
  4. Open the user detail page or user list role summary for that same local user and assert the role name is visible for the user, or send a documented HTTP request to the user detail/list API and assert the JSON response includes the assigned role.
  5. Remove the user from the role, save the binding, reload the role detail page, and assert the user no longer appears in the role's bound user list.
  6. Attempt to bind a disabled role to a user and assert the role is unavailable in selection controls or the API returns a 4xx validation error.
  7. Attempt to bind a nonexistent user or nonexistent role through the documented API and assert the response is a 4xx error without creating a partial binding.

- [ ] Feature permission configuration persists directory/menu, button/action, and API-level permissions for roles.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:5173/system/roles` in a browser.
  2. Create or open an enabled role dedicated to Sprint 8 permission verification.
  3. Open that role's permission configuration screen from the role list or detail page.
  4. Select at least one visible directory/menu permission for material archives, attribute management, or material library modules.
  5. Select at least one visible button/action permission such as create, edit, delete, import, export, approve, or reset password where exposed.
  6. Select at least one visible API-level permission or endpoint-level permission entry for a material archive, attribute management, or material library API.
  7. Save the permission configuration, reload the role detail or permission page, and assert the same directory/menu, button/action, and API-level selections remain selected.
  8. Remove one saved permission, save again, reload the page, and assert the removed permission is no longer selected while the remaining permissions are preserved.

- [ ] User, role, binding, and permission APIs are documented and enforce the same validation rules through black-box HTTP requests.
  Evaluator steps:
  1. Start the system with `bash init.sh`, then open `http://localhost:8000/openapi.json` in a browser.
  2. Assert the OpenAPI document lists endpoints for user listing, local user create/update/delete, password reset, role create/update/delete or enable-disable, role-user binding, and role permission configuration under paths such as `/api/v1/users`, `/api/v1/roles`, `/api/v1/roles/{id}/users`, and `/api/v1/roles/{id}/permissions`.
  3. Send a real HTTP request to list users with unit and department query filters and assert the JSON response contains only matching users and includes account ownership/source fields.
  4. Send real HTTP requests to create, update, reset password for, and delete a unique local user; assert each successful response contains the expected externally visible user or reset result, and the deleted user is absent from a subsequent list/search response.
  5. Send a real HTTP request attempting to update or delete an HCM-owned user and assert the API returns a 4xx response with a clear ownership or HCM-managed validation error.
  6. Send real HTTP requests to create a unique role, disable it, re-enable it, bind a user, unbind the user, and assert each list/detail response reflects the persisted state.
  7. Send a real HTTP request saving role permissions with directory/menu, button/action, and API permission entries; then fetch the role permission detail and assert all saved permission entries are returned.
  8. Send invalid requests such as duplicate role name/code, binding a disabled role, binding a nonexistent user, or saving unknown permission identifiers, and assert each returns a 4xx response without mutating persisted role, user, or permission state.

---

CONTRACT APPROVED
