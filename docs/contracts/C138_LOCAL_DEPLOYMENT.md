# C138 Local deployment

Version: 1.0.0  
Status: IN_PROGRESS  
Date: 2026-10-19

## Contract

`deploylocal.ps1` runs PostgreSQL, Nakama and the monetization verifier in an
isolated Docker Compose project (`survival_td_local`). Its configuration comes
from `nakama/.env.local`, `nakama/docker-compose.local.yml` and generated
`nakama/runtime.local.secret.yml`. First run generates unique local credentials
from the tracked placeholder template. It never reads or writes the production
`.env`, `runtime.secret.yml`, `docker-compose.yml` or `deploy.sh` configuration.
The local stack has its own database volume and default network, with no VPS
proxy network. All published ports bind to loopback.

The local script builds and verifies the same TypeScript runtime as deployment,
waits for Nakama health, and seeds the local instance. Missing credentials or
Docker failures abort before seeding. The local environment is `develop`.
Gameplay data remains authoritative in the local Nakama database; there is no
offline gameplay fallback. RPC and data schemas are unchanged.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-19 | Add isolated Windows local Compose deployment and local secret rendering. |

## Verification

Local Docker deployment, Nakama HTTP healthcheck, and full configuration seed
succeeded. Compose validation, PowerShell parsing and seven runtime-secret tests
passed. The repository-wide static suite stopped because the referenced
`tests/test_new_profile_inventory.cjs` file is absent from this checkout;
earlier checks in that suite passed. Gate 4 remains pending that repository
test issue.
