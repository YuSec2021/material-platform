#!/usr/bin/env bash
# =============================================================================
# Deploy the AI Material Management Platform to a remote docker host
# =============================================================================
# Synchronises source code to the remote host, rebuilds the affected Docker
# images, and recreates the running containers so they pick up the new code.
#
# Default target is the host reachable via the SSH alias "1" (set REMOTE to
# override), running the docker-compose stack at
# /home/yusec/projects/material_retrieval_dev.
#
# Usage:
#   bin/deploy-to-remote.sh                      # full deploy: all services
#   bin/deploy-to-remote.sh backend              # sync + rebuild + restart backend only
#   bin/deploy-to-remote.sh frontend             # sync + rebuild + restart frontend only
#   bin/deploy-to-remote.sh sync                 # only rsync, no build / restart
#   bin/deploy-to-remote.sh build [SERVICE]      # only docker compose build
#   bin/deploy-to-remote.sh restart [SERVICE]    # only docker compose up -d
#   bin/deploy-to-remote.sh status               # show remote container / image state
#
# Flags (placed after the action):
#   --dry-run      show what would be transferred / built, do not mutate
#   --skip-sync    skip the rsync step
#   --skip-build   skip the docker build step
#   --skip-restart skip the docker compose up -d step
#
# Environment overrides (read first, then defaults):
#   REMOTE         SSH target (alias, user@host, or anything ssh accepts)
#                   default: 1
#   REMOTE_DIR     path to the project on the remote host
#                   default: /home/yusec/projects/material_retrieval_dev
#   COMPOSE_PROJECT_NAME
#                   docker compose project name (must match the remote stack)
#                   default: material_retrieval_dev
# =============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-1}"
REMOTE_DIR="${REMOTE_DIR:-/home/yusec/projects/material_retrieval_dev}"
COMPOSE_PROJECT="${COMPOSE_PROJECT_NAME:-material_retrieval_dev}"

# -----------------------------------------------------------------------------
# Helper functions (keep style aligned with init.sh / restart-backend.sh)
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

# rsync exclude rules. Keep in sync with bin/restart-backend.sh if updated.
# `._*` filters out macOS resource-fork files that often leak from local
# development into a Linux remote.
RSYNC_EXCLUDES=(
  --exclude='.git'
  --exclude='node_modules' --exclude='.venv' --exclude='venv'
  --exclude='__pycache__' --exclude='.mypy_cache'
  --exclude='*.db' --exclude='*.sqlite' --exclude='*.sqlite3'
  --exclude='logs/'
  --exclude='.env'
  --exclude='.idea' --exclude='.DS_Store'
  --exclude='._*'                          # macOS resource forks
  --exclude='playwright-report' --exclude='test-results'
  --exclude='.pytest_cache'
  --exclude='.sprintfoundry' --exclude='.sprintfoundry-orchestrator'
  --exclude='outputs/' --exclude='frontend/dist'
  --exclude='.claude/worktrees'
  --exclude='*.tar.gz'
)

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
need_cmd rsync "rsync (brew install rsync / apt install rsync)"
need_cmd ssh  "openssh-client"

if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$REMOTE" true 2>/dev/null; then
  fail "Cannot reach remote '$REMOTE' over SSH. Check your ~/.ssh/config."
fi

# -----------------------------------------------------------------------------
# Argument parsing
# -----------------------------------------------------------------------------
ACTION="${1:-deploy}"
shift || true

SERVICE="all"
DO_SYNC=1
DO_BUILD=1
DO_RESTART=1
DRY_RUN=0

