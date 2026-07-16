#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# AI Material Management Platform - Initialization Script
# =============================================================================
# Idempotent startup script for development environment.
# Safe to run repeatedly: kills existing processes, skips unchanged deps.
#
# Prerequisites checked:
#   - Python 3.11+
#   - Node.js 18+ and npm
#   - Docker and Docker Compose (for PostgreSQL + Qdrant)
#   - Git
#
# Exits non-zero on any failure. Each step is isolated and reported.
# =============================================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------
info()  { echo "[INFO]  $*" >&2; }
warn()  { echo "[WARN]  $*" >&2; }
err()   { echo "[ERROR] $*" >&2; }
fail()  { echo "[ERROR] $*" >&2; exit 1; }

need_cmd() {
  if ! command -v "$1" &>/dev/null; then
    fail "Required command not found: $1. Please install $2."
  fi
}

is_port_in_use() {
  nc -z 127.0.0.1 "$1" &>/dev/null
}

kill_on_port() {
  local port="$1"
  local pid
  pid=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -z "$pid" ]] && is_port_in_use "$port"; then
    pid=$(lsof -ti :"$port" 2>/dev/null || true)
  fi
  if [[ -n "$pid" ]]; then
    info "Port $port in use by PID $pid. Killing..."
    kill $pid 2>/dev/null || warn "Unable to kill process on port $port; startup may fail if it remains bound."
    local count=0
    while lsof -tiTCP:"$port" -sTCP:LISTEN &>/dev/null; do
      sleep 1
      count=$((count + 1))
      if [[ $count -ge 10 ]]; then
        warn "Port $port is still in use after waiting; startup may fail if it remains bound."
        break
      fi
    done
  fi
}

stop_pid_file() {
  local pid_file="$1"
  local pid
  [[ -f "$pid_file" ]] || return 0
  pid=$(tr -d '[:space:]' < "$pid_file")
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    info "Stopping previous project process PID $pid..."
    kill "$pid" 2>/dev/null || true
  fi
  rm -f "$pid_file"
}

kill_project_on_port() {
  local port="$1"
  local pid cwd command
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
    command=$(ps -p "$pid" -o command= 2>/dev/null || true)
    if [[ "$cwd" == "$PROJECT_DIR"* || "$command" == *"$PROJECT_DIR"* ]]; then
      info "Stopping project process PID $pid on legacy port $port..."
      kill "$pid" 2>/dev/null || true
    fi
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
}

# -----------------------------------------------------------------------------
# Step 0: Environment sanity check
# -----------------------------------------------------------------------------
info "=== Step 0: Checking environment ==="

if command -v python3.12 &>/dev/null; then
  PYTHON_BIN="$(command -v python3.12)"
else
  PYTHON_BIN="$(command -v python3 || true)"
fi

if [[ -z "$PYTHON_BIN" ]]; then
  fail "Required command not found: python3. Please install Python 3.11+."
fi

need_cmd node "Node.js 18+"
need_cmd docker "Docker"
need_cmd docker-compose "Docker Compose"
need_cmd git "Git"

