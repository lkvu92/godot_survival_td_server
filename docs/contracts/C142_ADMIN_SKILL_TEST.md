# C142 Admin skill test stage

Version: 1.0.2  
Status: ACTIVE  
Updated: 2026-10-24

## Contract

Arc 0 contains `stage_0_admin_test`, a no-reward, no-stamina admin test entry. The server-authoritative `admin_test_access {}` RPC returns `{success:true,allowed:boolean}` only for an authenticated account whose database email equals either `lkvu92@gmail.com` or `lkvu921@gmail.com` (case-insensitive). Other accounts receive `allowed:false`. The RPC performs no writes and is guarded by the existing account/session guard. The client hides the stage and rechecks access on scene entry. This gate does not authorize gameplay rewards or bypass server economy rules.

The isolated Godot scene uses the published heroes, skills, enemies and talismans. The player selects one hero via normal CharacterSelect; the test arena contains only that one player actor at normal scale. Eight fixed targets retain Enemy combat behavior while displaying 75%-scale hero visuals: the front 1:3:1 row includes all five elements about 400 world pixels from the player, with the center 25 pixels closer for focus priority; three rear targets stand 150 pixels beyond the side front row. Their test stats are HP 1,000,000, ATK 25, DEF 150, regeneration 100,000/s and resistance 15%. A single horizontal bottom ScrollBarUI switches between the full skill catalog and talismans sorted extreme→high→mid→low via icon tabs. A toggle controls target retaliation, initially off. All actions operate on transient test actors; no profile, inventory, durability, currency, run or progression writes occur. Re-entering the scene rechecks authorization.

No offline fallback. Failure to authenticate or load complete remote config blocks entry. The admin test scene must never call normal stage start/settlement or grant rewards. UI selection and combat remain local and disposable.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.2 | 2026-10-24 | Add lkvu921@gmail.com to database-verified access and stage-entry gates, including Test 2. |
| 1.0.1 | 2026-10-19 | Clarify normal single-hero entry, hero-skinned five-element targets and one horizontal Skill/Pháp bảo bar. |
| 1.0.0 | 2026-10-19 | Define isolated admin-only Arc 0 skill/talisman test screen and server identity check. |

Validation 1.0.2: runtime build and client/server static suites PASS; two accounts allowed, disabled/other/forged-email denied. Gate score 9/10.
