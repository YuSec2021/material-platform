#!/usr/bin/env bash
# =============================================================================
# Restart the AI Material Management Platform backend (FastAPI / uvicorn)
# =============================================================================
# Stops the existing backend process (if any) and starts a fresh one with
# environment variables loaded from the project .env file.
#
# Idempotent. Safe to run repeatedly.
#
# Usage:
#   bin/restart-backend.sh                # restart (default)
#   bin/restart-backend.sh start          # start only if not already running
#   bin/restart-backend.sh stop           # stop only
#   bin/restart-backend.sh status         # show process + health
#
# Environment overrides (read first, then defaults):
#   BACKEND_PORT  default 24435
#   DATABASE_URL  if unset, falls back to whatever the .env provides; if
#                 .env is also missing, the backend will start with SQLite
#                 (see backend/app/database.py for that fallback)
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
VENV_PY="$BACKEND_DIR/.venv/bin/python"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/backend.log"
PID_FILE="$LOG_DIR/backend.pid"
BACKEND_PORT="${BACKEND_PORT:-24435}"
HEALTH_URL="http://localhost:${BACKEND_PORT}/health"
READY_URL="http://localhost:${BACKEND_PORT}/docs"

mkdir -p "$LOG_DIR"

# -----------------------------------------------------------------------------
# Helper functions (keep style aligned with init.sh)
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

# Read a single KEY=VALUE from .env without sourcing the file (env files must
# not execute shell code). Returns empty if the key is missing.
read_env_value() {
  local key="$1"
  local env_file="$PROJECT_DIR/.env"
  [[ -f "$env_file" ]] || return 0
  awk -v key="$key" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      if ((substr(value, 1, 1) == "\"" && substr(value, length(value), 1) == "\"") ||
          (substr(value, 1, 1) == "\047" && substr(value, length(value), 1) == "\047")) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
      exit
    }
  ' "$env_file"
}

# Resolve the PID currently bound to the backend port (LISTEN state).
pid_on_port() {
  lsof -tiTCP:"$BACKEND_PORT" -sTCP:LISTEN 2>/dev/null | head -n1 || true
}

is_port_in_use() {
  nc -z 127.0.0.1 "$BACKEND_PORT" &>/dev/null
}

wait_for_port_free() {
  local count=0
  while is_port_in_use; do
    sleep 1
    count=$((count + 1))
    if [[ $count -ge 10 ]]; then
      fail "Port $BACKEND_PORT still busy after 10s; refusing to start."
    fi
  done
}

wait_for_ready() {
  local count=0
  while ! curl -sf "$READY_URL" &>/dev/null; do
    sleep 1
    count=$((count + 1))
    if [[ $count -ge 30 ]]; then
      warn "Backend did not respond on $READY_URL within 30s; check $LOG_FILE"
      return 1
    fi
  done
}

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
need_cmd lsof "lsof (macOS: preinstalled)"
need_cmd nc   "netcat"

if [[ ! -x "$VENV_PY" ]]; then
  fail "Backend venv not found at $VENV_PY. Run 'bash init.sh' first."
fi

# Pick DATABASE_URL: caller env wins, otherwise the project .env.
if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="$(read_env_value DATABASE_URL || true)"
fi

# -----------------------------------------------------------------------------
# Actions
# -----------------------------------------------------------------------------
cmd_start() {
  local existing
  existing="$(pid_on_port)"
  if [[ -n "$existing" ]] || is_port_in_use; then
    info "Backend already running on port $BACKEND_PORT (pid ${existing:-?})."
    return 0
  fi

  info "Starting backend on port $BACKEND_PORT ..."
  if [[ -n "$DATABASE_URL" ]]; then
    info "Using DATABASE_URL: ${DATABASE_URL%%@*}@***"
  else
    warn "DATABASE_URL not set; backend will fall back to SQLite (see backend/app/database.py)."
  fi

  # Launch detached, log -> LOG_FILE, stdio detached from the terminal.
  local -a cmd_env=(PYTHONPATH="$BACKEND_DIR")
  if [[ -n "$DATABASE_URL" ]]; then
    cmd_env+=("DATABASE_URL=$DATABASE_URL")
  fi
  nohup env "${cmd_env[@]}" \
      "$VENV_PY" -m uvicorn app.main:app \
        --host 0.0.0.0 --port "$BACKEND_PORT" \
        >> "$LOG_FILE" 2>&1 &
  local new_pid=$!
  echo "$new_pid" > "$PID_FILE"
  disown "$new_pid" 2>/dev/null || true

  if wait_for_ready; then
    info "Backend ready (pid $new_pid). Health: $HEALTH_URL"
  else
    warn "Backend started (pid $new_pid) but did not become ready. See $LOG_FILE"
  fi
}

cmd_stop() {
  local pid
  pid="$(pid_on_port)"
  if [[ -z "$pid" && -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  fi
  if [[ -z "$pid" ]]; then
    info "No backend process found on port $BACKEND_PORT."
    return 0
  fi
  info "Stopping backend pid $pid ..."
  kill "$pid" 2>/dev/null || warn "kill $pid failed (maybe already gone)"
  local count=0
  while kill -0 "$pid" 2>/dev/null; do
    sleep 1
    count=$((count + 1))
    if [[ $count -ge 10 ]]; then
      warn "pid $pid did not exit in 10s; sending SIGKILL"
      kill -9 "$pid" 2>/dev/null || true
      break
    fi
  done
  rm -f "$PID_FILE"
  wait_for_port_free
  info "Backend stopped."
}

cmd_status() {
  local pid
  pid="$(pid_on_port)"
  if [[ -n "$pid" ]]; then
    info "Backend running on port $BACKEND_PORT (pid $pid)."
    if curl -sf "$HEALTH_URL" &>/dev/null; then
      info "Health: OK ($(curl -sS "$HEALTH_URL"))"
    else
      warn "Health endpoint not responding."
    fi
  else
    info "Backend not running on port $BACKEND_PORT."
    return 1
  fi
}

cmd_restart() {
  cmd_stop || true
  cmd_start
}

# -----------------------------------------------------------------------------
# Entry point
# -----------------------------------------------------------------------------
action="${1:-restart}"
case "$action" in
  start)   cmd_start ;;
  stop)    cmd_stop ;;
  restart) cmd_restart ;;
  status)  cmd_status || exit 1 ;;
  -h|--help|help)
    # Print the top doc-block only. The block sits between the 1st "====" banner
    # (the one after shebang) and the 3rd one (the one just before `set -e`).
    awk '
      /^# =/ { banner++; if (banner == 3) exit; next }
      banner >= 1 { sub(/^# ?/, ""); print }
    ' "$0"
    exit 0
    ;;
  *)
    fail "Unknown action: $action. Use start|stop|restart|status."
    ;;
esac
