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

    # === Category Library UI ===
    log("\n=== Test 1: Category Library UI ===")

    page.goto("http://localhost:5173/standard/category-library")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # Click "新增类目库" button
    btns = page.query_selector_all('button')
    for btn in btns:
        if '新增类目库' in btn.inner_text():
            log(f"Clicking: {btn.inner_text()}")
            btn.click()
            page.wait_for_timeout(2000)
            break

    # List ALL inputs visible after modal opens
    all_inputs = page.query_selector_all('input')
    log(f"Total input elements found: {len(all_inputs)}")
    for inp in all_inputs:
        ph = inp.get_attribute('placeholder') or ''
        name = inp.get_attribute('name') or ''
        inp_type = inp.get_attribute('type') or 'text'
        visible = inp.is_visible()
        enabled = inp.is_enabled()
        log(f"  Input: placeholder='{ph}', name='{name}', type='{inp_type}', visible={visible}, enabled={enabled}")

    # List ALL buttons in modal
    all_btns = page.query_selector_all('button')
    log(f"Total button elements: {len(all_btns)}")
    for btn in all_btns:
        txt = btn.inner_text().strip()
        vis = btn.is_visible()
        en = btn.is_enabled()
        if vis:
            log(f"  Button: '{txt}', enabled={en}")

    browser.close()

print("\n=== RESULTS ===")
for r in results:
    print(r)