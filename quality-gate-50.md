# Quality Gate — Sprint 50

## Verdict: PASS


## PASS eslint
```

```

## PASS tsc
```
tests/sprint36.category-tree.spec.ts(206,52): error TS2339: Property 'setInputFiles' does not exist on type 'Locator'.
tests/sprint36.category-tree.spec.ts(211,14): error TS2339: Property 'waitForTimeout' does not exist on type 'Page'.
tests/sprint36.category-tree.spec.ts(215,28): error TS2339: Property 'toBeEnabled' does not exist on type '{ toBeVisible(): Promise<void>; toEqual(expected: unknown): void; toContain(expected: unknown): void; toBeTruthy(): void; }'.
tests/sprint36.category-tree.spec.ts(217,14): error TS2339: Property 'waitForTimeout' does not exist on type 'Page'.
tests/sprint36.category-tree.spec.ts(220,33): error TS2339: Property 'textContent' does not exist on type 'Page'.
tests/sprint36.category-tree.spec.ts(221,22): error TS2339: Property 'toMatch' does not exist on typ
```

## PASS npm-build
```
> ai-material-frontend@0.0.1 build
> vite build

vite v6.3.5 building for production...
transforming...
✓ 3306 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                     0.53 kB │ gzip:   0.36 kB
dist/assets/index-CxLz04X2.css    110.93 kB │ gzip:  17.94 kB
dist/assets/index-DOKgJdpo.js   1,301.62 kB │ gzip: 357.40 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 1.56s
```

## PASS flake8
```
/Applications/Xcode.app/Contents/Developer/usr/bin/python3: No module named flake8
```

## PASS pytest
```
../../Library/Python/3.9/lib/python/site-packages/sqlalchemy/orm/properties.py:745: in _init_column_for_annotation
    argument = de_stringify_annotation(
../../Library/Python/3.9/lib/python/site-packages/sqlalchemy/util/typing.py:163: in de_stringify_annotation
    annotation = eval_expression(
../../Library/Python/3.9/lib/python/site-packages/sqlalchemy/util/typing.py:283: in eval_expression
    raise NameError(
E   NameError: Could not de-stringify annotation 'int | None'

The above exception was the direct cause of the following exception:
tests/test_sprint50_category_levels.py:9: in <module>
    from backend.app.main import app
backend/app/main.py:30: in <module>
    from .models import (
backend/app/models.py:99: in <module>
    class MaterialLibrary(Base):
../../Library/Python/3.9/l
```