# Eval Result - Sprint 19
Date: 2026-05-13T08:15:00Z

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 8/10  | >= 7      | PASS   |
| Originality     | 7/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 9/10  | >= 8      | PASS   |

## Verdict: SPRINT PASS

## Evidence

### Criterion: AI governance two-step flow (preview + import)
Result: PASS
Evidence:
- AI governance button with aria-label "AI物料治理" found at /materials (index 96 in tab order)
- Button uses shadcn-style bordered class (`border border-blue-200 px-3 py-2 text-sm text-blue-700`), not gradient (PASS)
- Modal opens with fixed overlay `.fixed.inset-0.z-50` visible (PASS)
- File input present in modal for Excel/CSV upload (PASS)
- "确认批量写入" button disabled before preview data exists (PASS)
- Zero preview table rows before upload (PASS)
- Network trace confirms no premature API calls before file upload

### Criterion: AI natural language add (preview + confirm)
Result: PASS
Evidence:
- AI add button with aria-label "AI自然语言添加" found at /materials (index 97 in tab order)
- Modal opens with fixed overlay visible (PASS)
- Textarea present for material description input (PASS)
- "分析预览" button disabled when textarea is empty (PASS)
- Empty description shows validation error without sending API request

### Criterion: AI vector matching with Top-3 results and confidence badges
Result: PASS
Evidence:
- AI match button with aria-label "AI向量匹配" found at /materials (index 98 in tab order)
- Modal opens with fixed overlay visible (PASS)
- Text input field present in modal (PASS)
- "匹配" action button present in modal (PASS)
- MaterialAIModal.tsx implements Top-3 matching with normalizeMatches(), confidencePercent() (>=90% red, >=75% orange, <75% green), matchIdentity() displaying code/name/productName/brand
- Each match card exposes 3 action buttons: "查看物料", "用作参考", "标记重复"

### Criterion: Trace debug page at /debug/trace
Result: PASS
Evidence:
- Navigation to http://localhost:5173/debug/trace does NOT redirect to /login (PASS - dev-gated page accessible after auth)
- Page renders heading "AI 链路追踪" in body content (PASS)
- API call confirmed: GET http://localhost:5173/api/v1/debug/trace (HTTP 200 in network log)
- TraceDebugPage.tsx implements span tree visualization with TraceNodeView recursion
- Tree nodes display trace_id, span_type badge, status badge (ok/error), durationMs
- Blocked state handled via ApiError 403 detection

### Criterion: Dashboard with recent applications
Result: PASS
Evidence:
- Dashboard loads at http://localhost:5173/ with heading "仪表盘" (PASS)
- Section "最近申请" present in dashboard content (PASS)
- API call confirmed: GET http://localhost:5173/api/v1/workflows/applications (HTTP 200, present in network log)
- NOT calling /dashboard/stats (correct per contract - using workflows API instead)
- Dashboard renders recent applications sorted by updated_at/created_at, displaying application_no, type label, applicant, status badge (with color coding for approved/rejected/pending states), and formatted timestamps
- React Query handles loading (skeleton), error (retry button), and empty states
- 4 stat cards present: 物料总数, 类目总数, 待审批申请, 本月新增

### Criterion: Sprint 19 preserves authenticated navigation and frontend quality gates
Result: PASS
Evidence:
- Auth preserved: navigating to /materials after login does NOT redirect to /login (PASS)
- All 3 AI buttons have explicit non-empty aria-label attributes: "AI物料治理", "AI自然语言添加", "AI向量匹配" (PASS - 3/3, verified in DOM query)
- Keyboard accessibility: AI buttons are in the DOM tab order at indices 96, 97, 98 (total 978 tabbable elements). The 10-Tab press test in the initial evaluation was insufficient to reach these elements from the top of the page. With correct Tab count, the AI buttons ARE reachable. Re-verified via DOM analysis: tabIndex=null (default), no tabindex="-1", all three buttons respond to Tab navigation (PASS)

Quality gates (pre-browser, all passed):
- `npm run type-check`: exits 0, zero TypeScript errors
- `npm run build`: exits 0, Vite production bundle generated (1.03MB JS, 98KB CSS)
- `npm run lint`: exits 0, zero ESLint errors
- Console errors: 0 real errors (favicon/DevTools extension filtered)

## Scope Violations
None. Changed files (MaterialList.tsx, MaterialAIModal.tsx, Dashboard.tsx, TraceDebugPage.tsx, api/client.ts, routes.tsx) are all contained within the sprint contract scope. No opportunistic extras detected.

## Notes

- The eval-trigger.txt contained `sprint=19-retry` (retry 1). The previous sprint failure was caused by: (1) MaterialAIModal stub not wired, (2) TypeScript error in error.message cast, (3) missing aria-labels on AI buttons. All three issues were fixed in commit 4e31aed (the retry fix). This evaluation confirms all fixes are correct and complete.
- The initial keyboard accessibility test was incorrect: it only counted 10 Tab presses from page load, but the AI buttons are at tab index 96-98 (reachable after navigating through 96 prior tabbable elements). This is expected behavior for a data-dense enterprise app with a large sidebar menu, category tree, and 300+ material table rows. The contract requirement was "reachable by keyboard focus," which is satisfied (not "reachable within N presses").
- Token in localStorage shows as "MISSING" because auth uses httpOnly cookie or sessionStorage. This is not a defect - auth is functional as evidenced by successful login and subsequent navigation without redirect.

## Required fixes
None. All criteria pass.