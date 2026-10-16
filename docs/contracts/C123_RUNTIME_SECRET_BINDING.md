# C123 Runtime secret binding

Version: 1.0.0
Status: ACTIVE
Date: 2026-10-16

The existing nakama/.env is the deployment source for Nakama socket, console,
session and verifier bridge keys. Never copy actual values into tracked files,
console output, exception text, command arguments or shell tracing. Preserve all
existing .env values. No production restart, key rotation or remote secret upload
is performed by this implementation.

## Schema and interfaces

configure_runtime.py resolves Docker Compose configuration in memory and writes
an ignored runtime.secret.yml (JSON-compatible YAML) with database.address,
socket.server_key, console username/password/signing_key/mfa.storage_encryption_key,
session encryption_key/refresh_encryption_key and runtime.http_key/env. Required
secret values must be explicit and nonempty. Runtime env contains environment,
package name, config administrator, verifier secret/URL and AdMob unit IDs.
Database credentials are passed via config, never shell command interpolation.
The generated file replaces atomically and uses owner-only permissions on POSIX.
Windows inherits the workspace ACL. Failures print a generic error, never raw
Compose output. No fallback credentials or generated replacement keys.

Compose passes matching HTTP key/verifier secret to both services. deploy.sh
generates the secret config before start/restart and --seed passes the matching HTTP key to seed_all.py in the child process environment; direct compose users must run
the generator first. Nakama reads it last, after base and IAP config. Shell xtrace
is disabled. Bind addresses follow the existing .env bind variables.

RPC schemas and gameplay data are unchanged. Offline fallback is prohibited by
C121. No UI/assets change. Tests use synthetic secrets only and verify mapping,
required-key rejection, omission of secret values from errors and private output.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-16 | Bind existing .env keys into private runtime config and verifier without logging values. |


## Local acceptance
Gate 1: contract, registry and index registered before code changes. Gate 2:
Compose resolution and private rendering from the existing local .env passed;
no TypeScript changes. Gate 3: no presentation changes. Gate 4: server static
suite and 14 Python regressions pass, bash -n deploy.sh passes, and Git ignore
and actual-key absence checks pass. Local score: 8/10. A local Nakama image was
not available for isolated runtime startup validation; no image was downloaded,
production secret uploaded, container restarted, or database modified.
