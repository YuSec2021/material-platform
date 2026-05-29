# AI Material Management Platform

Enterprise material standardization and lifecycle management platform with FastAPI, a browser UI, PostgreSQL-ready deployment, Qdrant service wiring, and Playwright smoke verification.

## Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop with Docker Compose
- Playwright browsers: `npx playwright install chromium`

## Local Development

Start the local development stack:

```bash
bash init.sh
```

The script installs Python and frontend dependencies, starts PostgreSQL and Qdrant from `docker-compose.yml`, initializes backend tables and seed data, then starts:

- Frontend: `http://localhost:5173`
- Backend API docs: `http://localhost:8000/docs`
- Backend health: `http://localhost:8000/health`

Stop local services:

```bash
docker compose -p ai-material-platform down
kill "$(cat logs/backend.pid)" "$(cat logs/frontend.pid)" 2>/dev/null || true
```

## Private Deployment With Docker Compose

Build and start the private化 deployment:

```bash
docker compose up -d --build
```

This starts:

- `postgres` on `localhost:5432`
- `qdrant` on `localhost:6333`
- `backend` on `http://localhost:8000`
- `frontend` on `http://localhost:5173`
- `nginx` production entrypoint on `http://localhost`

Verify services:

```bash
docker compose ps
curl -fsS http://localhost:8000/docs >/dev/null
curl -fsS http://localhost:5173 >/dev/null
```

Restart without manual database initialization:

```bash
docker compose down
docker compose up -d
```

Shutdown and remove volumes when a clean database is required:

```bash
docker compose down -v
```

## Production Nginx Entrypoint

`nginx.conf` serves one HTTP entrypoint at `http://localhost` in the Compose deployment:

- Frontend routes: `http://localhost/materials`, `http://localhost/system/config`
- API routes: `http://localhost/api/v1/materials`
- API docs: `http://localhost/docs`
- Health: `http://localhost/health`

The frontend automatically uses `/api/v1` when served through Nginx, and `http://localhost:8000/api/v1` during local port `5173` development.

## Environment Variables

- `DATABASE_URL`: SQLAlchemy URL. Compose uses `postgresql+psycopg://material:material_password@postgres:5432/material_retrieval`; local development defaults to SQLite if unset.
- `QDRANT_URL`: vector database URL, defaulted to `http://qdrant:6333` in Compose.
- `LLM_GATEWAY_AES_KEY`: optional AES key seed for encrypted provider secrets.
- `AI_DEBUG`: enables trace debug UI when set to `true`.
- `E2E_BASE_URL`: Playwright frontend URL, default `http://localhost:5173`.
- `E2E_API_URL`: Playwright backend URL, default `http://localhost:8000`.

## E2E Verification

Start the system first:

```bash
bash init.sh
```

Run the browser smoke suite from the repository root:

```bash
npx playwright test
```

Open the HTML report:

```bash
npx playwright show-report
```

The smoke tests cover standard management, material management, workflow pages, user and role administration, system configuration, audit logs, LLM gateway UI availability, a harmless persisted reason-option update, and OpenAPI route availability.

To prove the suite fails when the backend is down, stop the backend and run the negative smoke:

```bash
kill "$(cat logs/backend.pid)"
E2E_EXPECT_BACKEND_DOWN=1 npx playwright test tests/e2e/backend-down.spec.js
```

## Troubleshooting

- Occupied ports: stop old processes with `lsof -ti :8000 :5173 | xargs kill` and run `docker compose down`.
- Docker daemon unavailable: start Docker Desktop, then retry `bash init.sh` or `docker compose up -d --build`.
- Database connectivity: check `docker compose ps postgres`, then run `docker compose logs postgres backend`.
- Qdrant startup: check `docker compose ps qdrant` and `curl http://localhost:6333/healthz`.
- Playwright browser missing: run `npx playwright install chromium`.
- Blank frontend or API errors: open browser dev tools, confirm `http://localhost:8000/docs` or `http://localhost/docs` is reachable, then inspect `logs/backend.log` and `logs/frontend.log`.
