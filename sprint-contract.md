## Sprint 62: 前端全站 shadcn/ui 组件体系统一

CONTRACT APPROVED

### Features
- Establish a shadcn-managed Tailwind CSS 4 and Radix design system with `components.json`, new-york styling, CSS variables, Lucide icons, stable aliases, and preserved brand themes.
- Migrate shared UI compatibility layers, application layout, login, and dashboard to shadcn primitives while preserving existing public props, routes, APIs, and business behavior.
- Migrate the standard-management work package without changing category virtualization, lazy loading, import, CRUD, or category-attribute behavior.
- Migrate the material-management work package without changing permissions, lifecycle, AI material flows, coding rules, recode execution/rollback, import, or export behavior.
- Migrate application-workflow and system-management pages without changing approval transitions, RBAC, file uploads, or configuration behavior.
- Migrate AI management, rule engine, and development trace pages without changing model, capability mapping, token chart, rule evaluation, or trace behavior.
- Replace browser-native confirmation flows and hard-coded state colors with accessible shadcn interactions and semantic light/dark theme tokens.
- Add focused regression coverage and keep build, application type-check, lint, Docker frontend image build, and representative Playwright workflows green without weakening tests.

### Success criteria (black-box-verifiable)
- [ ] The application shell and shared interaction patterns render consistently in light and dark themes, and dialogs provide accessible keyboard behavior.
  Evaluator steps:
  1. Start the system with `bash init.sh`, open `http://localhost:5173/login`, sign in as `super_admin`, and assert navigation reaches `http://localhost:5173/`.
  2. Toggle the theme from the header and assert the document switches between light and dark presentation while the sidebar, header, dashboard cards, text, borders, and status indicators remain visibly readable.
  3. Open the About dialog from `http://localhost:5173/`, assert an element with role `dialog` is visible, press Tab to verify focus stays within the dialog, press Escape, and assert focus returns to the About trigger.
  4. At a 390x844 viewport, open the mobile navigation sheet, follow a navigation item, and assert the selected page renders without horizontal page overflow.

- [ ] Standard-management pages retain their existing CRUD, category-tree, import, and category-attribute behavior through consistent accessible controls.
  Evaluator steps:
  1. Open `http://localhost:5173/standard/category`, expand and collapse a category node, select two different categories, and assert the category content and single attributes panel follow the current selection.
  2. On `http://localhost:5173/standard/category`, open an add/edit dialog, assert labeled form controls and Cancel/Save buttons are keyboard reachable, then close it with Escape without changing data.
  3. Open `http://localhost:5173/standard/brand`, create or edit a uniquely named brand, assert a success notification and updated table row, then invoke delete and assert an accessible confirmation dialog appears before deletion.
  4. Open the category import flow at `http://localhost:5173/standard/category`, provide an unsupported file, and assert a visible error appears without creating categories.

- [ ] Material-management pages retain material-library permissions, material lifecycle, AI flows, code rules, and recode confirmation order.
  Evaluator steps:
  1. Open `http://localhost:5173/material/library`, create or edit a uniquely named material library, select its administrators and category libraries, save, and assert the visible row reflects the selections.
  2. Open a material-library detail view from `http://localhost:5173/material/library`, switch across its tabs, open the coding-rule editor and recode preview, and assert each surface uses a visible dialog or tab panel without losing the selected library.
  3. From `http://localhost:5173/materials`, open the material create/edit flow and the AI material flow, assert labeled fields and validation messages remain usable, and cancel without changing data.
  4. Invoke a destructive or recode action and assert a confirmation dialog appears before execution and that cancel leaves the material state unchanged.

- [ ] Application-workflow and system-management pages preserve approval state transitions and RBAC while using consistent form and confirmation interactions.
  Evaluator steps:
  1. Open `http://localhost:5173/application/category`, create or open an application, and assert its status, form content, timeline, and available actions match its current workflow state.
  2. Invoke an approval, rejection, deletion, disable, or password-reset action from an applicable workflow or system page and assert a role `dialog` confirmation is shown instead of a browser-native confirmation prompt; cancel and assert no state changes.
  3. Open `http://localhost:5173/system/users`, `http://localhost:5173/system/roles`, and `http://localhost:5173/system/permissions`, and assert the visible tables/forms remain operable with labeled controls and permission switches.
  4. Sign in as a non-super-admin user and assert super-admin-only navigation and mutation controls remain unavailable.

- [ ] AI management, rule engine, and development trace surfaces retain their existing data, forms, charts, and restricted behavior.
  Evaluator steps:
  1. As `super_admin`, open `http://localhost:5173/ai/models`, open a model create/edit dialog, verify provider, model, endpoint, secret, enabled, and advanced controls remain labeled and usable, then cancel without saving.
  2. Open `http://localhost:5173/ai/capability-mappings`, edit a mapping, verify primary and fallback model selections prevent an invalid duplicate selection, cancel, and assert the displayed mapping is unchanged.
  3. Open `http://localhost:5173/ai/token-usage` and assert cards, tables, chart labels, and status indicators remain readable in both light and dark themes.
  4. Start the system with `AI_DEBUG=true bash init.sh`, sign in as `super_admin`, open `http://localhost:5173/rules`, enter a unique nonexistent term in the rule search field, and assert the table shows no matching result; then open `http://localhost:5173/debug/trace`, set both date fields to `2099-01-01`, apply the filter, and assert the visible trace count is `0 traces` and the empty-state text is shown.

- [ ] Reusable controls expose consistent semantic states and no browser-native confirmation blocks representative business workflows.
  Evaluator steps:
  1. Across `http://localhost:5173/standard/brand`, `http://localhost:5173/material/library`, `http://localhost:5173/application/category`, `http://localhost:5173/system/users`, and `http://localhost:5173/ai/models`, assert each primary create action is exposed as an enabled button with an accessible name, each destructive action is exposed as a destructive button or menu item with an accessible name, unavailable actions expose the native `disabled` or `aria-disabled=true` state, pending actions expose `aria-busy=true`, and success/warning/error results expose visible text in a status, badge, alert, or notification element.
  2. Register a browser dialog listener, invoke representative delete/disable/destructive actions on those pages, and assert no native `confirm` dialog event occurs while an in-page role `dialog` confirmation is rendered.
  3. Use keyboard-only Tab, Shift+Tab, Enter, Space, and Escape on representative dialogs, selects, switches, and buttons, and assert focus remains visible and the expected interaction completes.

- [ ] The unified frontend passes its external build, CLI, container, and browser regression gates.
  Evaluator steps:
  1. From the repository root run `cd frontend && npm run build`, `npm run type-check`, and `npm run lint`; assert every command exits with code 0.
  2. From the repository root run `docker compose config --quiet` and `docker compose build frontend`; assert both exit with code 0.
  3. Run the focused Sprint 62 Playwright suite against `http://localhost:5173` and assert the application-shell, standard, material, workflow/system, AI/rules, theme, keyboard, and confirmation scenarios all pass.
  4. From the repository root run `cd frontend && npm run bundle:check`; assert it reads the committed pre-Sprint-62 baseline from `bundle-size-baseline.json`, prints the baseline and current total minified JavaScript byte counts, exits with code 0, and enforces a maximum increase of exactly 5 percent.
