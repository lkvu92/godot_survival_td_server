# Seed and publish

For rewarded-ad amounts and limits, see [System Settings](SYSTEM_SETTINGS.md). C134 reads published `system.rewarded_ads`; updating the legacy content row alone does not change rewarded settings.

For catalog-only changes with the current server runtime already deployed, run
from the server repository root; this seeds without a restart or publication:

```bash
bash deploy.sh seed
```

The wrapper resolves the HTTP key and endpoint from Compose as before. Catalogs
are read directly from their DB tables by get_game_config; publishing a remote
settings release is not required for catalog updates. Seed arguments also work
after `deploy`/`start`, which still build and start services before seeding.
`seed` alone never builds or restarts services. Refresh the client configuration
and start a new battle.

Build and restart the server before using the new seed payloads. Startup adds
nullable columns without removing existing data. Seed fills them from data/.

```bash
./deploy.sh build

# Build runs a packaging gate: Docker's mounted config loads data/build/index.js
# and the artifact must register store_purchase protocol v2. Seeding does not
# compile runtime code. Deploy/start/restart now build and verify before starting.
cd nakama
export NAKAMA_URL=https://api.lkvustudio.com
export NAKAMA_HTTP_KEY='<server runtime HTTP key>'
python3 seed_all.py
```

NAKAMA_HOST/NAKAMA_PORT and NAKAMA_SEED_URL remain supported. Timeout defaults to
60 seconds and is configurable with NAKAMA_SEED_TIMEOUT. Each request validates,
writes and checks row readback atomically. The full command consists of multiple
requests: earlier successful requests remain committed if a later one fails.
Fix the cause and rerun; catalog upserts are idempotent.

Default seeding does not remove absent heroes or deactivate absent products.
For a deliberate full-catalog replacement, use `python3 seed_all.py --replace-all`.
Do not use replacement with partial hero/product payloads.

To enable ads/payment, review and copy remote_settings.production.example.json
to a local settings file, then explicitly stage the draft:

```bash
python3 seed_all.py --settings-only --settings ./my-settings.json
```

Staging does not change the published flags. To publish, authenticate the Nakama
user configured by CONFIG_ADMIN_USER_ID and supply its session JWT:

```bash
export NAKAMA_CONFIG_ADMIN_TOKEN='<admin session JWT>'
python3 seed_all.py --settings-only --settings ./my-settings.json --publish --app-version 1.0.0
```

Alternatively, on an interactive terminal, let the script log in using the
configured admin account. It prompts for the password without echoing it:

```bash
bash deploy.sh publish --u lkvu92@gmail.com --app-version 1.0.0
```

This command also seeds catalogs. Email login works only if that account has an
email password. The server still checks the session user ID against
`CONFIG_ADMIN_USER_ID`. Do not put a password on the command line.

Publication includes all active draft settings, not just the supplied file. Use
an app version accepted by the active server release. Add `--store-url` when
publishing an app update. Reconnect/resume clients to refresh published config.
AdMob/Play Console setup and the Godot client's retry/error UI are separate from
these server changes. No flags are enabled merely by building or restarting.

PowerShell: `./seed_all.ps1` forwards the same arguments and returns a nonzero
exit code on failure. Linux deployment: `./deploy.sh seed` invokes the same CLI.

## Tests

Run `powershell -ExecutionPolicy Bypass -File tests/run_static_tests.ps1`.
For integration tests, initialize an isolated disposable PostgreSQL database;
set SEED_TEST_PSQL to the psql binary and SEED_TEST_PORT to its localhost port,
then run the same script. Integration tests create tables and triggers; never
point these variables at production or a database containing real data.

## Online-only client rollout (C121)

Build/restart Nakama, then use `python3 seed_all.py --content-only` with the
correct NAKAMA_URL/NAKAMA_HTTP_KEY. This atomically seeds each supplemental
content-config request (eight entries), including enemy_skills, boss_skills and
full tribulation_config. It does not touch player profiles or base catalogs.
Verify get_game_config table=all returns schema_version=2 and all required
catalogs before releasing the new client. Older/incomplete backends are blocked
at the client loading screen. No client balance JSON synchronization is required.
