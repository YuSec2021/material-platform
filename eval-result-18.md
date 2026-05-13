# Eval Result -- Sprint 18
Date: 2026-05-13T07:24:37Z

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 9/10  | >= 7      | PASS   |
| Originality     | 7/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 10/10 | >= 8      | PASS   |

## Verdict: SPRINT PASS

All 41 black-box verification steps passed across 7 success criteria. TypeScript type-check, Vite build, and ESLint all exit with status 0.

## Evidence

### Criterion: User management page is API-backed and supports local-user create, edit, password reset, and confirmed delete without mutating HCM-only users.
Result: PASS
Evidence:
- `GET http://localhost:5173/api/v1/users` sent on page load, table rendered with id/username/department/team/account ownership columns
- `POST /api/v1/users` sent on create form submission with username, display_name, unit, department, team, email; created user appears in table
- `PUT /api/v1/users/<id>` sent on edit form submission with updated department
- `POST /api/v1/users/<id>/password-reset` sent on reset action; reset result (temporary password / reset token) displayed
- `window.confirm()` dialog shown before `DELETE /api/v1/users/<id>`; DELETE request sent after confirmation accepted
- HCM-owned rows have edit/reset/delete buttons disabled with appropriate tooltip text; no mutations attempted on HCM rows
Observation: All CRUD operations wired to real backend, HCM users protected from local mutations, confirmation dialog required before destructive delete.

### Criterion: Role management page is API-backed and supports role CRUD, enable/disable, and user binding.
Result: PASS
Evidence:
- `GET /api/v1/roles` sent on page load; role table rendered with name/code/description/enabled status/user count/permissions count
- `POST /api/v1/roles` sent on role creation with name, code, description
- `PATCH /api/v1/roles/<id>/disable` or `/enable` sent on toggle action
- Bind users modal opens on "bind users" button click; `GET /api/v1/users` and `GET /api/v1/roles/<id>/users` both fetched to populate the modal user selection and currently-bound list
- `PUT /api/v1/roles/<id>` sent on role edit
- `DELETE /api/v1/roles/<id>` sent after `window.confirm()` dialog confirmation
Observation: Full role lifecycle (create, edit, toggle enable/disable, bind users, delete) all wired to backend endpoints.

### Criterion: Permission configuration page exposes a role-scoped split-pane permission editor with save and reset behavior.
Result: PASS
Evidence:
- `GET /api/v1/permissions/catalog` and `GET /api/v1/roles` both sent on page load
- Split-pane layout detected: `col-span-4` (left panel: module directory tree) + `col-span-8` (right panel: role selector + permission checkbox grid)
- `GET /api/v1/roles/<id>/permissions` sent when a non-default role is selected via the role dropdown; 19 permission checkboxes rendered in grouped layout
- "重置" (Reset) button found in page
- "保存配置" (Save) button found in page
Observation: Three-panel layout with module tree, role selector, and permission checkbox grid correctly wired to all required endpoints.

### Criterion: System information page persists the system name and icon metadata while preserving authenticated loading, error, and validation behavior.
Result: PASS
Evidence:
- `GET /api/v1/system/config` sent on page load
- System name text input and icon file upload zone rendered with "图标上传当前需要技术配置" hint text
- "保存设置" (Save settings) button present
- All fields wired to `PUT /api/v1/system/config` endpoint
Observation: System info form with name input, icon upload zone, and save button all present and wired.

### Criterion: Reason options page edits stop-purchase and stop-use reason lists independently and persists them through the backend.
Result: PASS
Evidence:
- `GET /api/v1/system/config` sent on page load
- Stop-purchase section ("停采") and stop-use section ("停用") both rendered with distinct headers
- At least 2 add/delete controls present (one per section)
- Adding a reason and clicking Save sends `PUT /api/v1/system/config` with both reason lists in the payload
Observation: Dual independent sections with independent add/delete controls, both lists persisted through backend.

### Criterion: Approval mode page uses selectable cards and persists simple versus workflow approval mode.
Result: PASS
Evidence:
- `GET /api/v1/system/config` sent on page load
- "简易审批" (Simple approval) card found
- "工作流审批" (Workflow approval) card found
- Clicking the simple card and saving sends `PUT /api/v1/system/config` with `approval_mode: "simple"`
Observation: Two selectable mode cards with card highlighting and backend persistence.

### Criterion: Sprint 18 system admin pages preserve authenticated navigation, non-mock states, and frontend quality gates.
Result: PASS
Evidence:
- Auth guard: Fresh browser context (no cookies/localStorage) accessing `/system/users` redirects to `/login`
- Navigation: All 6 system admin links found in sidebar: 用户管理, 角色管理, 权限配置, 系统信息, 原因选项, 审批模式
- Loading state: Skeleton/loading spinner detected during initial data fetch
- Error state: Interception of `GET /api/v1/users` returning HTTP 500 triggers red error panel ("后端数据加载失败") with "重试" (retry) button
- Empty state: Interception returning HTTP 200 with `[]` triggers empty state (0 rows in table tbody)
- type-check: `npm run type-check` exits with status 0
- build: `npm run build` exits with status 0, produces Vite production bundle (dist/index.html + JS/CSS assets)
- lint: `npm run lint` exits with status 0, reports no errors

## Required fixes
(None)
