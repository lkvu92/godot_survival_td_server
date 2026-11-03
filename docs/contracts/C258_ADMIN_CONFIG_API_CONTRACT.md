# C258 — Admin System Config API & Publication Contract

Version: 1.0.0
Status: ACTIVE
Updated: 2026-11-03

## 1. Overview
Defines the authoritative Next.js BFF and Nakama RPC contracts for runtime game configuration management, settings storage, publication integrity validation, and instant rollback.

## 2. API Endpoints (Next.js BFF /api/admin/config/*)

| Method | BFF Endpoint | Upstream Nakama RPC | Auth | Description |
|---|---|---|---|---|
| `GET` | `/api/admin/config` | `admin_config_get` | Admin | Returns DB settings, active release snapshot, and 20 recent releases |
| `PUT` | `/api/admin/config` | `admin_config_update` | Admin | Batch or single upsert into `remote_config_settings` |
| `POST` | `/api/admin/config/toggle` | `admin_config_toggle` | Admin | Activates/deactivates setting by key (`is_active: bool`) |
| `POST` | `/api/admin/config/validate` | `admin_config_validate` | Admin | Validates settings snapshot against business rules (returns 422 if invalid) |
| `POST` | `/api/admin/config/publish` | `publish_config_release` | Admin | Compiles active settings snapshot, increments `config_version` |
| `POST` | `/api/admin/config/rollback` | `admin_config_rollback` | Admin | Restores settings from prior release version and publishes new release |

## 3. Standard Response Format
```json
{
  "status": "ok | error",
  "message": "Human readable status description",
  "data": { ... }
}
```

## 4. Security & Authorization
- Caller session verified via `readSession()` in Next.js (`session.role === 'admin'`).
- Upstream Nakama RPC guarded by `isConfigAdmin(ctx)` comparing against `CONFIG_ADMIN_USER_ID`. Non-admin caller receives gRPC code 7 (403 PERMISSION_DENIED).
- CSRF protection via `isSameOrigin(req)` on all state-mutating requests (`POST`, `PUT`).

## 5. Acceptance & Verification
- Unit & static audit: `server/tests/test_admin_rpc_guard.cjs` PASS (33 admin RPCs).
- Live Nakama RPC test: `server/tests/verify_admin_config_rpcs.cjs` PASS (7/7 tests).
- End-to-end curl REST test: `server/tests/verify_admin_config_api_curl.cjs` PASS (6/6 APIs).