case "$ACTION" in
  deploy|build|restart|sync|status) ;;
  -h|--help|help)
    awk '
      /^# =/ { banner++; if (banner == 3) exit; next }
      banner >= 1 { sub(/^# ?/, ""); print }
    ' "$0"
    exit 0
    ;;
  *)
    fail "Unknown action: $ACTION. Use deploy|build|restart|sync|status|help."
    ;;
esac

while [[ $# -gt 0 ]]; do
  case "$1" in
    backend|frontend|all) SERVICE="$1" ;;
    --dry-run)            DRY_RUN=1 ;;
    --skip-sync)          DO_SYNC=0 ;;
    --skip-build)         DO_BUILD=0 ;;
    --skip-restart)       DO_RESTART=0 ;;
    *) fail "Unknown flag: $1" ;;
  esac
  shift
done

# -----------------------------------------------------------------------------
# Step implementations
# -----------------------------------------------------------------------------
sync_step() {
  if [[ $DO_SYNC -eq 0 ]]; then
    info "[sync] skipped (--skip-sync)"
    return
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    info "[sync] DRY RUN: rsync $PROJECT_DIR/ -> $REMOTE:$REMOTE_DIR/"
    rsync -avzn "${RSYNC_EXCLUDES[@]}" \
      "$PROJECT_DIR/" "$REMOTE:$REMOTE_DIR/" 2>&1 | tail -10 || true
    return
  fi
  info "[sync] rsync $PROJECT_DIR/ -> $REMOTE:$REMOTE_DIR/"
  rsync -avz "${RSYNC_EXCLUDES[@]}" \
    "$PROJECT_DIR/" "$REMOTE:$REMOTE_DIR/"
  info "[sync] done"
}

services_to_act_on() {
  case "$SERVICE" in
    backend)  echo "backend" ;;
    frontend) echo "frontend" ;;
    all)      echo "backend" "frontend" ;;
    *)        fail "Unknown service: $SERVICE" ;;
  esac
}

build_step() {
  if [[ $DO_BUILD -eq 0 ]]; then
    info "[build] skipped (--skip-build)"
    return
  fi
  for svc in $(services_to_act_on); do
    if [[ $DRY_RUN -eq 1 ]]; then
      info "[build] DRY RUN: docker compose build $svc on $REMOTE"
      continue
    fi
    info "[build] docker compose build $svc on $REMOTE"
    ssh "$REMOTE" "cd $REMOTE_DIR && docker compose build $svc" 2>&1 | tail -8
    info "[build] $svc done"
  done
}

restart_step() {
  if [[ $DO_RESTART -eq 0 ]]; then
    info "[restart] skipped (--skip-restart)"
    return
  fi
  local targets=()
  while read -r svc; do targets+=("$svc"); done < <(services_to_act_on)
  if [[ $DRY_RUN -eq 1 ]]; then
    info "[restart] DRY RUN: docker compose up -d ${targets[*]} on $REMOTE"
    return
  fi
  info "[restart] docker compose up -d ${targets[*]} on $REMOTE"
  ssh "$REMOTE" "cd $REMOTE_DIR && docker compose up -d --remove-orphans ${targets[*]}" 2>&1 | tail -10
  info "[restart] done; waiting 5s for health checks"
  sleep 5
  ssh "$REMOTE" "cd $REMOTE_DIR && docker compose ps" 2>&1
}

status_step() {
  info "Remote container status:"
  ssh "$REMOTE" "cd $REMOTE_DIR && docker compose ps" 2>&1
  info "Image creation times:"
  for svc in backend frontend; do
    created=$(ssh "$REMOTE" "docker inspect ${COMPOSE_PROJECT}-${svc} --format '{{.Created}}' 2>/dev/null" || true)
    info "  ${svc}: ${created:-<unknown>}"
  done
}

# -----------------------------------------------------------------------------
# Dispatch
# -----------------------------------------------------------------------------
case "$ACTION" in
  deploy)
    info "Deploying service(s): $SERVICE"
    sync_step
    build_step
    restart_step
    info "Deploy finished."
    ;;
  sync)   sync_step ;;
  build)  build_step ;;
  restart) restart_step ;;
  status) status_step ;;
esac