PY_VERSION=$("$PYTHON_BIN" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')
PY_MAJOR=$("$PYTHON_BIN" -c 'import sys; print(sys.version_info.major)')
PY_MINOR=$("$PYTHON_BIN" -c 'import sys; print(sys.version_info.minor)')
if [[ "$PY_MAJOR" -lt 3 ]] || [[ "$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 11 ]]; then
  fail "Python 3.11+ required, found $PY_VERSION"
fi
info "Python $PY_VERSION OK"

NODE_VERSION=$(node -v)
info "Node $NODE_VERSION OK"
info "Docker: $(docker --version 2>&1 | head -1)"
info "Docker Compose: $(docker-compose --version 2>&1 | head -1)"

# -----------------------------------------------------------------------------
# Step 1: Python virtual environment
# -----------------------------------------------------------------------------
info "=== Step 1: Setting up Python virtual environment ==="

BACKEND_DIR="$PROJECT_DIR/backend"
VENV_DIR="$BACKEND_DIR/.venv"

if [[ ! -d "$VENV_DIR" ]]; then
  info "Creating virtual environment at $VENV_DIR..."
  "$PYTHON_BIN" -m venv --system-site-packages "$VENV_DIR"
else
  info "Virtual environment already exists at $VENV_DIR"
  if ! "$VENV_DIR/bin/python" -c 'import fastapi, pydantic, sqlalchemy, uvicorn, psycopg' &>/dev/null; then
    info "Virtual environment is missing core packages. Recreating with system site packages..."
    rm -rf "$VENV_DIR"
    "$PYTHON_BIN" -m venv --system-site-packages "$VENV_DIR"
  fi
fi

# Activate venv for subsequent python/pip calls
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

info "Checking Python dependencies..."
if python -c 'import fastapi, pydantic, sqlalchemy, uvicorn, psycopg' &>/dev/null; then
  info "Core Python dependencies already available."
else
  info "Installing Python dependencies..."
  if [[ -f "$BACKEND_DIR/requirements.txt" ]]; then
    pip install --quiet -r "$BACKEND_DIR/requirements.txt"
  else
    warn "No requirements.txt found in $BACKEND_DIR. Installing core packages directly."
    pip install --quiet \
      fastapi==0.128.0 \
      uvicorn[standard]==0.30.0 \
      pydantic==2.9.0 \
      sqlalchemy==2.0.35 \
      'psycopg[binary]==3.2.3' \
      python-multipart==0.0.12 \
      openpyxl==3.1.5 \
      pandas==2.3.0 \
      structlog==24.4.0 \
      redis==5.2.0 \
      httpx==0.27.2
  fi
fi

info "Python dependencies installed."

# -----------------------------------------------------------------------------
# Step 2: Frontend dependencies
# -----------------------------------------------------------------------------
info "=== Step 2: Setting up frontend ==="

FRONTEND_DIR="$PROJECT_DIR/frontend"

# The root package.json (if present) is for Playwright e2e tests, not for
# runtime — it references a local file:tools/playwright-test-adapter that
# isn't part of the deployment. We do not run `npm install` at the project
# root: the application has no runtime npm dependencies at this level.
# The frontend lives in $FRONTEND_DIR and has its own
# package.json handled below.

if [[ ! -d "$FRONTEND_DIR" ]]; then
  info "Creating frontend directory..."
  mkdir -p "$FRONTEND_DIR"
  info "Frontend directory created (scaffold to be implemented)"
else
  info "Frontend directory exists at $FRONTEND_DIR"
fi

if [[ -f "$FRONTEND_DIR/package.json" ]]; then
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    info "Installing frontend npm dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
  else
    info "Frontend node_modules already exist"
  fi
else
  warn "No package.json found in $FRONTEND_DIR. Skipping npm install."
fi

# -----------------------------------------------------------------------------
# Step 3: Docker services (PostgreSQL + Qdrant)
# -----------------------------------------------------------------------------
info "=== Step 3: Starting Docker services ==="

DOCKER_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
COMPOSE_PROJECT_NAME="ai-material-platform"

# Port overrides (customizable via env). Defaults match the in-container ports
# exposed on the host by docker-compose.yml.
POSTGRES_PORT=${POSTGRES_PORT:-5432}
QDRANT_HTTP_PORT=${QDRANT_HTTP_PORT:-6333}
QDRANT_GRPC_PORT=${QDRANT_GRPC_PORT:-6334}

# Export so docker-compose ${VAR} substitution picks them up
export POSTGRES_PORT QDRANT_HTTP_PORT QDRANT_GRPC_PORT

if [[ -f "$DOCKER_COMPOSE_FILE" ]]; then
  # Check if Docker daemon is running
  if ! docker info &>/dev/null; then
    warn "Docker daemon is not running. Skipping PostgreSQL and Qdrant containers."
    warn "Local development will use SQLite unless DATABASE_URL points to an external database."
  else
    info "Using docker-compose file: $DOCKER_COMPOSE_FILE"

    # If a Postgres or Qdrant container is already serving the requested ports
    # under any compose project, reuse it instead of starting a new one (avoids
    # Bind-for-0.0.0.0:NNNN port-is-already-allocated errors when another
    # compose project is already managing those services). We check the host
    # port directly via nc — this catches both single-port mappings
    # ("0.0.0.0:5432->5432/tcp") and port-range mappings ("0.0.0.0:6333-6334->...").
    POSTGRES_RUNNING=""
    QDRANT_RUNNING=""
    if is_port_in_use "$POSTGRES_PORT"; then
      POSTGRES_RUNNING="yes"
    fi
    if is_port_in_use "$QDRANT_HTTP_PORT"; then
      QDRANT_RUNNING="yes"
    fi

    if [[ -n "$POSTGRES_RUNNING" && -n "$QDRANT_RUNNING" ]]; then
      info "PostgreSQL and Qdrant already running on requested ports; reusing existing containers."
    else
      # Stop existing containers for idempotency (only for our own project)
      (cd "$PROJECT_DIR" && docker-compose -p "$COMPOSE_PROJECT_NAME" down 2>/dev/null || true)

      info "Starting PostgreSQL (host port $POSTGRES_PORT) and Qdrant (HTTP $QDRANT_HTTP_PORT / gRPC $QDRANT_GRPC_PORT) containers..."
      cd "$PROJECT_DIR"
      docker-compose -p "$COMPOSE_PROJECT_NAME" up -d postgres qdrant
    fi

    info "Waiting for PostgreSQL to be ready..."
    # Discover whichever container is actually serving $POSTGRES_PORT
    # (could be ours under $COMPOSE_PROJECT_NAME, or a pre-existing one).
    PG_CONTAINER="$(docker ps --filter "publish=${POSTGRES_PORT}" --format '{{.Names}}' | head -1 || true)"
    max_wait=30
    count=0
    while ! docker exec "${PG_CONTAINER:-${COMPOSE_PROJECT_NAME}-postgres-1}" pg_isready -U material -d material_retrieval &>/dev/null 2>&1; do
      sleep 1
      count=$((count + 1))
      if [[ $count -ge $max_wait ]]; then
        fail "PostgreSQL failed to start within ${max_wait}s"
      fi
    done
    info "PostgreSQL is ready."

    info "Waiting for Qdrant to be ready..."
    count=0
    while ! curl -sf "http://localhost:${QDRANT_HTTP_PORT}/healthz" &>/dev/null && ! curl -sf "http://localhost:${QDRANT_HTTP_PORT}/health" &>/dev/null; do
      sleep 1
      count=$((count + 1))
      if [[ $count -ge $max_wait ]]; then
        warn "Qdrant health check failed (may still be starting). Proceeding..."
        break
      fi
    done
    info "Qdrant check complete."
  fi
else
  warn "No docker-compose.yml found. Skipping Docker services."
  warn "To run without Docker, ensure PostgreSQL (5432) and Qdrant (6333) are available externally."
fi

# -----------------------------------------------------------------------------
# Step 4: Database migrations
# -----------------------------------------------------------------------------
info "=== Step 4: Running database migrations ==="

if [[ -d "$BACKEND_DIR" ]] && [[ -f "$BACKEND_DIR/alembic.ini" || -f "$BACKEND_DIR/migrations/alembic.ini" ]]; then
  info "Alembic configuration found. Running migrations..."
  (cd "$BACKEND_DIR" && \
    PYTHONPATH="$BACKEND_DIR" alembic upgrade head 2>/dev/null || \
    info "Migrations skipped (tables may already exist or alembic not configured)")
else
  if [[ -f "$BACKEND_DIR/app/database.py" ]]; then
    info "Running database table creation via SQLAlchemy..."
    (cd "$BACKEND_DIR" && \
      PYTHONPATH="$BACKEND_DIR" python -c "
from app.database import engine, Base
from app import models
Base.metadata.create_all(bind=engine)
print('Database tables created.')
" 2>/dev/null || info "Database init skipped (may require running backend first)")
  else
    info "No database init script found. Skipping."
  fi
fi

# -----------------------------------------------------------------------------
# Step 5: Start backend server
# -----------------------------------------------------------------------------
info "=== Step 5: Starting backend server ==="

BACKEND_PORT=${BACKEND_PORT:-24334}
mkdir -p "$PROJECT_DIR/logs"
stop_pid_file "$PROJECT_DIR/logs/backend.pid"
stop_pid_file "$PROJECT_DIR/logs/frontend.pid"
kill_project_on_port 8000
kill_project_on_port 5173
kill_on_port "$BACKEND_PORT"

if [[ -d "$BACKEND_DIR" ]] && [[ -f "$BACKEND_DIR/main.py" || -f "$BACKEND_DIR/app/main.py" ]]; then
  info "Starting FastAPI backend on port $BACKEND_PORT..."
  mkdir -p "$PROJECT_DIR/logs"

  # Determine main app path
  if [[ -f "$BACKEND_DIR/app/main.py" ]]; then
    BACKEND_MAIN="$BACKEND_DIR/app/main.py"
  elif [[ -f "$BACKEND_DIR/main.py" ]]; then
    BACKEND_MAIN="$BACKEND_DIR/main.py"
  else
    warn "No main.py found. Backend will not be started."
    BACKEND_MAIN=""
  fi

  if [[ -n "$BACKEND_MAIN" ]]; then
    BACKEND_PID=$(PYTHONPATH="$BACKEND_DIR" "$VENV_DIR/bin/python" - "$VENV_DIR/bin/python" "$BACKEND_DIR" "$BACKEND_PORT" "$PROJECT_DIR/logs/backend.log" "$POSTGRES_PORT" "$QDRANT_HTTP_PORT" <<'PY'
import os
import subprocess
import sys

python_bin, backend_dir, port, log_path, postgres_port, qdrant_http_port = sys.argv[1:]
env = os.environ.copy()
env["PYTHONPATH"] = backend_dir

# DATABASE_URL / QDRANT_URL are opt-in: only inject when the user explicitly
# sets USE_POSTGRES=1 / USE_QDRANT=1. By default the backend uses the SQLite
# database shipped in the deployment package (backend/material_retrieval.db),
# which is what the production data lives in. Pointing the backend at the
# local Postgres container by default would silently drop the user onto an
# empty database and make every API call 404.
if not env.get("DATABASE_URL") and env.get("USE_POSTGRES") == "1":
    import socket
    try:
        with socket.create_connection(("localhost", int(postgres_port)), timeout=1):
            postgres_up = True
    except Exception:
        postgres_up = False
    if postgres_up:
        env["DATABASE_URL"] = (
            f"postgresql+psycopg://material:material_password@localhost:"
            f"{postgres_port}/material_retrieval"
        )

if not env.get("QDRANT_URL") and env.get("USE_QDRANT") == "1":
    import socket
    try:
        with socket.create_connection(("localhost", int(qdrant_http_port)), timeout=1):
            qdrant_up = True
    except Exception:
        qdrant_up = False
    if qdrant_up:
        env["QDRANT_URL"] = f"http://localhost:{qdrant_http_port}"

log_file = open(log_path, "ab", buffering=0)
process = subprocess.Popen(
    [python_bin, "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", port],
    cwd=backend_dir,
    env=env,
    stdin=subprocess.DEVNULL,
    stdout=log_file,
    stderr=subprocess.STDOUT,
    start_new_session=True,
    close_fds=True,
)
print(process.pid)
PY
)
    echo "$BACKEND_PID" > "$PROJECT_DIR/logs/backend.pid"
    info "Backend started with PID $BACKEND_PID"

    # Wait for backend to be ready
    info "Waiting for backend API to be ready..."
    count=0
    backend_ready=false
    while ! curl -sf "http://localhost:$BACKEND_PORT/docs" &>/dev/null; do
      sleep 1
      count=$((count + 1))
      if [[ $count -ge 20 ]]; then
        fail "Backend API did not respond within 20s. Check logs/backend.log"
        break
      fi
    done
    backend_ready=true
    info "Backend API is responding."
  fi
else
  warn "Backend source not found. Skipping backend start."
fi

# -----------------------------------------------------------------------------
# Step 6: Start frontend dev server
# -----------------------------------------------------------------------------
info "=== Step 6: Starting frontend dev server ==="

FRONTEND_PORT=${FRONTEND_PORT:-24333}
kill_on_port "$FRONTEND_PORT"

if [[ -d "$FRONTEND_DIR" ]] && [[ -f "$FRONTEND_DIR/package.json" ]]; then
  info "Starting Vite dev server on port $FRONTEND_PORT..."

  mkdir -p "$PROJECT_DIR/logs"

  FRONTEND_PID=$(python - "$FRONTEND_DIR" "$FRONTEND_PORT" "$PROJECT_DIR/logs/frontend.log" <<'PY'
import os
import subprocess
import sys

frontend_dir, port, log_path = sys.argv[1:]
log_file = open(log_path, "ab", buffering=0)
process = subprocess.Popen(
    ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", port],
    cwd=frontend_dir,
    env=os.environ.copy(),
    stdin=subprocess.DEVNULL,
    stdout=log_file,
    stderr=subprocess.STDOUT,
    start_new_session=True,
    close_fds=True,
)
print(process.pid)
PY
)
  echo "$FRONTEND_PID" > "$PROJECT_DIR/logs/frontend.pid"
  info "Frontend started with PID $FRONTEND_PID"

  # Wait for frontend to be ready
  info "Waiting for frontend to be ready..."
  count=0
  while ! curl -sf "http://localhost:$FRONTEND_PORT" &>/dev/null; do
    sleep 1
    count=$((count + 1))
    if [[ $count -ge 15 ]]; then
      warn "Frontend did not respond within 15s. Check logs/frontend.log"
      break
    fi
  done
  info "Frontend is ready."
else
  warn "Frontend package.json not found. Skipping frontend start."
fi

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
info ""
info "============================================================"
info "  AI Material Management Platform - Startup Complete"
info "============================================================"
info ""
info "  Backend:  http://localhost:$BACKEND_PORT"
info "  API Docs: http://localhost:$BACKEND_PORT/docs"
info "  Frontend: http://localhost:$FRONTEND_PORT"
info ""
info "  Logs:"
info "    Backend:  $PROJECT_DIR/logs/backend.log"
info "    Frontend: $PROJECT_DIR/logs/frontend.log"
info ""
info "  Process PIDs:"
[[ -f "$PROJECT_DIR/logs/backend.pid" ]] && info "    Backend:  $(cat "$PROJECT_DIR/logs/backend.pid")"
[[ -f "$PROJECT_DIR/logs/frontend.pid" ]] && info "    Frontend: $(cat "$PROJECT_DIR/logs/frontend.pid")"
info ""
info "  Docker containers:"
docker ps --filter "name=${COMPOSE_PROJECT_NAME}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || true
info ""
info "  To stop: docker-compose -p $COMPOSE_PROJECT_NAME down"
info "============================================================"
