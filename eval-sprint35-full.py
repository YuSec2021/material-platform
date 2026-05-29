from playwright.sync_api import sync_playwright

results = []

def log(msg):
    print(msg)
    results.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.set_viewport_size({"width": 1440, "height": 900})

    # Sign in
    log("=== Sign in ===")
    page.goto("http://localhost:5173/login")
    page.wait_for_load_state("networkidle")

    page.fill('input[name="username"]', "super_admin")
    page.fill('input[name="password"]', "")

    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    log(f"After login URL: {page.url}")

    # === Category Library UI - Create ===
    log("\n=== Test 1: Category Library UI ===")

    page.goto("http://localhost:5173/standard/category-library")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # Count rows before
    rows_before = page.query_selector_all('tbody tr')
    log(f"Rows before create: {len(rows_before)}")

    # Click "新增类目库" button
    btns = page.query_selector_all('button')
    for btn in btns:
        if '新增类目库' in btn.inner_text():
            log(f"Clicking: {btn.inner_text()}")
            btn.click()
            page.wait_for_timeout(2000)
            break

    # Fill the name input (second input - the first is the search bar)
    # The modal has: search input (visible), name input (empty placeholder), code input (auto-gen)
    all_inputs = page.query_selector_all('input')
    log(f"Input count after modal open: {len(all_inputs)}")

    # Fill the second input (name field - no placeholder or label we can easily identify)
    # The name field is likely the one with empty placeholder and visible
    test_lib_name = f"Eval Lib {page.evaluate('Date.now()')}"
    filled = False
    for inp in all_inputs:
        ph = inp.get_attribute('placeholder') or ''
        if ph == '' and inp.is_visible():
            # This is likely the name input
            inp.fill(test_lib_name)
            log(f"Filled name field with: {test_lib_name}")
            filled = True
            page.wait_for_timeout(500)
            break

    # Check if save button is now enabled
    save_btn = None
    for btn in page.query_selector_all('button'):
        txt = btn.inner_text().strip()
        if '保存' in txt and btn.is_visible():
            save_btn = btn
            log(f"Save button text: '{txt}', enabled: {btn.is_enabled()}")
            break

    if save_btn and save_btn.is_enabled():
        save_btn.click()
        page.wait_for_timeout(2000)
        log("Clicked save")
    else:
        log("FAIL: Save button still disabled after filling name")

    # Count rows after
    rows_after = page.query_selector_all('tbody tr')
    log(f"Rows after create: {len(rows_after)}")

    if len(rows_after) > len(rows_before):
        log(f"PASS: Row count increased from {len(rows_before)} to {len(rows_after)}")
    else:
        log(f"INFO: Row count unchanged")

    # Reload and check persistence
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    content = page.content()
    if test_lib_name in content:
        log(f"PASS: Created library '{test_lib_name}' visible after reload")
    else:
        log(f"INFO: Library may be filtered or in different state after reload")

    # Now edit the library
    log("\n=== Test 2: Edit Category Library ===")
    # Find the edit button for our test library
    page.wait_for_timeout(1000)
    all_table_rows = page.query_selector_all('tbody tr')
    for row in all_table_rows:
        cells = row.query_selector_all('td')
        if cells:
            cell_text = cells[0].inner_text()
            if test_lib_name in cell_text or 'Eval Lib' in cell_text:
                # Find edit button in this row
                edit_btns = row.query_selector_all('button')
                for eb in edit_btns:
                    if '编辑' in eb.inner_text():
                        log(f"Clicking edit for row: {cell_text}")
                        eb.click()
                        page.wait_for_timeout(2000)
                        break
                break

    # Check if modal opened with name filled
    all_inputs2 = page.query_selector_all('input')
    for inp in all_inputs2:
        ph = inp.get_attribute('placeholder') or ''
        val = inp.input_value()
        if val:
            log(f"  Input value: placeholder='{ph}', value='{val}'")

    # Change the name
    for inp in all_inputs2:
        ph = inp.get_attribute('placeholder') or ''
        if ph == '' and inp.is_visible():
            new_name = test_lib_name + " Updated"
            inp.fill(new_name)
            log(f"Updated name to: {new_name}")
            page.wait_for_timeout(500)
            break

    # Save
    for btn in page.query_selector_all('button'):
        txt = btn.inner_text().strip()
        if '保存' in txt and btn.is_visible() and btn.is_enabled():
            btn.click()
            page.wait_for_timeout(2000)
            log("Clicked save for update")
            break

    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    content2 = page.content()
    if "Updated" in content2:
        log("PASS: Updated library name visible after reload")
    else:
        log("INFO: Updated name may not be visible")

    # Delete the library
    log("\n=== Test 3: Delete Category Library ===")
    all_table_rows = page.query_selector_all('tbody tr')
    for row in all_table_rows:
        cells = row.query_selector_all('td')
        if cells:
            cell_text = cells[0].inner_text()
            if 'Updated' in cell_text or 'Eval Lib' in cell_text:
                delete_btns = row.query_selector_all('button')
                for db in delete_btns:
                    if '删除' in db.inner_text():
                        log(f"Clicking delete for row: {cell_text}")
                        db.click()
                        page.wait_for_timeout(1000)
                        break
                break

    # Handle confirmation dialog
    for btn in page.query_selector_all('button'):
        txt = btn.inner_text().strip()
        if '确认' in txt or '确定' in txt:
            log("Clicking confirm delete")
            btn.click()
            page.wait_for_timeout(2000)
            break

    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    rows_final = page.query_selector_all('tbody tr')
    log(f"Rows after delete: {len(rows_final)}")
    if len(rows_final) < len(rows_after):
        log("PASS: Row count decreased after delete")
    else:
        log("INFO: Row count unchanged after delete")

    # === Category UI ===
    log("\n=== Test 4: Category UI ===")

    page.goto("http://localhost:5173/standard/category")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # Check for "backend not implemented"
    content_cat = page.content()
    if "backend not implemented" in content_cat.lower():
        log("FAIL: 'backend not implemented' text found in category page")
    else:
        log("PASS: No 'backend not implemented' text in category page")

    # Check for category library selector
    selects = page.query_selector_all('select')
    log(f"Select elements: {len(selects)}")
    for sel in selects:
        name = sel.get_attribute('name') or sel.get_attribute('id') or ''
        opts = [o.inner_text() for o in sel.query_selector_all('option')]
        log(f"  Select '{name}': {opts[:5]}")

    # Check buttons
    cat_btns = page.query_selector_all('button')
    cat_btn_texts = [b.inner_text().strip() for b in cat_btns if b.is_visible()]
    log(f"Visible buttons: {cat_btn_texts}")

    # Try creating a category
    for btn in cat_btns:
        txt = btn.inner_text().strip()
        if '新增' in txt or '添加' in txt or '创建' in txt:
            log(f"Clicking create category: {txt}")
            btn.click()
            page.wait_for_timeout(2000)
            break

    # List inputs in modal
    cat_inputs = page.query_selector_all('input')
    for inp in cat_inputs:
        ph = inp.get_attribute('placeholder') or ''
        val = inp.input_value()
        if val or inp.is_visible():
            log(f"  Input: placeholder='{ph}', value='{val}', visible={inp.is_visible()}")

    # List selects in modal
    cat_selects = page.query_selector_all('select')
    for sel in cat_selects:
        name = sel.get_attribute('name') or sel.get_attribute('id') or ''
        opts = [o.inner_text() for o in sel.query_selector_all('option')]
        log(f"  Select: '{name}', options={opts}")

    browser.close()

print("\n=== RESULTS ===")
for r in results:
    print(r)