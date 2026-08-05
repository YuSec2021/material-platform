# AGENTS.md

This repository contains the AI Material Management Platform product.

## Working agreement

- Work directly from the user's current request.
- Inspect the existing implementation and preserve unrelated local changes.
- Keep changes focused; do not perform unrelated refactors.
- Do not modify or delete repository database files unless the user explicitly
  requests it.
- Add or update focused tests for behavior changes.
- Never weaken existing tests to make a change pass.
- Do not use destructive Git commands.

## Startup

Before changing application code:

```bash
git status --short
bash init.sh
curl -fsS http://localhost:24435/health
```

The local frontend is served at `http://localhost:24434` and the backend health
endpoint is `http://localhost:24435/health`.

## Verification

Run checks appropriate to the changed area:

```bash
pytest -q
cd frontend && npm run type-check && npm run lint && npm run build
```

For browser-visible changes, run the relevant Playwright tests against
`http://localhost:24434`.

## Data migration safety

- AI agents must never execute a data migration against any repository,
  development, staging, or production database.
- A data migration includes copying, importing, backfilling, transforming,
  deleting, reconciling, or cutting over persisted business records between
  databases, schemas, tables, or storage systems.
- AI agents may inspect data read-only, implement migration scripts, test them
  only with synthetic disposable data, and prepare dry-run, backup, migration,
  verification, rollback, and cleanup commands.
- The final migration commands must be presented to a human operator for
  review and manual execution. AI agents must stop before running those
  commands, even when credentials and database access are available.
- After manual execution, AI agents may inspect the operator-provided results
  or perform read-only verification, but must not retry, repair, or roll back
  migrated data automatically.

## PostgreSQL infrastructure ownership

- PostgreSQL is provided and managed by the existing `aios-infra` stack.
- Never start, stop, recreate, or remove a PostgreSQL container from this
  repository's scripts or Compose configuration.
- The application must connect to the `aios-infra` PostgreSQL instance through
  `DATABASE_URL`. Startup may check that connection and must fail clearly when
  it is unavailable, without attempting to provision a replacement database.

## Implementation boundaries

- Backend application code lives under `backend/app/`.
- Frontend application code lives under `frontend/src/`.
- Product regression tests under `tests/` and `frontend/tests/` are retained
  even when their filenames contain historical iteration numbers.
- Keep secrets in environment variables; do not commit credentials.
- Preserve API compatibility unless the user explicitly requests a breaking
  change.
