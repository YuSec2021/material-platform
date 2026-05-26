# Eval Result -- Sprint 49
Date: 2026-05-22T18:20:00+08:00

## Scores

| Dimension       | Score | Threshold | Result |
|-----------------|-------|-----------|--------|
| Design quality  | 8/10  | >= 7      | PASS   |
| Originality     | 6/10  | >= 6      | PASS   |
| Craft           | 8/10  | >= 7      | PASS   |
| Functionality   | 10/10 | >= 8      | PASS   |

## Verdict: SPRINT PASS

## Evidence

### Criterion 1: Backend API parent_id returns immediate children only
Result: PASS
Evidence:
- `GET /api/v1/categories?parent_id=22` returns `[{"id":23}]` -- only Level 2 child, no Level 3 grandchild (ID=24)
- `GET /api/v1/categories?parent_id=23` returns `[{"id":24}]` -- only Level 3 child, no grandchildren
- `GET /api/v1/categories?parent_id=35` returns `[{"id":36}]` -- only Level 2 child
- Level field is removed from all category list responses (confirmed via response key inspection)
Observation: Backend correctly filters to immediate children only using `parent_id` parameter. No recursive descent. Level field not present in response body.

### Criterion 2: Backend API category_library_id + level=1 returns only Level 1
Result: PASS
Evidence:
- `GET /api/v1/categories?category_library_id=5&level=1` returns `[{"id":22}]` -- single Level 1 root category, parent=null
- `GET /api/v1/categories?category_library_id=10&level=1` returns `[{"id":35},{"id":38}]` -- both with parent=null (Level 1)
- All returned categories have `parent_category_id: null`, confirming Level 1 only
Observation: API correctly returns only root-level categories (parent=null) when filtering by library + level=1.

### Criterion 3: Frontend -- 类目库 column removed
Result: PASS
Evidence: Column headers: `["类目名称","编码","上级类目","描述","操作"]` -- no "类目库" or "category_library" header.
In English mode, headers: `["Category Name","Code","Parent Category","Description","Actions"]` -- same, no removed columns.
Observation: The 类目库 column is absent from the category DataTable in both zh-CN and en-US modes.

### Criterion 3: Frontend -- 层级 column removed
Result: PASS
Evidence: Same column headers as above -- no "层级", "level", or "Level" header in either language.
Observation: The 层级 column is absent from the category DataTable in both zh-CN and en-US modes.

### Criterion 4: Frontend -- Table shows immediate children after tree selection
Result: PASS
Evidence:
- Selecting "Default Category Library" in the tree produces 10 rows, all showing "无上级类目" in the Parent Category column (i.e., all are Level 1, parent=null)
- Selecting a Level 1 category ("办公设备 / 打印机") in the tree updates the table to show its children (Level 2)
- No grandchildren appear in the table after selecting a library or category
- Navigation between tree levels correctly updates the table
Observation: The table correctly displays only immediate children of the selected tree node at each level.

### Criterion 5: Frontend -- Empty state when no tree node selected
Result: PASS
Evidence:
- Before any tree node selection: table shows 1 row with guidance text "请先从左侧类目树选择类目库或类目，表格将显示其直接下级"
- Tree panel shows empty state prompt "请选择树中的类目查看上下文"
- No all-categories default listing is shown
Observation: Empty state guidance is displayed when no tree node is selected. This is distinguishable from a data-loaded state.

### Criterion 6: Frontend -- zh-CN/en-US i18n for empty state and removed column labels
Result: PASS
Evidence:
- zh-CN mode: empty state prompt "请选择树中的类目查看上下文", table guidance "请先从左侧类目树选择"
- en-US mode: empty state prompt "Select a category in the tree to view context", table guidance "Select a category tree node"
- Language toggle button "English" switches all empty state text correctly
- Column headers translate to English: `["Category Name","Code","Parent Category","Description","Actions"]`
- No 类目库 or 层级 labels appear in English mode
Observation: i18n works correctly for empty state messages and table column headers. No removed column labels leak through in either language.

## Required fixes (if SPRINT FAIL)
None -- all criteria pass.

## Scope violations
None. Diff against main:
- `backend/app/main.py`: API route parameter additions (parent_id, level filter, level field removal) -- within contract scope
- `prototype_code/src/app/api/client.ts`: API client parameter additions -- within contract scope
- `prototype_code/src/app/components/pages/standard/CategoryList.tsx`: Column removal, filtering logic, empty state, i18n -- within contract scope
- `prototype_code/src/app/i18n.ts`: i18n messages for empty state -- within contract scope
- `tests/test_sprint49_category_filters.py`: New API tests -- within contract scope