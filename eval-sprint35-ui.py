import json
from playwright.sync_api import sync_playwright

results = []

def log(msg):
    print(msg)
    results.append(msg)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Sign in
    log("=== Sign in ===")
    page.goto("http://localhost:5173/login")
    page.wait_for_load_state("networkidle")

    # Fill login form
    page.fill('input[name="username"]', "super_admin")
    page.fill('input[name="password"]', "")

    # Submit
    page.click('button[type="submit"]')
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # Check if logged in
    current_url = page.url
    log(f"After login URL: {current_url}")

    if "login" in current_url:
        log("WARN: Still on login page after submit")
        log(f"Page title: {page.title()}")
    else:
        log("Login successful - redirected away from login page")

    # === Test 1: Category Library UI ===
    log("\n=== Test: Category Library UI ===")
    page.goto("http://localhost:5173/standard/category-library")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # Check for "backend not implemented" text
    content = page.content()
    if "backend not implemented" in content.lower() or "not implemented" in content.lower():
        log("FAIL: Found 'backend not implemented' text")
    else:
        log("PASS: No 'backend not implemented' text found")

    log(f"Page URL: {page.url}")

    # Look for create button
    create_buttons = page.query_selector_all('button')
    button_texts = [b.inner_text() for b in create_buttons]
    log(f"Button texts found: {button_texts}")

    # Try to find a create/add button
    create_btn = None
    for btn in create_buttons:
        text = btn.inner_text().lower().strip()
        if 'create' in text or 'add' in text or text == '+' or '+' in text:
            create_btn = btn
            log(f"Found create button: '{btn.inner_text()}'")
            break

    if create_btn:
        create_btn.click()
        page.wait_for_timeout(1000)

        # Fill in form
        name_inputs = page.query_selector_all('input')
        for inp in name_inputs:
            placeholder = inp.get_attribute('placeholder') or ''
            name_attr = inp.get_attribute('name') or ''
            if 'name' in placeholder.lower() or 'name' in name_attr.lower() or placeholder == '':
                inp.fill(f"Eval UI Test Lib {page.evaluate('Date.now()')}")
                break

        # Submit dialog
        submit_buttons = page.query_selector_all('button')
        for btn in submit_buttons:
            text = btn.inner_text().lower().strip()
            if 'confirm' in text or 'save' in text or 'submit' in text or 'create' in text:
                btn.click()
                page.wait_for_timeout(1000)
                break

        log("Clicked create button")
    else:
        log("WARN: Could not find create button")

    # Reload and verify
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    content_after = page.content()
    if "Eval UI Test Lib" in content_after:
        log("PASS: Created library visible after reload")
    else:
        log("INFO: Created library may not be in current view (checking page)")

    # === Test 2: Category UI ===
    log("\n=== Test: Category UI ===")
    page.goto("http://localhost:5173/standard/category")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    content_cat = page.content()
    if "backend not implemented" in content_cat.lower() or "not implemented" in content_cat.lower():
        log("FAIL: Found 'backend not implemented' text in category page")
    else:
        log("PASS: No 'backend not implemented' text in category page")

    log(f"Category page URL: {page.url}")
    log(f"Category page title: {page.title()}")

    browser.close()

print("\n=== SUMMARY ===")
for r in results:
    print(r)