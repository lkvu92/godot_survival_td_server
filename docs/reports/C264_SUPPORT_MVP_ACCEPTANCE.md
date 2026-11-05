# C264 Support Tickets MVP — Acceptance
Date: 2026-11-05. Scope: implemented and loaded in local Nakama; no production deployment.

## Delivered
- Godot: Home support entry with unread badge, account support entry, list/create/thread, contextual payment/bug inputs, reply, resolved confirmation/close and 7-day reopen. UiDialog/UiSkin and AtlasRegistry assets. Account-wide tickets, verified character context at creation. Drafts in memory, stable retry UUID, stale-context fencing, inputs locked during requests.
- Dashboard: /dashboard/support, navigation, search/filter/cursor, conversation, explicit internal notes, receive/assign by configured admin UID, priority/status, audit history and confirmation. Zod/RHF, abort/stale-response protection, 401 redirect, existing cookie/CSRF proxy. Dark/light and mobile verified.
- Backend: 11 named RPCs, SQL tables/function, atomic receipts/audit, CAS, rate limits, owner checks and server-only internal projection. PostgreSQL JSONB decoded explicitly; timestamps UTC ISO; BIGSERIAL cursors serialized strings.

## Verification
1. `npm run build` in server/nakama: PASS including runtime packaging.
2. `node server/tests/test_support.cjs`: PASS 19 checks against an isolated PostgreSQL database, including concurrent independent connections, pagination, unread race, private notes, authorization, deduplication and rate limits.
3. `node server/tests/test_support_http.cjs`: PASS real Nakama 3.24.2 auth/RPC/SQL serialization on a temporary container/database. Created resources cleaned up.
4. Godot 4.6.3 parser/import: PASS. `client/tests/run_static_tests.ps1`: PASS.
5. `res://tests/TestSupportUI.tscn`: PASS list/create/detail, failed-send draft retention, stable retry UUID and refresh retention. Explicit mocked service fixture; no production fallback.
6. Dashboard `npm run lint`, `npm run typecheck`, `npm run build`: PASS. Existing Next middleware deprecation warning remains outside this feature.
7. `python web_client/tests/support_ui.py`: PASS Chromium/Edge fixture RPC browser tests: assignment, confirmation, state, internal note, failure/retry, dark/light, mobile no horizontal overflow.
8. `node web_client/tests/support_logging.mjs`: PASS private request/response redacted even with API debug enabled.
9. `npm run preview`: OpenNext bundle and Wrangler local server ready on 8787. Windows compatibility warning is from OpenNext.
10. Shared local Nakama restarted with rebuilt runtime: HTTP health 200 on port 7350, 11 support RPC registrations and 4 support tables confirmed. Existing gameplay data retained.

## Visual evidence
Workspace `output/support_mvp/`: game_list.png, game_create.png, game_detail.png, dashboard_light.png, dashboard_dark.png, dashboard_mobile.png. Browser/Godot UI evidence uses test fixtures; backend HTTP evidence uses real Nakama/PostgreSQL. No physical Android-device run performed.

## Gate assessment
Contract/API 10/10; backend correctness 9/10; UI/integration 9/10; acceptance 9/10. MVP ACTIVE locally. No upload, SLA automation, compensation, templates, dedicated CSKH role or production rollout included.

## Operations
Server creates/updates support schema at InitModule. Dashboard uses configured CONFIG_ADMIN_USER_ID administrators. Rebuild/restart backend, rebuild web and export a new game client for deployment. Support persistence is independent of character reset; account privacy/retention cleanup requires the deployment's existing data policy before a public launch.


## v1.1.0 Godot UI revision — 2026-11-05
- Compact 700x1000 dialog with 22px ornament-safe insets, sticky TabUI toolbar and refresh form icon 23, independent body scroll and fixed footer.
- TextareaUI draws fixed-aspect corner art, horizontally/vertically repeated and cropped edges, and looped background from text-area assets. Source alpha-padding is cropped; exterior baked checkerboard is removed at runtime without modifying source PNGs. Default art density derives from the shared 54px form height. InputUI and PrimaryDropdownUI share that height; PrimaryButtonUI at scale 0.7 is 53.9px.
- PrimaryDropdownUI uses native OptionButton selection/popup/keyboard behavior, three-piece default/focus/disabled art and centralized popup theme. Both controls expose create(params) factories and use AtlasRegistry only.
- Form uses InputUI, TextareaUI, DatePicker, PrimaryDropdownUI and PrimaryButtonUI. Calendar action uses mapped icon 18. Payment/bug inputs are conditional. Six-digit captcha rotates/clears on mismatch; local form check only. Blank/profane title/body blocked with input feedback. Shared free-text filtering preserves character-name rules and permits normal references to admin/support.
- List and conversation cards reuse UiServerListCardBorder. Message cards measure exactly 80% of body width, user left and system right. Footer supports cancel/send, back/resolve and existing reply/reopen operations. Draft and uncertain-send UUID survive tab switches; refresh preserves reply drafts.
- Tests: Godot rendered smoke includes captcha/profanity/blank validation, native dropdown/calendar, equal input/dropdown heights, conditional fields, 80% widths, pinned toolbar/footer while scrolling, stale context, retry and draft retention. PASS without parser/runtime errors or leaked resource warnings. Backend suite now includes 20 PostgreSQL checks; Nakama HTTP integration also passes with the free-text filter loaded.
- Evidence: workspace output/support_mvp/game_list.png, game_create.png, game_detail.png, game_dropdown.png, game_create_bug.png, game_calendar.png and game_scroll.png. Not a physical-device performance claim. No production deployment in this revision.

## v1.1.1 border adjustment
Support card scale increased from 0.20 to 0.30, with 30px safe card padding; shell scale 0.35 to 0.45. Textarea background now fills only an inset interior cross, leaving transparent corner exteriors clear. Verified rendered create/detail images and existing Godot support smoke (including 80% bubble widths and sticky layout): PASS. No backend code change required.
