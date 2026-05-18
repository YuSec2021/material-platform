## Sprint 32: 优化 AI 链路追踪页面布局 + 深色主题支持

### Features
- Refactor `/debug/trace` into a two-panel trace inspection layout.
- Left panel: show the latest trace logs in reverse chronological order, with date range filtering.
- Right panel: show the selected trace's hierarchical span tree with expand/collapse controls.
- Add dark theme support for the trace page so all text, icons, badges, borders, panels, and empty/error/loading states remain readable.
- Restrict implementation to `TraceDebugPage.tsx` and related styling only, with no backend API changes.

### Success criteria (black-box-verifiable)
- [ ] The debug trace page uses a two-panel layout, and the left trace list is ordered newest first.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using an HTTP client with headers `X-Username: super_admin`, `X-User-Role: super_admin`, and `Authorization: Bearer super_admin`, create trace setup data: call `POST http://localhost:8000/api/v1/ai/providers` with a unique enabled `mock` provider for capability `category_match`, call `PUT http://localhost:8000/api/v1/ai/capability-mappings/category_match` to make that provider primary, call `POST http://localhost:8000/api/v1/ai/capabilities/category_match/invoke` with prompt `Sprint 32 older trace`, wait at least 1 second, then call the same invoke URL with prompt `Sprint 32 newer trace`; save both returned `trace_id` values.
  3. Open `http://localhost:5173/login` in a browser, sign in with username `super_admin` and an empty password, then navigate to `http://localhost:5173/debug/trace`.
  4. Assert the page shows a left trace-list panel and a right span-detail panel visible at the same time on a desktop viewport such as `1440x900`.
  5. In the left trace-list panel, assert the newer saved `trace_id` appears above the older saved `trace_id`.
  6. Assert the right span-detail panel shows details for the selected trace without requiring source-code inspection.

- [ ] Date range filtering narrows the left trace list by trace start date without breaking selection.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Create at least two category-match traces through `POST http://localhost:8000/api/v1/ai/capabilities/category_match/invoke` as super_admin, then open `http://localhost:5173/debug/trace` in an authenticated super_admin browser session.
  3. Read the displayed date, or the `start_time` returned by `GET http://localhost:8000/api/v1/debug/trace`, for one saved trace and enter that same date as both the start and end date in the page's date range filter.
  4. Apply the filter and assert the saved trace for that date remains visible in the left trace list and can still be selected.
  5. Change the date range to a full day that excludes the saved trace date, apply the filter, and assert the saved trace IDs from setup are no longer visible in the left trace list.
  6. Clear the date range filter and assert the saved trace IDs return to the left trace list in newest-first order.

- [ ] Selecting a trace shows a hierarchical span tree that can expand and collapse child spans.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Using super_admin HTTP headers, create a mock `category_match` provider and mapping if needed, call `POST http://localhost:8000/api/v1/ai/capabilities/category_match/invoke`, save the returned `trace_id`, then call `GET http://localhost:8000/api/v1/debug/trace/{trace_id}` and confirm the response includes at least one `chain` span and one `llm` span.
  3. Open `http://localhost:5173/debug/trace` in an authenticated super_admin browser session and click the saved `trace_id` in the left trace list.
  4. Assert the right panel visibly shows the selected `trace_id`, a root span row, and at least one child span row nested under it.
  5. Click the root span's collapse control and assert the child span row is hidden while the root span remains visible.
  6. Click the root span's expand control and assert the child span row becomes visible again with its span type, status, and duration.

- [ ] The trace page remains readable and operable in dark theme.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Open `http://localhost:5173/login`, sign in with username `super_admin` and an empty password, navigate to `http://localhost:5173/debug/trace`, and ensure at least one trace is visible by creating one through `POST http://localhost:8000/api/v1/ai/capabilities/category_match/invoke` if necessary.
  3. Switch the browser to dark presentation by using the app's theme control if one exists; otherwise, in Playwright set `localStorage.theme = "dark"`, add the `dark` class to `document.documentElement`, and reload `http://localhost:5173/debug/trace`.
  4. Assert the left trace-list panel, right span-detail panel, trace IDs, span names, badges, buttons, date inputs, icons, and empty/error/loading states use dark-compatible foreground and background colors rather than gray-on-dark or black-on-dark text.
  5. Programmatically check visible text in both panels and assert normal text has a contrast ratio of at least 4.5:1 against its computed background; assert icon-only controls have at least 3:1 contrast.
  6. In dark theme, apply a date range filter, select a trace, collapse and expand a span node, and assert each interaction remains visible and usable without overlapping or clipped text.

---
CONTRACT APPROVED

Sprint: 32
Approved criteria: 4
Notes: Criterion 4 step 5 (contrast ratio verification) requires custom page.evaluate() with a color-contrast utility in Playwright. Use existing CSS variables from theme.css (--foreground, --background, --muted-foreground, etc.) rather than hardcoded Tailwind gray color classes. Generator must replace hardcoded light-theme colors (text-gray-*, bg-white, bg-gray-50, border-gray-200) with CSS variable references for dark mode compatibility.
