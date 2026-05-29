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

    log("\n=== Delete Debug ===")
    page.goto("http://localhost:5173/standard/category")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    rows = page.query_selector_all('tbody tr')
    for row in rows:
        cells = row.query_selector_all('td')
        if len(cells) >= 2:
            name = cells[1].inner_text().strip()
            if 'Eval Category 1779172050808-EDIT' in name:
                delete_btns = row.query_selector_all('button')
                for db in delete_btns:
                    log(f"  Delete btn text: '{db.inner_text()}', enabled: {db.is_enabled()}")
                    if '删除' in db.inner_text():
                        db.click()
                        log("Clicked delete")
                        page.wait_for_timeout(2000)
                        break
                break

    # After clicking delete, look at ALL visible buttons
    log("Buttons after delete click:")
    for btn in page.query_selector_all('button'):
        txt = btn.inner_text().strip()
        if btn.is_visible():
            log(f"  '{txt}' enabled={btn.is_enabled()}")

    # Check for any modal/dialog
    log("Looking for modal dialogs...")
    dialogs = page.query_selector_all('[role="dialog"]')
    log(f"Dialogs found: {len(dialogs)}")

    # Try to find the confirm button - use broader search
    confirm_found = False
    for btn in page.query_selector_all('button'):
        txt = btn.inner_text().strip()
        if btn.is_visible() and ('确认' in txt or '确定' in txt or 'Yes' in txt or 'yes' in txt):
            log(f"Found confirm button: '{txt}'")
            btn.click()
            page.wait_for_timeout(2000)
            confirm_found = True
            log("Clicked confirm")
            break

    if not confirm_found:
        log("No confirm dialog visible - checking if delete already happened")
        page.wait_for_timeout(2000)

    # Check if category is still there
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    content = page.content()
    rows_final = page.query_selector_all('tbody tr')
    log(f"Final rows: {len(rows_final)}")

    if 'Eval Category 1779172050808' not in content:
        log("PASS: Category deleted")
    else:
        for row in rows_final:
            cells = row.query_selector_all('td')
            if len(cells) >= 2 and 'Eval Category 1779172050808' in cells[1].inner_text():
                log(f"FAIL: Category still present: {cells[1].inner_text()}")
                break

    browser.close()

print("\n=== RESULTS ===")
for r in results:
    print(r)