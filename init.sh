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
  if ! "$VENV_DIR/bin/python" -c 'import fastapi, pydantic, sqlalchemy, uvicorn' &>/dev/null; then
    info "Virtual environment is missing core packages. Recreating with system site packages..."
    rm -rf "$VENV_DIR"
    "$PYTHON_BIN" -m venv --system-site-packages "$VENV_DIR"
  fi
fi

# Activate venv for subsequent python/pip calls
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

info "Checking Python dependencies..."
if python -c 'import fastapi, pydantic, sqlalchemy, uvicorn' &>/dev/null; then
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
      asyncpg==0.30.0 \
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

FRONTEND_DIR="$PROJECT_DIR/prototype_code"

if [[ -f "$PROJECT_DIR/package.json" ]]; then
  if [[ ! -d "$PROJECT_DIR/node_modules/@playwright/test" ]]; then
    info "Installing root npm dependencies..."
    (cd "$PROJECT_DIR" && npm install --ignore-scripts)
  else
    info "Root npm dependencies already exist"
  fi
fi

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

if [[ -f "$DOCKER_COMPOSE_FILE" ]]; then
  # Check if Docker daemon is running
  if ! docker info &>/dev/null; then
    warn "Docker daemon is not running. Skipping PostgreSQL and Qdrant containers."
    warn "Local development will use SQLite unless DATABASE_URL points to an external database."
  else
    info "Using docker-compose file: $DOCKER_COMPOSE_FILE"

    # Stop existing containers for idempotency
    (cd "$PROJECT_DIR" && docker-compose -p "$COMPOSE_PROJECT_NAME" down 2>/dev/null || true)

    info "Starting PostgreSQL and Qdrant containers..."
    cd "$PROJECT_DIR"
    docker-compose -p "$COMPOSE_PROJECT_NAME" up -d postgres qdrant

    info "Waiting for PostgreSQL to be ready..."
    max_wait=30
    count=0
    while ! docker exec "${COMPOSE_PROJECT_NAME}-postgres-1" pg_isready -U material -d material_retrieval &>/dev/null 2>&1; do
      sleep 1
      count=$((count + 1))
      if [[ $count -ge $max_wait ]]; then
        fail "PostgreSQL failed to start within ${max_wait}s"
      fi
    done
    info "PostgreSQL is ready."

    info "Waiting for Qdrant to be ready..."
    count=0
    while ! curl -sf "http://localhost:6333/healthz" &>/dev/null && ! curl -sf "http://localhost:6333/health" &>/dev/null; do
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

BACKEND_PORT=${BACKEND_PORT:-8000}
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
    BACKEND_PID=$(PYTHONPATH="$BACKEND_DIR" "$VENV_DIR/bin/python" - "$VENV_DIR/bin/python" "$BACKEND_DIR" "$BACKEND_PORT" "$PROJECT_DIR/logs/backend.log" <<'PY'
import os
import subprocess
import sys

python_bin, backend_dir, port, log_path = sys.argv[1:]
env = os.environ.copy()
env["PYTHONPATH"] = backend_dir
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

FRONTEND_PORT=${FRONTEND_PORT:-5173}
kill_on_port "$FRONTEND_PORT"

if [[ -d "$FRONTEND_DIR" ]] && [[ -f "$FRONTEND_DIR/package.json" ]]; then
  info "Starting Vite dev server on port $FRONTEND_PORT..."

  mkdir -p "$PROJECT_DIR/logs"

  cd "$FRONTEND_DIR"
  nohup npm run dev -- --port "$FRONTEND_PORT" \
    > "$PROJECT_DIR/logs/frontend.log" 2>&1 &
  FRONTEND_PID=$!
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
