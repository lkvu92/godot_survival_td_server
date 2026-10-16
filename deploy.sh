#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Survival TD - VPS Deployment & Management Script
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAKAMA_DIR="${SCRIPT_DIR}/nakama"

cd "${NAKAMA_DIR}"

ensure_secrets() {
    if [ ! -f "iap.secret.yml" ]; then
        echo "[INFO] Creating iap.secret.yml from iap.secret.example.yml..."
        cp iap.secret.example.yml iap.secret.yml
    fi

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            echo "[INFO] Creating .env from .env.example..."
            cp .env.example .env
        fi
    fi
}

wait_for_nakama() {
    echo "[INFO] Waiting for Nakama server to become healthy..."
    local max_attempts=30
    local attempt=1
    until curl -s -f "http://127.0.0.1:7350/healthcheck" > /dev/null 2>&1; do
        if [ "$attempt" -ge "$max_attempts" ]; then
            echo "[ERROR] Nakama healthcheck timed out after ${max_attempts}s."
            docker compose logs nakama
            exit 1
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    echo "[OK] Nakama server is healthy and responding."
}

cmd_start() {
    ensure_secrets
    python3 configure_runtime.py
    echo "[INFO] Starting Survival TD stack (PostgreSQL, Nakama, Monetization Verifier)..."
    docker compose up -d --build
    wait_for_nakama
}

cmd_stop() {
    echo "[INFO] Stopping containers..."
    docker compose down
}

cmd_restart() {
    ensure_secrets
    python3 configure_runtime.py
    cmd_stop
    cmd_start
}

cmd_seed() {
    echo "[INFO] Seeding game configurations into PostgreSQL via Nakama..."
    python3 configure_runtime.py --seed
}

cmd_build() {
    echo "[INFO] Compiling TypeScript runtime modules..."
    npm ci
    npm run build
}

cmd_logs() {
    docker compose logs -f "${1:-}"
}

cmd_health() {
    echo "[INFO] Checking Nakama health endpoint..."
    curl -s "http://127.0.0.1:7350/healthcheck" && echo ""
    echo "[INFO] Docker container status:"
    docker compose ps
}

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
ACTION="${1:-deploy}"

case "${ACTION}" in
    deploy|up|start)
        cmd_start
        echo ""
        cmd_seed
        echo ""
        echo "=== [SUCCESS] Survival TD Stack deployed and seeded successfully! ==="
        ;;
    stop|down)
        cmd_stop
        ;;
    restart)
        cmd_restart
        ;;
    seed)
        cmd_seed
        ;;
    build)
        cmd_build
        ;;
    logs)
        cmd_logs "${2:-}"
        ;;
    status|health)
        cmd_health
        ;;
    *)
        echo "Usage: $0 {deploy|start|stop|restart|seed|build|logs|status}"
        exit 1
        ;;
esac
