# C152 ? Halve first-three-wave creep counts
Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-21

## Changelog
| Version | Change |
|---|---|
| 1.0.0 | Reduce total regular creep count in waves1?3 to ceil(previous_count/2) across all fifty campaign stages, shared by all three difficulty modes. |

## Contract
Only entry.count changes in the first three waves (array ordinal) of the five campaign arcs:arc_2,arc_frozen_realm,arc_verdant_realm,arc_iron_bastion,arc_titan_realm. Halve the wave total, rounding odd totals upward; distribute proportionally among existing entries while retaining positive integer counts and entry order. Existing stage layout allows every entry to remain positive. Boss entries and every wave4+ remain unchanged; no bosses currently occur in the selected waves. Admin/arc0 content is excluded.

Enemy IDs,role unlocks,stats,modifiers including per-creep EXP,spawn timing,batch formula,stage metadata and difficulty config remain unchanged. Total EXP of reduced waves falls with creature counts; previous exact one-in-run-level-per-wave alignment is no longer guaranteed. No automatic EXP compensation.

## Authority and acceptance
Only authoritative server/data/stages.json seed changes. No RPC/schema or client-code change; C121 authenticated published config is required, no fallback. Verify exact wave-total rounding,all non-count fields unchanged,waves4+/boss/noncampaign untouched,positive counts,all50 stages/150mode rows,and C149 role rules. Seed/publish is required to activate online changes; no runtime restart for this data-only revision. No live publication is performed as part of this source edit.

## Verification
All50 stages/150 selected waves verified against their actual pre-edit snapshot; only entry.count changed. Opening totals1955->1003 after upward rounding. Wave rounding cases:12->6(50 waves),13->7(49),14->7(48),15->8(2),16->8(1). All later waves and non-count fields compared equal. C149 role regression PASS across150modes/2643wave checks; client static checks and backend build/runtime packaging PASS. Gate score8.5/10. No production seed/publish performed.

## Superseded EXP policy
C153 supersedes the per-creep EXP preservation paragraph: retain C152 reduced creature counts but redistribute per-creep EXP so each full wave awards exactly one in-run level. See [C153](C153_EXACT_CAMPAIGN_WAVE_EXP.md).
