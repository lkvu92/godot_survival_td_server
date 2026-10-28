# C234 Giftcode validation — 2026-10-28

Implementation acceptance: PASS, gate score 9/10. Local runtime deployment and activation subsequently completed for v1.1.0 as recorded below. Production has not been changed.

## v1.1.0 local activation

Nakama local Compose project is `survival_td_local` (the earlier check without the explicit project name did not find this stack). Deployed the updated runtime by restarting only `survival_td_local-nakama-1`. Published all three existing private definitions via the new `operator_gift_codes` endpoint with the local deployment HTTP key + private publish credential; no game account/session was impersonated.

Live read-back confirmed all three enabled, revision 1, used_count 0, exact reward definitions, all local game servers, unlimited total uses and once per account. Start: 2026-10-28T16:21:24+07:00. Expiry: 2026-11-27T16:21:24+07:00. Existing tester code retained. Private draft revisions synchronized to server.

Added rejection tests for missing/wrong/short operator credentials and game sessions before any Storage access, plus operator audit/revision tests. Actual Nakama SQL JSONB values arrived as UTF-8 byte arrays in list/history; added decoding through the existing parseJsonb helper and regressions covering this representation. Backend build, packaging verification, giftcode tests and existing operator-publication tests pass. This live verification used management read-back; it did not redeem gifts on a player's account.

## Delivered

- Private administrator RPC and CLI: create/update/enable/disable, scheduled activation/expiry, server whitelist, total quota, revisions and immutable audit; list and redemption history pagination.
- Account-global redemption with current-login, identity, character admission and app-version gates. Archived linked-account redemptions also prevent re-use.
- Global counter + redemption ledger + every mail/delivery marker share one atomic Storage write. Bounded CAS retries handle quota races without duplicate grants.
- Profile Gift code entry opens one UiDialog with supplied banner, input, Nhận, Enter, busy lock, Vietnamese inline errors and mailbox success. Service preserves uncertain request IDs and rejects stale character/connection results.
- Three private campaign drafts: TANTHU, KHAIMOSERVER, cryptographically generated 192-bit TEST_ code. Drafts are disabled and gitignored. Tester correction: fragments/other items x1000, complete talismans x1 each. Opening campaign contains 15 fragments of Thanh Phong Kiếm, not the complete item.

## Evidence

| Check | Result |
|---|---|
| `npm run build` in server/nakama, runtime packaging verifier | PASS |
| `node tests/test_gift_codes.cjs` | PASS: real compiled functions with fault-injected atomic Storage adapter |
| Rollback, last-slot race, duplicate concurrent requests, replay after disable, account/server/generation isolation | PASS |
| Clock boundaries, random rune total 20, quota/rate/admin validation and revision fences | PASS |
| Tester draft uniqueness, 127 item IDs and attachment chunks <=32 types | PASS |
| Claim all tester mails through real `mailClaimOne`/`addStoreInventoryItem`, check every item total and claim-once | PASS: 30 complete talisman types x1; fragments/other items x1000 |
| server/tests/run_static_tests.ps1 | PASS, including 60 Python tests and existing backend runtime/security checks |
| client/tests/run_static_tests.ps1 | PASS |
| Godot 4.6.3 editor import/parser | PASS |
| tests/TestGiftCodes.tscn | PASS: service retry/offline/stale handling, UI Enter/busy/error/success, actual Profile action and duplicate-dialog prevention |
| Hidden OpenGL render at requested 720x1280 and 390x844 | PASS, visually inspected normal/error/success states |
| git diff --check, private draft gitignore | PASS |

Visual files in the client checkout: `temp/gift-code-empty.png`, `temp/gift-code-error.png`, `temp/gift-code-success.png`, and corresponding `temp/gift-code-mobile-*.png`.

The existing `test_hero_exp_test.cjs` fixture still assumed the old level-50 maximum. Updated only that regression fixture to 71 EXP entries; it now checks continued progression at level 50 and the actual cap at 70. Gameplay code was not changed.

## Operational limits

The initial v1.0.0 validation did not locate the explicitly named local Compose project; v1.1.0 local management RPC/database read-back is documented above. The atomic Storage adapter exercises redemption behavior but is not a live PostgreSQL/Nakama redemption load test. Optional PostgreSQL checks in the existing static suite require explicit SEED_TEST_PSQL/SEED_TEST_PORT and were not enabled for this run. Virtual mobile viewport was checked; physical-device keyboard behavior remains a device acceptance check.

Private drafts live at `server/.tmp-giftcodes/campaigns.private.json` in this workspace. Existing generated tester secret was retained when correcting quantities and activating local. All three definitions now have enabled=true; they are published on local only. Future changes follow [operations](../GIFT_CODES.md). No tester plaintext appears in source, client, documentation or validation output.
