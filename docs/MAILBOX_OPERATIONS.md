# Mailbox operations (C147)

The client and server changes ship together. This checkout has not deployed to production.

## Release

1. Run `npm run build` in `nakama/`. Runtime packaging verifies mailbox RPCs and both Compose workers.
2. Release the client containing MailService and MailboxDialog, then enforce its app version through the published `system.min_app_version` before enabling the new purchase fulfillment runtime for older installations. One-time item/currency purchases now arrive in mail; older clients cannot open that mail.
3. Restart Nakama with the built `data/build/index.js`. Startup creates mailbox indexes and the campaign progress table without touching existing profile or inventory objects.
4. Start the `mail-worker` Compose service. It uses the existing `NAKAMA_URL` and `NAKAMA_HTTP_KEY`; defaults to one tick every 30 seconds with retry. A host scheduler may run `python -B mail_tick.py --once` instead. Do not print the HTTP key or put it in tracked files.
5. Check summary/list, send a test notice to a test character, and confirm the Home icon/push and reward claim. No seed wipe or account reset is required.

## Settings and lifecycle

Published `system.mailbox` is optional, defaults to:

```json
{"warning_hours":24,"retention_days":7}
```

Publication validates warning hours 1..720 and retention days 1..365. The purge deadline is frozen at delivery (`expires_at_ms + retention_days`). Changing retention does not rewrite existing mail. Infinite mail has null expiration and purge deadlines. Arc-open notices are infinite; ordinary stages do not send mail. Purchase deliveries are infinite. A voided unclaimed purchase mail expires immediately and is retained seven days; claimed purchase refunds still follow the existing financial review inbox policy.

Read, reward, category and expiry are independent. Manual delete, selected deletion and delete-read always preserve unclaimed attachments, including expired mail; only rewardless or already-claimed mails are manually deletable. Automatic retention cleanup remains unchanged. Expiry is inclusive, checked per claim and again just before committing the atomic Storage batch. Infinite mail is only removed when the user deletes it. Deleted/expired mail is physically purged by a bounded worker, but `player_mail_deliveries` identity records remain. Never purge delivery ledgers to reclaim space: they prevent purchase/weekly/source replays after message deletion.

Item attachment quantities are capped at 1000 per line, at most 32 lines. A claim that would grow inventory beyond 2000 stacks fails atomically with INVENTORY_FULL and leaves the mail claimable. Gold/Gems claims do not require spare inventory slots. EXP uses existing account progression, level unlock and breakthrough rules.

## Send to one player

Authenticate as the configured `CONFIG_ADMIN_USER_ID`, using the existing current-login/session guards. Call `mail_admin_send` with the normal app/config metadata plus:

```json
{
  "target_user_id":"<player UUID>",
  "server_id":"s001",
  "generation":1,
  "source_id":"compensation:maintenance-20261020:v1",
  "source_type":"compensation",
  "category":"system",
  "title":"Maintenance compensation",
  "sender_name":"System",
  "body":"Thank you for your patience.",
  "expires_at_ms":null,
  "attachments":[
    {"type":"resource","id":"gold","amount":1000},
    {"type":"exp","id":"user","amount":100},
    {"type":"item","id":"campaign_sweep_ticket","amount":2}
  ]
}
```

Source IDs must be stable and unique for the intended delivery. Reusing a source ID returns the original identity without editing its text, expiration or rewards. Server/generation are mandatory in multi-server mode. Categories: `system`, `event`, `battle_report`. Attachments can be empty. Item IDs resolve against server game_items; atlas indices are never item IDs. Producers must call `deliverMail` in the correct character runtime, and may collect its writes in the same atomic batch as their own durable source marker.

## Broadcast campaign

Call `mail_admin_campaign` as the same admin:

```json
{
  "campaign_id":"update:20261020:s001:g1",
  "server_id":"s001",
  "generation":1,
  "title":"Game update",
  "body":"Update details...",
  "expires_at_ms":null,
  "attachments":[]
}
```

Campaigns target ready characters created by the campaign cutoff, including offline players. Each campaign targets one explicit server/generation in multi-server mode; create separate IDs for additional servers. Legacy mode supports an unscoped campaign. Disabled and archived accounts are excluded. The worker persists its cursor and deduplicates deliveries; retries/crashes do not duplicate mail. Reusing campaign_id preserves the original campaign definition. Closed/retired server generations are not processed. Inspect `mail_campaigns` for progress; `mail_tick` returns bounded delivered/purged counts and failures. A tick has a two-second work budget, at most five campaigns with 25 recipients each, 25 weekly target contexts and 100 purge candidates; individual atomic operations finish before the next budget check.

## Reward producers

- Purchases: one-time currency/items mail; heroes, entitlements, no-ads, VIP and 30-day-pack activation stay immediate. Delivery, immediate character rights and purchase marker commit together. The account financial ledger retains existing reconciliation semantics.
- Weekly standings: the worker or mailbox summary/list materializes still-valid weekly awards. The original weekly claim marker commits with mailbox rewards. The old weekly claim RPC shares that marker and synchronizes an existing message after success.
- Arc opening: a rewardless system notice commits with the profile update only when a new arc is unlocked. Source identity is arc_opened:<arc_id>; stage victory/defeat without a new arc sends no mail. Combat rewards remain directly granted. Stage settlement, tribulation, mail EXP and sweep profile writes share this rule.
- Future arena/event producers: assign a stable source ID such as `arena:<season>:<board>:<user>` and use the common delivery helper. Do not accept reward quantities from a player RPC.

## Validation

```powershell
npm run build --prefix nakama
powershell -ExecutionPolicy Bypass -File tests/run_static_tests.ps1
node tests/test_mailbox_runtime.cjs
node tests/test_multiserver_runtime.cjs
```

The native test provisions and removes its own isolated PostgreSQL/Nakama containers, receives a real WebSocket notification, exercises scoped delivery and concurrent claims, and verifies no double reward through the legacy weekly RPC. From the client repository run both `tests/TestMailboxUI.tscn` and `tests/TestMailService.tscn` headlessly and its static runner. UI tests cover empty/offline and populated mail, paging, reward actions, Home placement/icon centering, and context-filtered push; service tests cover late context/disconnect replies and multiple bulk pages. A physical-device visual review is still useful before a store release.
