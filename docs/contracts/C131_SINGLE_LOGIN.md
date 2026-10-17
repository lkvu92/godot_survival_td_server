# C131 — Single active login and safe logout

- Version: `1.1.0`
- Status: `IN_PROGRESS`
- Date: `2026-10-17`

## Policy and schema
Latest completed credential authentication (Email/Google/Device/Custom) wins.
Before-auth overwrites account.vars.login_generation with a server UUID; after successful auth upserts player_login_sessions(user_id UUID PRIMARY KEY, generation TEXT NOT NULL, updated_at TIMESTAMPTZ). Failed login does not change ownership. Startup creates the additive table; no seed/player reset.
No client ownership-claim endpoint. Existing tokens without the signed generation require fresh login.

## Server interfaces and guards
beforeSingleLogin / beforeSingleLoginEmail / afterSingleLogin / requireCurrentLogin / sessionStatus.
Every accountGuardedRpc with ctx.userId checks signed ctx.vars.login_generation against the DB before the handler, including confirm_google_link. Userless HTTP-key seed/verifier callbacks retain existing authentication/account-link guards.
Mismatch: {success:false,status:"error",code:401,reason:"SESSION_REPLACED",message:"Tài khoản đã được đăng nhập ở thiết bị khác"}.
session_status returns {success:true} only for the owner and never reveals the generation.
Refresh/restore never updates ownership; normal refresh retains vars. Supplying random refresh vars cannot guess the active server UUID. Native single_session remains off so the precise application reason is returned.
Requests checked after takeover cannot mutate. Requests already authorized before takeover may finish with existing CAS/atomic receipt protection; this does not roll back committed transactions.

## Client interfaces and lifecycle
NK.logout_to_login(reason="", revoke_remote=true), NK.check_session(), NK.consume_login_notice().
No session polling. One shared ALWAYS WebSocket per login epoch, exposed by NK.get_realtime_socket(), with realtime_connected/realtime_disconnected/realtime_notification signals for future chat consumers. After auth, server sends non-persistent notification code 131, content {type:"session_changed"} to the user; never include the active generation in notifications. Receivers validate ownership once (deduplicated), so new-device/self, reordered and delayed events cannot evict the current owner. Validate once after socket connect/reconnect and foreground resume; existing RPC guards remain authoritative. Failed socket connections retry with exponential backoff capped at 30 seconds plus jitter, only while authenticated; logout cancels retries and destroys the owned adapter. No retry checks while connected, no session heartbeat RPC. Disconnect signals transport-unavailable and blocks gameplay under C121. No offline gameplay fallback.
A local session epoch fences old RPC/refresh completions even for the same user. Restore must pass session_status and cannot reclaim ownership.
Logout blocks interaction, removes stored access/refresh tokens, clears user/profile/service caches/entitlements/pending requests/run IDs, resets time scale, and performs exactly one deferred Login transition. Forced logout does not revoke the new device; manual logout best-effort revokes only the captured old session through the SDK.
Login displays the exact notice in UiDialog and skips rejected-session auto-login. Profile/MainMenu and ConfigService must not trigger duplicate scene transitions. UserContext.logout stays cleanup-only, never quits.

## Acceptance and rollout
Backend: A then B takeover, A denied/B allowed, failed auth unchanged, client vars overwritten, old/forged generations and refresh denied, userless verifier path preserved, account-link guards retained.
Godot: one deferred route on duplicate logout; tokens/cache/profile/run cleared; pause/Engine scale reset; exact notice; real Profile handler returns to Login without quit; stale same-account RPC/refresh cannot affect new login.
Build both client and backend; operator restarts runtime to create table/register hooks. No seed needed. No live changes authorized. Keep IN_PROGRESS until real two-device acceptance.

## Local verification (2026-10-17)
- v1.1.0 rerun: backend build/packaging and push tests PASS (code 131, non-persistent, no generation leak, push failure preserves ownership). Godot fake-socket runtime PASS for idle >3s without session RPC, backoff reconnect, foreground reuse, retired-socket rejection, self/delayed push safety, paused takeover and actual Login/Profile. Client static suite and relevant server/Python regressions PASS. Full server static suite remains blocked by the missing pre-existing test below. No real-device/WebSocket proxy acceptance claimed.
- Backend build and runtime packaging: PASS. `node tests/test_single_login.cjs` and password/name/store/use regressions: PASS; 14 Python regressions: PASS.
- Godot `--headless --path client --scene res://tests/TestSingleLogin.tscn`: PASS with fake transport and actual Login/Profile UI; includes same-user stale RPC/refresh fences, paused takeover, cleanup, notice and duplicate logout. Elevated rerun verified user:// access (sandbox otherwise denies saves). Headless exit reports a pending-resource warning.
- Client static suite: PASS. Server full static runner remains blocked by pre-existing missing `tests/test_new_profile_inventory.cjs`; relevant tests were run individually.
- Two physical-device acceptance remains pending operator deployment. Client and server must both update; existing saved sessions need one fresh login. No seed required and no live server was changed.

## References
Nakama 3.24.2 hooks and signed vars: https://github.com/heroiclabs/nakama/blob/v3.24.2/server/api_authenticate.go
Refresh behavior: https://github.com/heroiclabs/nakama/blob/v3.24.2/server/api_session.go
Runtime hook signatures: https://github.com/heroiclabs/nakama-common/blob/master/index.d.ts

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-17 | New-login-wins fencing, heartbeat detection and centralized logout-to-Login. |
| 1.1.0 | 2026-10-17 | Replace session polling with shared realtime socket and login-change push; reconnect/resume validation, bounded retry and reusable chat-facing signals. |

