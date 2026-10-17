# C131 — Docker runtime build during deployment

- Version: `1.0.0`
- Status: `IN_PROGRESS`
- Date: `2026-10-17`

## Contract

`deploy.sh build` runs `npm ci && npm run build` in `node:20-bookworm-slim` with the host user's UID:GID and `nakama/` mounted at `/workspace`, then runs `node verify_runtime.cjs` in the same image. `deploy`, `start`, and `restart` invoke this build and verification before starting or stopping any service. A failed build or verification stops deployment before container changes or seeding. Host Node.js and npm are not required. `seed` remains a separate command and does not compile runtime code.

Data schema: no gameplay JSON or database schema change. RPC request/response: unchanged. Interface: `./deploy.sh {build|deploy|start|restart}`. Offline fallback: none; invalid runtime blocks deployment and existing online-only gameplay rules remain in force.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-17 | Build and verify the mounted Nakama runtime in Docker before deployment. |
