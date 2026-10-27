#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Survival TD - VPS Deployment & Management Script
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAKAMA_DIR="${SCRIPT_DIR}/nakama"

cd "${NAKAMA_DIR}"
IDENTITY_ENABLED=false
PROFILE_ARGS=()

select_identity_profile() {
    local profile
    profile="$(python3 identity_config.py)"
    case "$profile" in
        identity) IDENTITY_ENABLED=true; PROFILE_ARGS=(--profile identity) ;;
        none) IDENTITY_ENABLED=false; PROFILE_ARGS=() ;;
        *) echo "[ERROR] Invalid identity profile inspection result."; exit 1 ;;
    esac
    echo "[INFO] Account identity enabled: ${IDENTITY_ENABLED}"
}

wait_for_identity() {
    if [ "$IDENTITY_ENABLED" != true ]; then return; fi
    local attempt
    for attempt in $(seq 1 30); do
        if docker compose --profile identity exec -T account-identity node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
            echo "[OK] Account identity is healthy."
            if [ "${1:-verify}" = verify ]; then
                docker compose --profile identity exec -T account-identity node src/verify-smtp.js
            fi
            return
        fi
        sleep 1
    done
    echo "[ERROR] Account identity healthcheck failed; inspect logs account-identity."
    return 1
}

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

start_services() {
    ensure_secrets
    select_identity_profile
    python3 configure_runtime.py
    echo "[INFO] Starting Survival TD stack and enabled identity service..."
    docker compose "${PROFILE_ARGS[@]}" up -d --build
    # Mounted JavaScript and runtime secrets require a fresh Nakama process.
    docker compose "${PROFILE_ARGS[@]}" up -d --no-deps --force-recreate nakama
    wait_for_nakama
    wait_for_identity
}

cmd_start() {
    cmd_build
    start_services
}

cmd_stop() {
    echo "[INFO] Stopping containers..."
    docker compose --profile identity down
}

cmd_restart() {
    cmd_build
    cmd_stop
    start_services
}

cmd_seed() {
    echo "[INFO] Seeding game configurations into PostgreSQL via Nakama..."
    python3 configure_runtime.py --seed -- "$@"
}

cmd_publish() {
    local option
    for option in "$@"; do
        if [ "$option" = '--publish' ]; then
            cmd_seed "$@"
            return
        fi
    done
    cmd_seed --publish "$@"
}

cmd_build() {
    echo "[INFO] Compiling TypeScript runtime modules..."
    docker run --rm \
        --user "$(id -u):$(id -g)" \
        -v "${NAKAMA_DIR}:/workspace" \
        -w /workspace \
        node:20-bookworm-slim \
        sh -lc 'npm ci && npm run build'
    echo "[INFO] Verifying freshly built runtime artifact..."
    docker run --rm \
        --user "$(id -u):$(id -g)" \
        -v "${NAKAMA_DIR}:/workspace" \
        -w /workspace \
        node:20-bookworm-slim \
        node verify_runtime.cjs
}

cmd_logs() {
    if [ -n "${1:-}" ]; then docker compose --profile identity logs -f "$1";
    else docker compose --profile identity logs -f; fi
}

cmd_health() {
    select_identity_profile
    echo "[INFO] Checking Nakama health endpoint..."
    curl -s "http://127.0.0.1:7350/healthcheck" && echo ""
    echo "[INFO] Docker container status:"
    docker compose --profile identity ps
    wait_for_identity health
}

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
ACTION="${1:-deploy}"
if [ "$#" -gt 0 ]; then
    shift
fi

case "${ACTION}" in
    deploy|up|start)
        cmd_start
        echo ""
        cmd_publish "$@"
        python3 configure_runtime.py --seed -- --check-active
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
        cmd_seed "$@"
        ;;
    publish)
        cmd_publish "$@"
        ;;
    build)
        cmd_build
        ;;
    logs)
        cmd_logs "${1:-}"
        ;;
    status|health)
        cmd_health
        ;;
    *)
        echo "Usage: $0 {deploy|start|stop|restart|seed|publish|build|logs|status} [seed options]"
        echo "Example: $0 publish [--settings FILE]"
        exit 1
        ;;
esac
