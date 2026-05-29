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

    # Check category page
    log("\n=== Debug: Edit flow ===")

    page.goto("http://localhost:5173/standard/category")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # List all tbody rows with their data
    rows = page.query_selector_all('tbody tr')
    log(f"Total rows: {len(rows)}")

    # Find a row with category data
    target_row = None
    for row in rows:
        cells = row.query_selector_all('td')
        if len(cells) >= 3:
            cell_texts = [c.inner_text().strip() for c in cells]
            log(f"Row: {cell_texts}")
            # Pick the "Test Category Eval Updated" from API test
            if 'Test Category Eval Updated' in cell_texts[0]:
                target_row = row
                break
            # Pick any non-default row
            if '网络设备' in cell_texts[0] or '办公设备' in cell_texts[0]:
                if not target_row:
                    target_row = row

    if target_row:
        cells = target_row.query_selector_all('td')
        log(f"Target row cells: {[c.inner_text().strip() for c in cells]}")

        # Click edit
        edit_btns = target_row.query_selector_all('button')
        for eb in edit_btns:
            if '编辑' in eb.inner_text():
                eb.click()
                page.wait_for_timeout(2000)
                log("Clicked edit button")
                break

        # List ALL inputs in modal with values
        modal_inputs = page.query_selector_all('input')
        log(f"Inputs in edit modal:")
        for inp in modal_inputs:
            ph = inp.get_attribute('placeholder') or ''
            val = inp.input_value()
            vis = inp.is_visible()
            en = inp.is_enabled()
            log(f"  placeholder='{ph}', value='{val}', visible={vis}, enabled={en}")

        # List ALL selects
        modal_selects = page.query_selector_all('select')
        log(f"Selects in edit modal:")
        for sel in modal_selects:
            opts = [o.inner_text() for o in sel.query_selector_all('option')]
            sel_val = sel.input_value()
            log(f"  value='{sel_val}', options={opts}")

        # List ALL buttons
        modal_btns = page.query_selector_all('button')
        log(f"Buttons in edit modal:")
        for btn in modal_btns:
            txt = btn.inner_text().strip()
            if btn.is_visible():
                log(f"  '{txt}' enabled={btn.is_enabled()}")

        # Modify name
        for inp in modal_inputs:
            val = inp.input_value()
            if val and inp.is_enabled():
                new_val = val + "-EDIT-TEST"
                inp.fill(new_val)
                log(f"Changed value to: {new_val}")
                page.wait_for_timeout(500)
                break

        # Try to save - click the enabled save button
        save_btn = None
        for btn in modal_btns:
            txt = btn.inner_text().strip()
            if '保存' in txt:
                log(f"Found save button: '{txt}', enabled={btn.is_enabled()}")
                if btn.is_enabled():
                    save_btn = btn
                break

        if save_btn:
            save_btn.click()
            page.wait_for_timeout(3000)
            log("Clicked save")
        else:
            log("FAIL: No enabled save button found")

        # Reload and check
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        content = page.content()
        if "-EDIT-TEST" in content:
            log("PASS: Edit persisted after reload")
        else:
            log("FAIL: Edit did NOT persist after reload")

    browser.close()

print("\n=== RESULTS ===")
for r in results:
    print(r)