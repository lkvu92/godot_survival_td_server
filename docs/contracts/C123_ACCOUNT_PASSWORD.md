# C123 — Password setup for Google accounts

- Version: `1.1.0`
- Status: `IN_PROGRESS`
- Date: `2026-10-16`
- Scope: AuthService, ProfileDialog, PasswordSetupDialog, Login input styling; sibling server account_link.ts and main.ts.

## Behavior and API

Profile exposes Cài đặt mật khẩu. Authenticated `account_password_status {}` returns `{success:true,email,has_password,can_setup}`. Email is read-only and comes from the current server account. Setup is available only for active Google-linked accounts with a nonempty email and no password. Existing passwords are never reset by this flow. No anonymous lookup RPC, profile creation, merge, reward or identity reassignment occurs.

Email authentication before-hook identifies active Google accounts without an email password and rejects login/register with gRPC 9 and `PASSWORD_SETUP_REQUIRED` plus a precise Vietnamese explanation. It returns no account IDs, provider IDs or credentials. Other auth requests retain native behavior. AuthService maps only this marker to `action:setup_password`; ordinary wrong-password errors never claim the account lacks a password. Login automatically opens PasswordSetupDialog in recovery mode. Android verifies Google with create=false, checks the authenticated server email against the requested email, then enables password entry with the existing Google proof kept only in RAM. Wrong Google selection clears the temporary session and permits retry. Closing without success clears that session; success continues through LoadingScreen. Desktop opens the same dialog with a specific Android instruction, without granting access or permitting an unauthenticated password write.

`setup_account_password {password,id_token}` requires an authenticated session and Google proof verified by `authenticateGoogle(create=false)` resolving to the same user ID. The server derives email and Google ID, validates password (at least 8 characters and at most 72 UTF-8 bytes), hashes with Nakama bcryptHash, and conditionally updates only the still-passwordless active user with unchanged identity. Concurrent setup has one winner. Account-link lease prevents merge while updating. No passwords/hashes/tokens in responses, logs, disk or analytics. TLS is required by production endpoint configuration.

AuthService exposes `get_password_status()` and `setup_account_password(password)` returning dictionaries with `success` and Vietnamese `message` on failure. Google SDK proof stays in memory; cancellation, timeout, logout and account changes stop before submission. A lost response prompts status reload before retry; no offline credential updates.

## UI

Use UiDialog, UiSkin and AtlasRegistry. Reuse Login's nine-slice input decoration through a shared UiSkin helper. Show read-only email, password, confirmation, show/hide control, inline validation and pending/success/error states. Disable repeat submits and closing while submitting. Clear password fields after completion and when closing. Keyboard submit works; containers and scrolling fit the mobile viewport. On desktop explain that initial Google confirmation requires Android; after setup the same account supports editor email login.

## Acceptance

Backend compiled-runtime tests: unauthenticated, wrong Google owner, invalid token/payload/password, missing email/provider, existing password, concurrent identity/password changes and success preserving user ID. Godot runtime: validation, masking, pending/error/success and offline/platform guards. Static checks and backend build. Live Android Google OAuth remains required before ACTIVE.

## Changelog

v1.1.0 verification (2026-10-16): email hook tests pass for login/register with normal auth preserved. Login recovery runtime tests pass for automatic handoff, exact Vietnamese reason, wrong Google rejection, create=false, credential clearing and successful continuation. Backend runtime deployed to VPS with a pre-update file backup at `/opt/thong-thien-lo/backups/password-recovery-20261016T122446Z`; Nakama healthy and hook registered. Public login and register probes for the existing passwordless account both return gRPC 9 / PASSWORD_SETUP_REQUIRED. Actual Godot AuthService calling the VPS recognizes the action; recovery UI rendered and inspected. Client static checks pass. Real Android Google acceptance remains pending; IN_PROGRESS refers to that remaining acceptance.

Local verification (2026-10-16): backend build, password ownership/validation/replay tests, existing account-link server regressions, client static checks, 14 server Python regressions, isolated PostgreSQL password/link transactions and rendered Godot UI tests pass. Form and success images inspected at 720px viewport; no horizontal overflow. Provisional score 9/10 for local implementation. Full server runner is blocked by pre-existing missing `tests/test_new_profile_inventory.cjs`; existing Google-link UI regression passes its assertions but emits a pre-existing CombatPowerService `signature` metadata error. Headless audio teardown warns about button-click resources; rendered password UI test exits cleanly. VPS deployment and actual Android Google proof acceptance remain pending; keep IN_PROGRESS.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-16 | Precise missing-password auth error and automatic Login-to-password recovery handoff with Google ownership verification. |
| 1.0.0 | 2026-10-16 | Initial password setup on the existing Google account, server proof and Login-style UI. |
