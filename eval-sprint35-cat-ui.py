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
    log(f"Logged in: {page.url}")

    # === Category UI - Full CRUD ===
    log("\n=== Test: Category UI Full CRUD ===")

    page.goto("http://localhost:5173/standard/category")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # Open create modal
    for btn in page.query_selector_all('button'):
        if '新增类目' in btn.inner_text():
            btn.click()
            page.wait_for_timeout(2000)
            log("Opened create category modal")
            break

    # Fill in category name
    cat_name = f"Eval Category {page.evaluate('Date.now()')}"
    all_inputs = page.query_selector_all('input')
    for inp in all_inputs:
        ph = inp.get_attribute('placeholder') or ''
        if ph == '' and inp.is_visible() and inp.get_attribute('type') != 'hidden':
            inp.fill(cat_name)
            log(f"Filled category name: {cat_name}")
            page.wait_for_timeout(500)
            break

    # Select a category library
    all_selects = page.query_selector_all('select')
    for sel in all_selects:
        opts = [o.inner_text() for o in sel.query_selector_all('option')]
        if '请选择' not in opts[0] or len(opts) > 1:
            log(f"Selecting category library from select with options: {opts[:3]}")
            sel.select_option(index=1)  # Pick first real option
            page.wait_for_timeout(500)
            log("Selected category library")
            break

    # Save
    for btn in page.query_selector_all('button'):
        txt = btn.inner_text().strip()
        if '保存' in txt and btn.is_visible() and btn.is_enabled():
            btn.click()
            page.wait_for_timeout(2000)
            log("Clicked save")
            break

    # Count rows after create
    rows_after_create = page.query_selector_all('tbody tr')
    log(f"Rows after create: {len(rows_after_create)}")

    # Reload and verify
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    content = page.content()
    if cat_name in content:
        log(f"PASS: Category '{cat_name}' visible after reload")
    else:
        log(f"INFO: Category name not found in page content after reload")

    # Try editing
    log("\n=== Test: Edit Category ===")
    rows = page.query_selector_all('tbody tr')
    for row in rows:
        cells = row.query_selector_all('td')
        if cells:
            first_cell = cells[0].inner_text()
            if cat_name in first_cell:
                edit_btns = row.query_selector_all('button')
                for eb in edit_btns:
                    if '编辑' in eb.inner_text():
                        eb.click()
                        page.wait_for_timeout(2000)
                        log(f"Opened edit modal for: {first_cell}")
                        break
                break

    # Verify inputs are populated
    edit_inputs = page.query_selector_all('input')
    for inp in edit_inputs:
        val = inp.input_value()
        ph = inp.get_attribute('placeholder') or ''
        if val:
            log(f"  Edit input: placeholder='{ph}', value='{val}'")

    # Update the name
    for inp in edit_inputs:
        val = inp.input_value()
        ph = inp.get_attribute('placeholder') or ''
        if val and ph == '':
            new_name = val + " Updated"
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
            log("Saved updated category")
            break

    # Reload and verify
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    content2 = page.content()
    if "Updated" in content2:
        log("PASS: Updated category name visible after reload")
    else:
        log("INFO: Updated name not found after reload")

    # Delete
    log("\n=== Test: Delete Category ===")
    rows = page.query_selector_all('tbody tr')
    for row in rows:
        cells = row.query_selector_all('td')
        if cells:
            first_cell = cells[0].inner_text()
            if 'Updated' in first_cell or cat_name in first_cell:
                delete_btns = row.query_selector_all('button')
                for db in delete_btns:
                    if '删除' in db.inner_text():
                        db.click()
                        page.wait_for_timeout(1000)
                        log(f"Clicked delete for: {first_cell}")
                        break
                break

    # Handle confirm
    for btn in page.query_selector_all('button'):
        txt = btn.inner_text().strip()
        if '确认' in txt or '确定' in txt:
            btn.click()
            page.wait_for_timeout(2000)
            log("Confirmed delete")
            break

    # Reload and verify deletion
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    content3 = page.content()
    if cat_name not in content3:
        log(f"PASS: Category '{cat_name}' removed from list after delete")
    else:
        log(f"INFO: Category still in list after delete")

    browser.close()

print("\n=== RESULTS ===")
for r in results:
    print(r)