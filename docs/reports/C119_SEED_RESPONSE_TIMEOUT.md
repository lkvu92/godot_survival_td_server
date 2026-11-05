# C119 VPS atomic seed response timeout

Date: 2026-11-05. Version: 1.1.1. Technical acceptance: PASS.

The VPS Nakama 3.24.2 HTTP write deadline defaulted to 10000 ms. A 4644054-byte full-catalog atomic seed exceeded it: database writes committed but the CLI received RemoteDisconnected, and publication was never called.

## Evidence
The production containers were healthy, restart count zero and OOMKilled false. The original seed transaction began at 15:32:35 UTC; the active release was still 19. A validation-only bundle with an invalid final request completed in 3.073s and did not execute the compiled seed transaction.

An isolated database copied from the VPS and a temporary Nakama container reproduced the full request on the same machine:

| HTTP write deadline | Duration | Result |
|---|---|---|
|10000 ms|12.391s|RemoteDisconnected|
|120000 ms|11.010s|success=true, atomic=true|

The diagnostic database, container and files were removed afterwards. No production mutation occurred during reproduction.

## Correction and rollout
Public socket config now sets write_timeout_ms=120000. Seed client defaults to 180s, and a transport error explicitly reports uncertain commit state and directs operators to inspect server timeout/readback before retrying. No automatic retry, SQL transaction change or publication bypass.

Two VPS files were backed up under `nakama/seed-timeout-backup-20261105T153922Z/`, then updated: data/local.yml and seed_all.py. Only Nakama was restarted. `deploy.sh seed --publish` completed successfully: every bundle row count verified atomically, config version 20 published and publication verified. Player/server/financial tables were not targeted by this command.

## Tests
26 seed CLI tests, 10 private-runtime config tests and 15 deployment argument tests PASS. Regression covers client/server timeout budget and credential-safe uncertain-commit diagnostics without retry. No TypeScript/runtime build required for these Python/YAML changes.
