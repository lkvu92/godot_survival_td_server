# C252 1.1.0 ? local loading latency, 2026-11-04

Implemented batched stage/wave queries and text-cast JSONB transport, preserving
the complete RPC response. Client admission checks every difficulty and random
primary loadout using per-snapshot eligibility caching, independent level/stat
and EXP checks, shallow read-only descriptors and no per-spawn output. Full
selected-stage battle compilation and context/version guards remain unchanged.

## Measurements

- Before: existing desktop game log catalog total 15325.386 ms, validation
  10822.225 ms, network/adapter 4005.627 ms.
- After: real local SDK/HTTP adapter catalog total 8423.314 ms, validation
  4366.069 ms, network/adapter 3564.685 ms, install 3.777 ms. Headless desktop;
  no Android or sub-two-second loading claim. Max main-frame gap 26.684 ms.
- Same fixture, same test process: former count-capped full stage validation
  12361.309 ms versus admission 4909.299 ms; 859 cached loadouts. All stages and
  all three difficulties accepted, input unchanged, eight invalid cases rejected.
- Direct local RPC before: 4100.7 / 4539.9 / 4128.9 ms. After: 3262.2 / 3125.5 /
  3103.7 ms. Full parsed catalog equality checked on every after request.
- Response remains 7881450 bytes, content JSON 6992913 bytes; no partial catalog,
  data edits or gameplay fallback introduced. Payload splitting is outside this fix.

## Verification

Build/package PASS; client static PASS; C239 framework 1191 checks PASS;
server framework and stage batch tests PASS. Responsive worker/context tests
PASS: malformed and invalid stage rejection, stale context rejection, concurrent
loaders share one request. Real local SDK loading PASS. Local Nakama restarted;
enemy/config release counts stay 7/107. No production deployment/publication.

Commands: node server/tests/test_config_stage_batch.cjs; Godot scenes
TestCatalogAdmission (explicit catalog fixture argument), TestResponsiveCatalog
(explicit fixture), TestLiveCatalogLoading (--no-capture), TestEnemyFramework.
Catalog JSON fixture is test-only under workspace tmp, never runtime fallback.

Final combat regressions: NativeSkillAtlas 1209 checks PASS; shared damage 611 checks PASS.
