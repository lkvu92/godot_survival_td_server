# C269 — Stage Designer acceptance

Date: 2026-11-05. Implementation, focused validation and full server static gate complete. No production publish or automatic campaign migration.

## Focused results
- Backend runtime build/packaging: PASS. Local Nakama runtime reloaded, healthcheck 200, campaign_stage_write installed; no live stage content migrated.
- Pure allocation/validation suite: 2,122 checks PASS; included in server static runner.
- Disposable PostgreSQL/API logic: 96 checks PASS: percentage validation, zero-weight exclusion, largest remainder across a wave, fixed/random boss, seeded repeat, wave override, compatible loadout and invalid skill rejection, progression, document save/global+stage CAS, publish, rollback and C260 live projection atomicity.
- start_stage integration unit: PASS capability rejection, stale content/C260 identity before debit, invalid plan before debit, atomic profile+run, frozen EXP and plan, idempotent retry, active-run guard.
- Real Nakama HTTP: PASS real account sessions, admin authorization, structured resolve/save/validation/publication, 409 and owner-only stored plan.
- Godot 4.6.3 with real Player/Enemy nodes: 23 checks PASS. Three groups stay three queues, capacity preserves pending actors, grouped batch dispatch, eligibility/backlog fairness, one-time formation release, adapter failure, stable actor identities, JSON RNG/cursor resume, untrusted saved stat rejection and pooling.
- Real HTTP-to-Godot plan loading plus in-game spawn/resume: 25 checks PASS.
- Existing C239 Godot framework regression: 1,191 checks PASS.
- Standalone client static checks: PASS.
- Web lint, typecheck and Next production build: PASS.
- OpenNext/Cloudflare build and preview: PASS; /login 200, protected /dashboard/campaign 307 to login. Preview stopped after smoke check.
- Browser against actual Next proxy and disposable Nakama: PASS authentication, stage selection, server resolve, sprite schedule preview/x2, light/dark, invalid percentage feedback, wave add/delete, switching waves preserves unsaved group values, wave-rate override and confirmed save; no browser JS errors. Evidence: workspace tmp/c269/web-light.png and web-dark.png.

## Repository gate
Full server tests/run_static_tests.ps1: PASS (2026-11-05). The obsolete daily-pack entitlement test now asserts mail delivery followed by exactly-once mail claim using real mailbox functions; the consumable catalog test includes the C257 5-stamina bottle. No production reward behavior was changed. See server/docs/contracts/C257_DAILY_PACK_MAIL.md for the regression details.

## Operational limits
- Preview is a nominal schedule, not a claim of identical combat/kill timing or mobile frame budget.
- No balance certification, no automated conversion of existing stages, no production rollout.
- C269 v1 edits existing stages/waves and groups under their existing Arcs; creating/deleting Arcs and rewriting unlock/economy rules is outside this release.
- Old incomplete releases cannot roll back active designer stages; use a complete content checkpoint. Resume requires matching content identity.

## C269 v1.1 serial pacing validation (2026-11-05)

- Backend build and runtime packaging: PASS.
- Disposable PostgreSQL Stage Designer suite: 100 checks PASS, including individual_delay bounds and legacy compatibility.
- Godot serial/runtime suite: 37 checks PASS (39 with authenticated HTTP plan), including individual spacing, final-spawn cooldown, capacity stalls, large delta without catch-up, new-wave exclusion, adapter failure, JSON reservations, invalid reservation rejection and timeout preservation.
- C239 compatibility runtime: 1191 checks PASS.
- Client/server static suites: PASS.
- Web schedule/schema tests: 3 PASS; lint/typecheck/production build: PASS.
- Isolated authenticated Nakama + Next browser test: PASS. Enabled serial mode, rejected zero spacing, saved 0.3s individual spacing and 2s final-spawn cooldown, verified server readback; light/dark screenshots inspected, no browser JS errors.
- Evidence: workspace tmp/c269/web-light.png, web-dark.png and tmp/c269-serial-final.log.

No live stage rows or published gameplay settings were changed. Deploy updated server/web/client and enable serial spawning on existing managed stages before saving/publishing through the current lifecycle. Preview is an earliest schedule, not combat/capacity/formation/overlap prediction. No combat balance or mobile-performance claim.
