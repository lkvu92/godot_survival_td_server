# C186 Hero EXP cap and restricted EXP test screen

Version: 1.0.0
Status: ACTIVE
Updated: 2026-10-24

## Schema and rules

Persistent hero `{hero_id,owned,level,exp,next_level_exp,current_attribute}`
keeps `0 <= exp <= progressionNextHeroExp(level)` after reward processing.
Normal level transitions remain; at the user-level cap only one current-level
threshold may be stored. At global max level EXP/next are zero. Repair legacy
excess on profile load. Apply to campaign, tower, sweep and ad bonus rewards.
User progression and breakthrough rules remain unchanged.

## RPC and interfaces

`admin_exp_test_access {}` returns `{success:true,allowed:boolean}` via the
existing account/session guard, read-only DB email allowlist:
`lkvu92@gmail.com`, `lkvu921@gmail.com` (case insensitive, enabled accounts).
`admin_exp_test {hero_id}` is character-scoped and requires valid server context,
current login, complete config, same allowlist, owned hero and no active combat,
tribulation or sweep. Client-supplied levels/EXP are never used.
Atomically CAS-write profile (unchanged, version fence) and hero state: selected
hero level becomes max(current hero level, min(user level, global cap)), EXP is
zero, next EXP and attributes are recomputed. Return `{success:true,hero}`;
forbidden/invalid/busy/conflict errors make no grant. Retry at same state is safe.
No user EXP, resources, ownership, inventory or rewards are granted.

## Presentation and offline rule

CharacterSelect exposes Test EXP only after successful authorization. Entry
opens a dedicated screen, calls the mutation once and shows the result. Back
reloads authoritative profile. ButtonUI/UiSkin provide buttons; no new assets.
Network or missing config blocks entry/mutation; no local fallback (C121).

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Cap stored hero EXP and add two-account server-authorized hero level test. |

Validation: runtime build/postbuild PASS; server and client static suites PASS;
Godot editor parser and standalone offline test scene smoke PASS. Regression
covers both emails, forged stats, ownership, retry, activity and CAS/config
rejection; campaign overflow and normal level gains. Gate score: 9/10.
No runtime deployment or production account mutation performed.
