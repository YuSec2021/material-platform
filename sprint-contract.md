## Sprint 57: 修复分类管理页类目属性面板布局位置

### Features
- On the category management page, move the category attributes panel out of the left CategoryTree area and render it below the right-side category content area.
- Keep the category tree dedicated to hierarchy navigation only, with its expand, collapse, and selection behavior unchanged.
- Keep the category attributes panel bound to the currently selected category after the layout move, without changing attribute editing behavior.

### Success criteria (black-box-verifiable)
- [ ] The category attributes panel appears below the right-side category content area, not inside the left category tree area.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173/standard/category`.
  2. In the browser, locate the left tree container with `page.locator('[data-testid="category-tree-container"]')` and the right content container with `page.locator('[data-testid="category-content-container"]')`.
  3. Within `[data-testid="category-tree-container"]`, click the first category node button matching `[data-testid="category-tree-node"][data-node-type="category"]` so the right-side category content area is populated.
  4. Locate the attributes panel with `page.locator('[data-testid="category-attributes-panel"]')` and assert it is visible.
  5. Evaluate `panel.elementHandle().then((panel) => panel?.parentElement)` in the page context and assert the parent element is `[data-testid="category-content-container"]`, not `[data-testid="category-tree-container"]`.
  6. Assert the panel's bounding box top is greater than or equal to the bottom of `[data-testid="category-content-main"]`, confirming it is rendered below the right-side category content area.

- [ ] The left category tree remains a hierarchy navigation panel after the layout fix.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173/standard/category`.
  2. Locate the left tree container with `page.locator('[data-testid="category-tree-container"]')` and assert `tree.locator('[data-testid="category-attributes-panel"]').count()` is `0`.
  3. Expand one tree node by clicking `tree.locator('[data-testid="category-tree-node"][aria-expanded="false"]').first()` and assert that node's `aria-expanded` becomes `true`.
  4. Collapse the same node and assert its `aria-expanded` becomes `false`.
  5. Select a category node with `tree.locator('[data-testid="category-tree-node"][data-node-type="category"]').first().click()`, then assert `[data-testid="category-content-container"]` contains the selected category name or code.
  6. Reassert `tree.locator('[data-testid="category-attributes-panel"]').count()` is `0` after expansion, collapse, and selection.

- [ ] The category attributes panel still follows the currently selected category.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173/standard/category`.
  2. In `[data-testid="category-tree-container"]`, select category A with `tree.locator('[data-testid="category-tree-node"][data-node-type="category"]').nth(0).click()`.
  3. Locate `[data-testid="category-attributes-panel"]`, keep its element handle, and record its `data-selected-category-id` attribute and visible summary text from `[data-testid="category-attributes-summary"]`.
  4. Select category B with `tree.locator('[data-testid="category-tree-node"][data-node-type="category"]').nth(1).click()`; if there is only one visible category node, first expand a collapsed node and then select a different category node.
  5. Assert the attributes panel element handle is the same DOM element as before, not a newly inserted duplicate panel.
  6. Assert the panel's `data-selected-category-id` is different from category A's recorded value and the `[data-testid="category-attributes-summary"]` text refreshes to category B's name or different attribute counts.
  7. Assert `page.locator('[data-testid="category-tree-container"] [data-testid="category-attributes-panel"]').count()` is `0` and `page.locator('[data-testid="category-attributes-panel"]').count()` is `1`.


---

CONTRACT APPROVED

Sprint: 57
Approved criteria: 3
Notes: All 3 criteria approved with Playwright DOM steps.
