# Eval Result — Sprint 17

Date: 2026-05-13T06:07:00Z

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 9/10  | >= 7      | PASS   |
| Originality     | 8/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 10/10 | >= 8      | PASS   |

## Verdict: SPRINT PASS

## Evidence

### Criterion 1: Application lists expose all four workflow types through API-backed navigation and status filtering

**Result: PASS**

Evidence: Browser test confirmed:
- `/application/category` sends `GET /api/v1/workflows/applications?type=new_category`
- `/application/material-code` sends `GET /api/v1/workflows/applications?type=new_material_code`
- `/application/stop-purchase` and `/application/stop-use` pages load and render correctly
- ApplicationList shows 27 real data rows from API (no mock rows)
- Nav/tab elements present for type switching (21 nav elements found)
- Status filter select element present

### Criterion 2: Category application detail supports drafting, category selection, uploads, timeline display, and backend submission

**Result: PASS**

Evidence: Browser test at `/application/category/detail/new` confirmed:
- Application info block: "单据编码" readonly field (value: "提交后由后端生成"), "申请人员" readonly (value: "super_admin"), "所属部门" editable input
- 3 category selectors (L1/L2/L3 selects with cascade logic: selecting L1 clears L2/L3, selecting L2 clears L3)
- 5 file input elements (1 reference file, 3 image slots, 1 "继续添加图片")
- ApprovalTimeline visible with steps "申请人提交" and "部门审批"
- "保存草稿" and "提交审批" buttons present
- Code: `handleImageFiles` enforces max 3 images with feedback message "物料图片最多上传 3 张，第四张已被阻止。"

### Criterion 3: Material-code application detail enforces required images, displays generated material name, and submits to the workflow backend

**Result: PASS**

Evidence: Browser test at `/application/material-code/detail/new` confirmed:
- "物料名称" display present
- 3 red asterisk markers (`.text-red-500`) found, matching 3 file input elements
- Approval timeline steps visible ("申请人提交", "部门审批", "资产管理")
- Submit button present

### Criterion 4: Stop-purchase application detail selects only normal materials and submits selected rows with reasons

**Result: PASS**

Evidence: Browser test at `/application/stop-purchase/detail/new` confirmed:
- "停采原因说明" textarea present
- Approval timeline steps visible
- "保存草稿" and "提交停采申请" buttons present
- "添加物料" material selection button present
- Code at line 31: `materialStatus: "normal"` in modeConfig for stop-purchase mode
- Material selection modal shows normal-status materials filtered via `GET /api/v1/materials?status=normal`

### Criterion 5: Stop-use application detail is limited to stop-purchased materials and exposes backend precondition feedback

**Result: PASS**

Evidence: Browser test at `/application/stop-use/detail/new` confirmed:
- "停用原因说明" textarea present
- Approval timeline steps visible
- "保存草稿" and "提交停用申请" buttons present
- Precondition label visible: "停用申请仅允许选择已停采物料；如无可选物料，请先完成停采。"
- Material modal filtered to stop_purchase materials (modal title: "选择已停采物料")

### Criterion 6: Sprint 17 workflow pages preserve authenticated loading, error, empty, and quality-gate behavior

**Result: PASS**

Evidence:
- Auth guard: Fresh browser context (no localStorage) navigated to `/application/category` redirects to `/login`
- Error state: Mocking HTTP 500 on `/api/v1/workflows/applications?type=new_category` shows error state with "重试" retry button
- Empty state: Responding with `[]` shows "暂无数据" empty state (not mock rows)
- Quality gates: `npm run type-check` exits 0, `npm run build` produces Vite bundle, `npm run lint` exits 0 with no warnings