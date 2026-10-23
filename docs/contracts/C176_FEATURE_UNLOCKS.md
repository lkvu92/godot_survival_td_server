# C176 Feature unlock management

Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-23

System config owns feature_unlocks and realm_milestones. Server module owns
eligibility, RPC admission, durable profile state and atomic mailbox delivery.
Profile.feature_unlocks = {schema_version:1, unlocked:{feature_id:timestamp},
completed_tours:[tour_id]}. Missing config blocks affected operations. No offline fallback.
Existing eligible characters receive one feature mail; historical tours are baselined.
New unlocks queue tours. Realm mail requires committed breakthrough history.
complete_feature_tour {tour_id} returns {success, feature_unlocks}; idempotent,
authenticated, character-scoped, no rewards. Feature guards return FEATURE_LOCKED,
FEATURE_UNAVAILABLE or FEATURE_CONFIG_INVALID with level metadata.
Generic client tours accept target resolvers, button/signal/manual completion,
ordered steps, cancellation, deferred targets and scene transitions. Game-specific
unlock queue is separate from the overlay and generic runner.

| Version | Change |
|---|---|
| 1.0.0 | Configurable unlocks, atomic system mail, RPC guards and reusable tours. |

## Gate evidence (2026-10-23)
Gate score: 8/10. Runtime build/packaging and both repository static runners PASS.
C176 regression PASS: all thresholds, atomic/CAS fault injection, mail ledgers,
five proven breakthroughs, migration, later releases, tour ACK and scoped state.
Godot 4.6.3 TestFeatureTour/TestFeatureUnlocks PASS, including compilation of all
changed UI scripts. Desktop OpenGL spotlight render inspected.
Native Nakama/PostgreSQL and physical mobile-device checks remain unverified:
Docker daemon was unavailable. No production deployment or live mail delivery.

Usage: client docs/FEATURE_TOURS.md and server docs/FEATURE_UNLOCKS.md.

## Native local follow-up (2026-10-23)
Local config v4 seeded/published and validated; real Nakama/PostgreSQL smoke PASS:
bootstrap/profile, under-level RPC guard, nine feature grants/mails, three proven
realm mails, tour ACK/retry and no duplicate mail on reload. Dedicated smoke
character only; existing user levels untouched. Physical mobile checks remain.
See server/docs/reports/C176_LOCAL_READINESS.md. No production changes.
