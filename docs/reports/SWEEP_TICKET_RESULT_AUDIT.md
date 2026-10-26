# Sweep ticket result audit — 2026-10-26

## Published local configuration

Release 32 contains campaign quantity probabilities `[0.25,0.60,0.15]`: zero/one/two tickets on an ordinary non-training victory. Tower sweep tickets drop only on campaign final-boss stages, at Normal 5%, Epic 7.5%, Legend 10%. Sweeps do not recursively grant tickets. These match C144 and C167. Tickets are added by the settlement resolver, so their absence from authored loot_table arrays is expected.

## Defect and fix

`awardStageProgression` granted campaign/tower tickets to inventory and returned them in `loot`, but captured `stage_reward.base_loot` before appending the tickets, correctly excluding them from ad multiplication. Main first emitted `loot` to HUD, then called `set_stage_reward_summary`. That summary rebuilt `total_loot` solely from `base_loot`, so HUD replaced the visible reward list with a list missing tickets. This explains missing result icons; it does not prove that every historical run rolled a ticket. The inspected user's current active-run row had no settled reward snapshot, so no historical roll could be recovered from that row.

The fix stores the already-granted ticket lines in `stage_reward.fixed_loot` and includes them once in `stageRewardSummary.total_loot`. Ad settlement continues granting only extra base loot. Existing snapshots without fixed_loot do not invent or regrant historical tickets.

## Verification

Backend build/package validation PASS. Updated stage-ad regression forces an ordinary ticket roll and verifies inventory, initial summary, post-ad summary and no second ticket grant. Updated Arc 6 backend regression verifies both final-boss ticket summary and its unchanged quantity after multiplication. Campaign sweep, ticket probability boundaries, first-clear EXP and replay/CAS regressions PASS. No client changes, player grants or drop-rate changes are part of this fix. Full static gate retains the separate known daily-pack stamina-cap mismatch.
