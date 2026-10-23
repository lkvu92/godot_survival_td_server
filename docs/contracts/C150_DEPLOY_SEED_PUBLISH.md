# C150 ? Deploy seed/publish argument forwarding
Version: 1.1.0 | Status: ACTIVE | Updated: 2026-10-23

## Changelog
| Version | Change |
|---|---|
| 1.0.0 | Forward deploy/start/seed arguments through configure_runtime to seed_all; allow authenticated publication of current drafts without requiring a settings file. |
| 1.0.1 | Add `deploy.sh publish` as a shortcut for `seed --publish`, forwarding seed options without a build or restart. |
| 1.1.0 | Allow publish to obtain a session by email login with an interactive password prompt; keep password and session token out of command arguments and logs. |

## Interfaces and behavior
`bash deploy.sh publish --app-version VERSION` is equivalent to `bash deploy.sh seed --publish --app-version VERSION`. It seeds the catalog and publishes only after a successful seed; it does not build or restart containers.

`bash deploy.sh publish --u EMAIL --app-version VERSION` prompts for the email password, authenticates against Nakama with `create=false`, and uses the returned session for publication. The runtime resolves the Nakama server key from Compose. Passwords and tokens are not accepted as command arguments or printed. Existing `NAKAMA_CONFIG_ADMIN_TOKEN` remains supported and takes precedence when set. The server still verifies that the session user ID equals `CONFIG_ADMIN_USER_ID`.

`bash deploy.sh seed --publish --app-version VERSION` seeds the existing complete catalog and explicitly publishes after successful seed, without building or restarting containers. `--settings FILE` is optional and stages that reviewed file when supplied. Omission uses existing active draft settings; never auto-select example settings. `deploy/start/up` retain build/start and forward the same seed arguments afterward. Existing logs service argument remains correct after action argument removal.

`configure_runtime.py --seed -- SEED_ARGS...` passes exact argv elements to seed_all.py, including paths containing spaces, with no shell string interpolation. main gains optional seed_args. CLI rejects seed arguments without --seed. Publication requires an admin session JWT supplied by environment or obtained through interactive email login. Existing Compose-resolved HTTP key/URL behavior remains. Seed/publish errors propagate nonzero exit codes. Publish never occurs after failed seed validation or bundle commit.

No gameplay schema, RPC contract, fallback, version-gate or permission change. Existing authenticated published snapshots remain the only client authority. No deployment/seed/publication is executed by implementing this change.

## Acceptance
Tests must check exact argv propagation/quoting, unchanged default behavior, logs selection, seed failure exit propagation, no RPC with missing publish token, and successful seed before publish with settings omitted. Run existing seed CLI/runtime-secrets tests and Bash syntax check. Keep production settings untouched.

## Verification
27 tests PASS:14 seed CLI,8 runtime configuration and5 real Bash integration cases against synthetic commands (no Docker/network mutations). Cases include exact quoted paths, token only in environment, seed-before-publish ordering, no publication after failure, exit37 propagation, logs service and no-argument seed. Windows sandbox signal-pipe restrictions required an escalated synthetic Bash test run; approved run PASS. Bash -n and client static checks PASS. Gate score8.5/10. No live deploy, seed or publication performed.
