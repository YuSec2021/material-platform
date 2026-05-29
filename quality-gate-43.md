# Quality Gate — Sprint 43

**Verdict: PASS**


## ✅ eslint
```

```

## ✅ tsc
```
tests/sprint36.category-tree.spec.ts(206,52): error TS2339: Property 'setInputFiles' does not exist on type 'Locator'.
tests/sprint36.category-tree.spec.ts(211,14): error TS2339: Property 'waitForTimeout' does not exist on type 'Page'.
tests/sprint36.category-tree.spec.ts(215,28): error TS2339: Property 'toBeEnabled' does not exist on type '{ toBeVisible(): Promise<void>; toEqual(expected: unknown): void; toContain(expected: unknown): void; toBeTruthy(): void; }'.
tests/sprint36.category-tree.spec.ts(217,14): error TS2339: Property 'waitForTimeout' does not exist on type 'Page'.
tests/sprint36.category-tree.spec.ts(220,33): error TS2339: Property 'textContent' does not exist on type 'Page'.
tests/sprint36.category-tree.spec.ts(221,22): error TS2339: Property 'toMatch' does not exist on typ
```

## ✅ npm-audit
```
# npm audit report

vite  <=6.4.1
Severity: high
Vite middleware may serve files starting with the same name with the public directory - https://github.com/advisories/GHSA-g4jq-h2w9-997c
Vite's `server.fs` settings were not applied to HTML files - https://github.com/advisories/GHSA-jqfw-vq24-v9c3
vite allows server.fs.deny bypass via backslash on Windows - https://github.com/advisories/GHSA-93m4-6634-74q7
Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling - https://github.com/advisories/GHSA-4w7w-66w2-5vf9
Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket - https://github.com/advisories/GHSA-p9ff-h696-f583
fix available via `npm audit fix --force`
Will install vite@6.4.2, which is outside the stated dependency range
node_modules/vite

1 high severity vul
```

## ✅ flake8
```
/Applications/Xcode.app/Contents/Developer/usr/bin/python3: No module named flake8
```

## ✅ mypy
```
/Applications/Xcode.app/Contents/Developer/usr/bin/python3: No module named mypy
```

## ✅ pytest
```
no tests ran in 0.00s
```

## ✅ pip-audit
```
/bin/sh: pip-audit: command not found
```