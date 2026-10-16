# Production audit - 2026-10-16

Read-only inspection of api.lkvustudio.com / 14.225.217.231, approximately 05:13-05:24 UTC. No container, network, configuration, database, account or deployment was changed. Secrets were compared in memory and never included in this report.

## Confirmed blockers

| Priority | Finding | Evidence / impact |
|---|---|---|
| P0 | Nginx cannot reach the game stack | Nginx belongs only to `source_truyen24h-net`; Nakama and verifier belong only to `nakama_default`. Running Nginx workers attempt the previously resolved `172.18.0.12:7350`; error log reports `Host is unreachable`. Public email login, get_game_config and leaderboard return 502 HTML. |
| P0 | Current Nginx configuration cannot reload | `nginx -T` fails with `host not found in upstream "survival-td-nakama"` at `/etc/nginx/conf.d/survival-td-api.lkvustudio.com.conf:34`. Nakama has aliases `nakama-server` and `nakama`, with no `survival-td-nakama` alias. Do not restart the shared Nginx before its configuration passes validation. |
| P1 | Client/server authentication key mismatch | Effective configured Nakama socket server key is the default; its hash differs from the client's production key. Fixing proxy connectivity alone will leave authentication blocked. A local probe with the server's configured key reaches normal JSON request validation (400 for an empty password). |
| P1 | Ads and payments are disabled in the published release | `remote_config_releases` latest version 1 has `system.ads_enabled=false` and `system.payment_enabled=false`; draft settings are also false. Existing products/config seeding does not enable these switches. |
| P1 | Verifier bridge configuration does not match Nakama | Both the configured runtime HTTP key and `MONETIZATION_VERIFIER_SECRET` comparisons fail. AdMob SSV and Google RTDN callbacks cannot reliably reach/authorize their Nakama confirmation RPCs after network connectivity is restored. |
| P1 | Production authentication/signing defaults | Nakama startup logs explicitly warn about console username/signing key, socket server key, session encryption key and refresh encryption key defaults. Configure production values deliberately; session key rotation affects existing sessions. |
| P2 | Production worktree has uncommitted changes | Deployed Git HEAD is `63a5d35`, but player_rpc.ts, built runtime, contract/test files and .gitignore are modified, with an untracked profile regression test. The runtime SHA-256 differs from the local bundle. Do not overwrite these changes or assume equal HEAD means equal deployed code. |
| P2 | Google ADC is unavailable in the Node verifier | No credentials environment variable or mount exists and GoogleAuth.getClient() fails. This blocks that service's `/google-play/verify` implementation. Current purchase claims use Nakama's native `purchaseValidateGoogle`; its IAP config has credential fields, so ADC failure alone does not establish that native purchase validation fails. No purchase was submitted. |
| P2 | Health endpoints can mislead monitoring | Public `/healthcheck` returns Nginx 404. Public `/healthz` is configured as an unconditional 204 and does not check Nakama. Local Nakama `/healthcheck` and verifier `/health` both return 200. |

## Scope of the JSON error

`client/addons/com.heroiclabs.nakama/client/NakamaHTTPAdapter.gd:111` produces `Failed to decode JSON response` when the HTTP body is not JSON. The observed body is Nginx's 502 HTML, not malformed gameplay JSON.

The shared Nakama HTTP adapter covers email registration/login, Google login, session refresh, RPCs and leaderboard REST calls. Nginx error logs independently show Google login and refresh failures in addition to the three probed routes. Config bootstrap, profile/inventory, stage actions and monetization RPCs share the affected `/v2/` path. WebSocket and both monetization callback routes also point to services outside Nginx's network; those paths were inspected in configuration, not exercised with real sessions or callback proofs.

The Satori HTTP adapter has the same parser error pattern, but no evidence establishes active use or an independent Satori outage.

## Checks that passed

- Nakama, PostgreSQL and verifier are running. Nakama and PostgreSQL report healthy. Nakama restart count is 0 and OOMKilled is false at inspection time.
- Local Nakama health returns JSON `{}` with HTTP 200; local verifier health returns `{"ok":true}` with HTTP 200.
- DB has 15 cards across five support families and three tiers. The columns `support_family`, `tier`, `min_hero_level`, `selection_weight` exist; no rows were returned by the missing/empty family/tier or missing level/weight or nonpositive weight checks. This is a targeted SQL check, not full client snapshot validation.
- Eight supplemental config rows exist and are active: boss_skills, daily_checkin, enemy_skills, events, rewarded_ads, stamina, tribulation, vip. Array/object types match their intended top-level shapes.
- Catalog counts: 5 heroes, 62 skills, 51 stages, 15 store products; 11 products are active.
- Disk: 13 GB free, 75% used. Approximately 2.1 GB memory available; no swap. No evidence from this inspection links resource exhaustion to the 502.
- Local server static suite and eight seed CLI regressions pass. Local client static checks pass. These do not establish live authenticated gameplay or monetization readiness.

## Recommended remediation order

1. Preserve the current production worktree, configuration and deployment identity. Review its uncommitted player-profile changes before updating code.
2. Declare a persistent shared external Docker network for the proxy and the two game services. Provide the exact aliases expected by Nginx, including `survival-td-nakama`. Keep database networking private. A one-off network connection would disappear on container recreation unless reflected in Compose.
3. Confirm DNS/reachability from inside Nginx, run `nginx -t`, then reload. Re-test authentication, RPC, leaderboard, WebSocket and callback routing. The proxy is shared with other projects; avoid a restart of the whole stack.
4. Restore/configure the intended production socket key to match the client. Align verifier HTTP key and bridge secret in both services. Apply signing/session configuration with an explicit session migration plan.
5. Confirm authenticated bootstrap and the full schema-v2 config with the actual client. Verify a real existing account without creating fixtures or changing balances.
6. Keep monetization switches off until native Google Billing credentials, AdMob SSV, RTDN authorization, bridge connectivity and Android release behavior are verified. Change draft settings and publish a new config release only after that validation.
7. Add an upstream-aware healthcheck and deployment checks for network aliases, key consistency and readiness. `deploy.sh` currently checks the host-local Nakama endpoint, which cannot detect this proxy-network failure.

Godot desktop uses mock ads and Android debug builds select sandbox ads; testing the VPS from the editor is not proof of production ads/Billing readiness.

## Remaining verification

No live authenticated profile, gameplay settlement, Google purchase, rewarded ad, SSV signature, RTDN OIDC or WebSocket session was exercised. No production fixes or feature-flag changes were applied. Google Play permissions, AdMob account setup, external firewall exposure and the validity of the configured native IAP credentials remain unverified.
