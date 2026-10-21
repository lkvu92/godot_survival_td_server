# C150 ? Deploy seed/publish argument forwarding
Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-21

## Changelog
| Version | Change |
|---|---|
| 1.0.0 | Forward deploy/start/seed arguments through configure_runtime to seed_all; allow authenticated publication of current drafts without requiring a settings file. |

## Interfaces and behavior
`bash deploy.sh seed --publish --app-version VERSION` seeds the existing complete catalog and explicitly publishes after successful seed, without building or restarting containers. `--settings FILE` is optional and stages that reviewed file when supplied. Omission uses existing active draft settings; never auto-select example settings. `deploy/start/up` retain build/start and forward the same seed arguments afterward. Existing logs service argument remains correct after action argument removal.

`configure_runtime.py --seed -- SEED_ARGS...` passes exact argv elements to seed_all.py, including paths containing spaces, with no shell string interpolation. main gains optional seed_args. CLI rejects seed arguments without --seed. The admin session JWT is still required through NAKAMA_CONFIG_ADMIN_TOKEN; never log values, embed credentials in argv or authenticate automatically. Existing Compose-resolved HTTP key/URL behavior remains. Seed/publish errors propagate nonzero exit codes. Publish never occurs after failed seed validation or bundle commit.

No gameplay schema, RPC contract, fallback, version-gate or permission change. Existing authenticated published snapshots remain the only client authority. No deployment/seed/publication is executed by implementing this change.

## Acceptance
Tests must check exact argv propagation/quoting, unchanged default behavior, logs selection, seed failure exit propagation, no RPC with missing publish token, and successful seed before publish with settings omitted. Run existing seed CLI/runtime-secrets tests and Bash syntax check. Keep production settings untouched.

## Verification
27 tests PASS:14 seed CLI,8 runtime configuration and5 real Bash integration cases against synthetic commands (no Docker/network mutations). Cases include exact quoted paths, token only in environment, seed-before-publish ordering, no publication after failure, exit37 propagation, logs service and no-argument seed. Windows sandbox signal-pipe restrictions required an escalated synthetic Bash test run; approved run PASS. Bash -n and client static checks PASS. Gate score8.5/10. No live deploy, seed or publication performed.
