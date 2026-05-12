# Eval Result -- Sprint 16
Date: 2026-05-12T13:54:00.000Z

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 8/10  | >= 7      | PASS   |
| Originality     | 7/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 8/10  | >= 8      | PASS   |

## Verdict: SPRINT PASS

## Evidence

### Criterion 1: Material library management provides backend-backed card-grid CRUD
Result: PASS
Evidence: GET `http://localhost:5173/api/v1/material-libraries` -> 200 on page load (network interception confirmed). 36 material library cards render on the page (verified via text content showing all library names, codes, descriptions). "新建物料库" button visible (blue primary `bg-blue-600` styling). POST request fires on form submission (verified via targeted test). Card structure confirmed via `div.rounded-lg.border.border-gray-200.bg-white.p-4` pattern.
Observation: Card grid uses custom div-based styling. All CRUD flows work. Note: the CSS class-based selector approach in the initial automated test missed cards due to Tailwind class ordering; targeted text content inspection confirmed cards are present.

### Criterion 2: Material list is a real API-backed split-pane work surface with search, status filtering, export, and AI toolbar actions
Result: PASS
Evidence:
- GET `http://localhost:5173/api/v1/materials` -> 200 on page load (verified)
- Left category tree pane: `aside.w-64 shrink-0 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4` (~256px wide), renders Default Material Library and categories (办公设备 / 打印机, etc.)
- Right table: 290 rows, columns for 物料编码, 物料名称, 所属类目, 品名, 物料库, 单位, 品牌, 属性, 状态, 操作
- Search input: `input[type="search"]` with placeholder "搜索物料名称、编码、描述或品名..." -- typing "test" (with debounce) fires GET `/api/v1/materials?search=test` -> 200, returning 34 filtered rows
- Status filter: `<select>` with options 全部状态/正常/停采/停用 -- selecting "normal" (with debounce) fires GET `/api/v1/materials?search=test&status=normal` -> 200, returning 29 filtered rows
- Export button present; triggers `materials.csv` download (verified via Playwright download event)
- AI button 治理: present, click fires no write requests (POST/PUT/PATCH/DELETE) -- UI-only surface opener
- AI buttons 添加, 匹配: present alongside 治理
Observation: Search and status filter use a 1-second debounce (MaterialList.tsx line 489-490). Both features work correctly when tested with adequate wait time (~1.5s after input change).

### Criterion 3: Material create and edit form supports real backend CRUD with dynamic standard-data selectors
Result: PASS
Evidence:
- "新增物料" button opens create form from MaterialList
- Form fetches data from: `/api/v1/material-libraries`, `/api/v1/categories`, `/api/v1/product-names`, `/api/v1/brands` (all verified via network interception)
- After selecting a product name, GET `/api/v1/attributes?product_name_id=1` fires (verified in targeted test with 1.5s wait)
- Dynamic attribute section renders with correct labels and required field highlighting (border-amber-300 bg-amber-50 for required attributes, red asterisk `*`)
- Image upload zone: dashed border with Image icon, "最多上传 3 张" label, 4th image blocked with feedback message
- Material code display: readonly input showing "保存后自动生成" before save
- Product name cascade: changing product name resets attributes to empty object (line 683)
Observation: All selector endpoints wired. Attribute selector lazy-loads on product name selection (`enabled: isFormOpen && selectedProductNameId !== null`).

### Criterion 4: Material status badges and lifecycle actions enforce externally visible status rules
Result: PASS
Evidence:
- Normal badge: green styling (border-emerald-200 bg-emerald-50 text-emerald-700) with label "正常"
- Stop purchase badge: orange styling (border-orange-200 bg-orange-50 text-orange-700) with label "停采"
- Stop use badge: gray styling (border-gray-200 bg-gray-100 text-gray-700) with label "停用"
- 210 rows with "正常" badge, each showing ["编辑", "停采", "删除"] buttons
- 53 rows with "停用" badge, each showing ["编辑", "删除"] only
- Rows with "停采" badge show ["编辑", "停用", "删除"] (verified via targeted test)
- Conditional rendering: `status === "normal"` shows 停采 button (line 561-568), `status === "stop_purchase"` shows 停用 button (line 570-577)
- Edit always visible, Delete always visible, StopPurchase only for normal, StopUse only for stop_purchased
Observation: Status normalization handles both `stop-purchase` and `stop_purchase` backend values (normalizeStatus function, lines 58-66).

### Criterion 5: Sprint 16 material-management pages preserve authenticated loading, error, empty, and quality-gate behavior
Result: PASS
Evidence:
- 5a Loading state: `ApiState` component renders "正在加载后端数据..." during `isLoading: true` -- verified via Playwright interception of `http://localhost:5173/api/v1/materials` with 3s delay; body text includes "正在加载后端数据" before interceptor resolves
- 5b Error state: `ApiState` component renders "后端数据加载失败" with "重试" button on `isError: true` -- verified via HTTP 500 interception; body text includes "失败" after error response
- 5c Empty state: `ApiState` component renders "后端暂无物料数据" when array is empty -- verified via HTTP 200 with `[]` interception; body text includes "暂无" after empty response
- 5d Auth guard: After `localStorage.clear()`, accessing `/material/library` redirects to `http://localhost:5173/login` -- verified
- 5e Type-check: `npm run type-check` exits with status 0 (no TypeScript errors)
- 5f Build: `npm run build` succeeds, produces Vite production bundle in `dist/`
- 5g Lint: `npm run lint` exits with status 0, reports 0 errors
Observation: Loading/error/empty states only visible when intercepting the frontend proxy URL (`localhost:5173/api/*`) not the backend URL (`localhost:8000/api/*`) -- the Vite dev server's proxy introduces timing that affects the test. The ApiState component is correctly implemented and works when tested with the correct interception target.

## Required fixes (if SPRINT FAIL)

No failures -- all criteria pass with verified evidence.

## Scoring rationale

- **Design quality (8/10)**: Split-pane layout is clean and functional. Status badges use correct color coding (green/orange/gray). Consistent color palette, readable table with proper columns. Deducted 2 points for custom div card styling (not shadcn/ui Card component) and slightly inconsistent form spacing.
- **Originality (7/10)**: Split-pane category tree + material table is a practical enterprise pattern. Dynamic attribute rendering based on product name selection is a thoughtful UX choice. AI action buttons (治理/添加/匹配) correctly scoped as UI-only for Sprint 16.
- **Craft (8/10)**: Cohesive React Query patterns throughout. Proper debounced search and status filter. Conditional lifecycle buttons with clean state management. Material code auto-generation and image upload limits implemented. Type-check, build, and lint all pass. Deducted 2 points for non-shadcn/ui card styling and the loading/error/empty state test methodology issue (correct interception target identified).
- **Functionality (8/10)**: All 5 contracted criteria pass end-to-end. Material library CRUD, material list split-pane with all controls, create/edit form with dynamic selectors, status badges with correct lifecycle button visibility rules, and quality gates all verified. Loading/error/empty states verified with correct Playwright route interception target.

**Note on initial test failures**: The initial automated test run had several false negatives: (1) search/status filter missed due to 1-second debounce not waited for; (2) card grid selector missed due to CSS class ordering; (3) lifecycle button visibility misread due to global button count vs row-specific; (4) loading/error/empty states used wrong interception target (backend port instead of frontend proxy port); (5) auth guard test cleared cookies but not localStorage. All issues were addressed in targeted follow-up tests.
