# C264 Support Tickets MVP
Version: 1.1.2
Status: ACTIVE
Date: 2026-11-05

## Scope
Authenticated account-owned support conversation, Godot UI, admin dashboard, assignment, public replies, private notes, unread badge and atomic audit. No uploads, SLA automation, compensation, templates or separate CSKH role.

## Schema
PostgreSQL support_tickets: id UUID, owner_id UUID, server_id text, generation int, character_name text, category (account/payment/bug/report/other), title 5..120, metadata JSON (version/platform/occurred_at/order_id/steps), status (new/in_progress/waiting_player/resolved/closed), priority (normal/high/urgent), assignee text UUID or empty, version int, public_seq int, player_read_seq int, created_at/updated_at/closed_at UTC.
support_messages: id BIGSERIAL serialized string, ticket_id UUID, author_id UUID, author_kind player/admin, internal bool, body 1..4000, created_at UTC.
support_receipts: actor_id/request_id UUID composite primary key, fingerprint JSONB (action/request), result JSONB, created_at UTC.
support_ticket_events: id BIGSERIAL serialized string, ticket_id, actor_id, action, detail JSON, created_at UTC. Never exposed to player.

## RPC contract
All responses {success:boolean,message?:string,reason?:string,code?:number,data?:object}. Admin requires isConfigAdmin on EVERY operation. Player authenticated, owner enforced independently of server context. Invalid inputs fail closed.
- support_create {request_id,category,title,body,server_id,generation,metadata}: returns {ticket}; server verifies ready character if server supplied; metadata bounded and allowlisted. 5 tickets/day and 5 active maximum, serialized per account. Same request/body returns original ticket; different content conflicts.
- support_list {cursor?:UUID,limit?:1..30}: {tickets,next_cursor,unread_count}. Account-wide ordered (created_at,id) descending; cursor resolves that tuple.
- support_get {ticket_id,cursor?:decimal bigint string}: {ticket,messages,next_cursor}; messages ordered id ascending, page 50; internal messages excluded by SQL and response projection.
- support_read {ticket_id,public_seq}: bounded monotonic mark-read; {ticket}.
- support_reply {ticket_id,request_id,body,expected_version}: {ticket}; closed forbidden, resolved/waiting_player -> in_progress.
- support_close {ticket_id,request_id,expected_version}: resolved -> closed; {ticket}.
- support_reopen {ticket_id,request_id,expected_version}: closed within 7 days -> in_progress; {ticket}.
- admin_support_list {cursor,limit,search?,status?,category?,server_id?,assignee?}: {tickets,next_cursor,unread_count:0}; assignee empty/all, unassigned, mine or UUID. Search bounded 120, literal contains UID/title/id/character.
- admin_support_get same as support_get plus {events} latest 100.
- admin_support_reply {ticket_id,request_id,body,internal,expected_version}: {ticket}; public reply sets in_progress from new; closed public reply forbidden. Private note does not change unread/public sequence.
- admin_support_update {ticket_id,request_id,expected_version,status?,priority?,assignee?}: {ticket}; assigned admin must be configured admin UUID. Allowed states new->in_progress; in_progress->waiting_player/resolved/closed; waiting_player->in_progress/resolved/closed; resolved->in_progress/closed; closed->in_progress within 7 days. Same-state allowed. Atomic CAS and audit.

## Reliability and authority
All content/state mutations call a PostgreSQL function in one SQL statement. The function takes an actor advisory transaction lock and ticket row lock, then commits CAS + message/event + receipt atomically. Read markers use a bounded monotonic SQL update. User advisory transaction lock serializes rate limits. Mutation request UUID is retained until confirmed; idempotent retries precede version checks. Reply limit 30/hour/actor, max 500 messages/ticket. Ticket pagination uses (created_at,id); message pagination uses numeric BIGSERIAL IDs serialized as strings; read snapshot marks ONLY observed public_seq; next read catches concurrent replies. Audit timestamps UTC. Badge polls on login/reconnect and every 30 seconds; no popup in combat. No automatic rewards.

## Interfaces and fallback
Godot SupportService.request(action,body), refresh_summary(); SupportDialog list/create/detail. Dashboard supportService + useSupport hook, Zod validation, RHF forms. UI uses UiSkin / theme tokens. Auth cookie/proxy/CSRF inherited. Only draft content stays in memory on network failure; server response mandatory for mutation success. Request cancels or ignores stale context/unmounted UI. No offline data fallback.

## Acceptance
Owner isolation, internal-note secrecy, non-admin rejection, retry deduplication and mismatch, concurrent CAS, rate limits, legal transitions/reopen deadline, cursor completeness, unread/read races, game parser/static checks, backend build, dashboard lint/typecheck/build. Runtime visual and local integration evidence: docs/reports/C264_SUPPORT_MVP_ACCEPTANCE.md.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-05 | MVP implementation, local runtime and acceptance complete. |

## v1.1.0 — Godot support presentation
Sticky TabUI list/create + refresh form icon (23), independent body scroll, fixed footer. Slim dialog insets. Ticket/message cards use UiServerListCardBorder; player bubbles left and admin bubbles right at 80% body width. Form uses InputUI, TextareaUI, DatePicker, PrimaryDropdownUI and PrimaryButtonUI. New controls register source textures through AtlasRegistry, preserve cap aspect ratios, repeat/crop edges and background; 54px default input/dropdown height. Textarea has configurable art scale/padding and error feedback. Dropdown supports native selection/keyboard/popup, focus/default/disabled artwork.
Client creates a fresh 6-digit captcha on form entry; mismatch clears entry and rotates challenge. This is a local form check, not server bot protection. Blank title/body rejected; shared profanity vocabulary validates free text without name-length/reserved-role restrictions. Reply also validates content. Server checks title/body profanity independently. No new RPC fields or captcha authority claimed. Footer list: cancel; form: cancel/send; details: back, cancel/resolve as applicable, reply send/reopen retained. Drafts survive tab changes and refresh; cancellation discards explicitly.
| 1.1.0 | 2026-11-05 | Reusable textarea/dropdown and compact three-tier Godot UI; captcha and free-text validation. |

| 1.1.1 | 2026-11-05 | Increase support card borders to 0.30 and shell to 0.45; constrain textarea background to its interior cross so transparent corners and exterior stay clear. |

| 1.1.2 | 2026-11-05 | Entire ticket card is a native button target including text/padding; eye remains an independent action without double-opening. |
