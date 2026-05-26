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

    # Target the category we just created (id 20)
    log("\n=== Test: Edit Category 20 ===")

    page.goto("http://localhost:5173/standard/category")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # Find row with id 20 (Eval Category 1779172050808) - check ALL cells
    rows = page.query_selector_all('tbody tr')
    target_row = None
    for row in rows:
        cells = row.query_selector_all('td')
        if len(cells) >= 2:
            first = cells[0].inner_text().strip()
            second = cells[1].inner_text().strip()
            log(f"Row: [{first}] [{second}]")
            if 'Eval Category 1779172050808' in second:
                target_row = row
                log(f"Found target row!")
                break

    if target_row:
        # Click edit on this row - find the edit button
        buttons_in_row = target_row.query_selector_all('button')
        for btn in buttons_in_row:
            txt = btn.inner_text()
            log(f"  Button in row: '{txt}'")
            if '编辑' in txt:
                btn.click()
                page.wait_for_timeout(2000)
                log("Clicked edit")
                break

        # Inspect modal
        inputs = page.query_selector_all('input')
        log(f"Inputs in modal:")
        for inp in inputs:
            ph = inp.get_attribute('placeholder') or ''
            val = inp.input_value()
            vis = inp.is_visible()
            en = inp.is_enabled()
            log(f"  p='{ph}' v='{val}' vis={vis} en={en}")

        selects = page.query_selector_all('select')
        log(f"Selects in modal:")
        for sel in selects:
            val = sel.input_value()
            opts = [o.inner_text() for o in sel.query_selector_all('option')]
            log(f"  value='{val}' opts={opts}")

        btns = page.query_selector_all('button')
        log(f"Buttons in modal:")
        for btn in btns:
            txt = btn.inner_text().strip()
            if btn.is_visible():
                log(f"  '{txt}' enabled={btn.is_enabled()}")

        # Change the name in first enabled input
        for inp in inputs:
            val = inp.input_value()
            if val and inp.is_enabled():
                new_val = val + "-EDIT"
                inp.fill(new_val)
                log(f"Filled new value: {new_val}")
                page.wait_for_timeout(1000)
                break

        # Find and click save
        for btn in btns:
            txt = btn.inner_text().strip()
            if '保存' in txt and btn.is_enabled():
                btn.click()
                page.wait_for_timeout(2000)
                log("Clicked save")
                break

        # Reload and verify
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        content = page.content()
        if "-EDIT" in content:
            log("PASS: Edit persisted")
        else:
            log("FAIL: Edit NOT persisted")

        # Now delete
        log("\n=== Test: Delete Category 20 ===")
        rows = page.query_selector_all('tbody tr')
        for row in rows:
            cells = row.query_selector_all('td')
            if len(cells) >= 2:
                name_cell = cells[1].inner_text().strip()
                if 'Eval Category 1779172050808' in name_cell:
                    edit_btns = row.query_selector_all('button')
                    for db in edit_btns:
                        if '删除' in db.inner_text():
                            db.click()
                            page.wait_for_timeout(1000)
                            log("Clicked delete")
                            break
                    break

        # Confirm
        page.wait_for_timeout(500)
        for btn in page.query_selector_all('button'):
            txt = btn.inner_text().strip()
            if '确认' in txt or '确定' in txt:
                btn.click()
                page.wait_for_timeout(2000)
                log("Confirmed delete")
                break

        # Reload and verify
        page.reload()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        content = page.content()
        if 'Eval Category 1779172050808' not in content:
            log("PASS: Category deleted from list")
        else:
            rows = page.query_selector_all('tbody tr')
            found = False
            for row in rows:
                cells = row.query_selector_all('td')
                if len(cells) >= 2 and 'Eval Category 1779172050808' in cells[1].inner_text():
                    found = True
                    break
            if found:
                log("FAIL: Category still in list after delete")
            else:
                log("PASS: Category deleted from list")
    else:
        log("WARN: Could not find target category row")

    browser.close()

print("\n=== RESULTS ===")
for r in results:
    print(r)