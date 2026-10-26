# C224 — VIP reward bonuses and milestone mail

Version: 1.1.1
Status: IN_PROGRESS
Updated: 2026-10-26

## Authority and data

Existing `data/vip_config.json` -> active `game_content_configs/vip` -> existing config bootstrap remains the management source. Preserve all12 thresholds/product mappings. Add `reward_bonus_per_level:0.10` and `milestone_rewards` levels1–12 with `{level,rewards:[{type:"item",id,amount}|{type:"random_items",pool:[five valid item IDs],amount,label}]}`. Gift quantities are exactly the user-approved list; shield_elixir represents Hộ Thể/Hộ Thuẫn Đan. Low/medium runes use stone_*_low/medium; high use rune_*_high. Fruits use only five elemental aptitude fruits; reset fruit is spirit_root_reset and only an explicit Lv9 reward. EXP cards are24-hour variants.

Huyền Thưởng Bảng normal and VIP track grants and all daily check-in/catch-up grants use `floor(base_amount*(1+VIP_level*0.10))`, computed once from original configured amounts. Never compound or apply to claim costs, milestone gifts, ad rewards, other daily missions or ordinary campaign loot. VIP read from scoped server credit ledger, never request/profile/client hints. Status previews carry the same scaled quantities and multiplier as settlement. VIP10–12 still get the linear bonus; gift milestones1–12 are defined.

## Mail and interfaces

Monetization status/profile bootstrap and purchase response reconcile every eligible previously unsent milestone. Source `vip_milestone:<level>` is stable across config versions. Use existing scoped immutable player_mail_deliveries marker and mail claim CAS, no new RPC. Each random unit is selected independently/uniformly from the authored pool; merge equal items before storing the mail. Randomization occurs only for a missing delivery, and is frozen in mail attachments. Mail and delivery marker persist atomically; retries, concurrent requests, deletion/purge and downgrade/re-upgrade never resend. Existing high-VIP users receive missing lower milestones. Reconciliation of several milestones is recoverable across requests. Claims use existing atomic mailbox grants.

Missing/invalid bonus/gift config blocks affected rewards/reconciliation; no offline/local grants. Existing request shapes unchanged. VIP progress gains `milestone_mail_levels` to describe actual delivery markers. Existing `get_game_config.vip` carries complete preview definitions.

## Presentation

Home VIP badge opens a UiDialog with header, horizontal VIP1–12 list using ScrollBarUI, and detail containing a horizontal reward strip using ScrollBarUI plus the inventory UiItemSlot frame. Show selected level, current level, bonus, actual sent/locked status and random-pool labels without predicting rolls. Use AtlasRegistry/UiSkin only. Dialog is read-only; gifts are claimed through mailbox. No client reward mutations.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-26 | User-approved linear VIP bonuses, one-time milestone mail1–9 and Home preview. |

## Revision1.1.0 — VIP10–12

VIP8–10 grant3 EXP25% cards; VIP11–12 grant4. Add all user-specified gifts for milestones10/11/12. New random_item_bundle selects one of the ten mid-quality talisman fragment IDs16–25 and grants the entire50/70/100 bundle of that type. Random rune/fruit units still roll independently. VIP12 has5 fruits and4 reset fruits. Stable milestone source IDs preserve one-time delivery.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-26 | Extend gifts/UI to VIP12; correct VIP8/9 cards and add single-type fragment bundles. |

## Validation

Backend build/package, dedicated12-level bonus/mail/claim regressions, mailbox fault injection, stage-ad regression, Godot VIP dialog and standalone client static checks PASS. Local config35 deployed and runtime healthy. Full server static remains blocked by its existing stamina-cap expectation330 vs200; contract remains IN_PROGRESS. Evidence: [VIP acceptance](../reports/VIP_BENEFITS_ACCEPTANCE.md). Management and exact configured gifts: [VIP management](../VIP_MANAGEMENT.md).

## Revision1.1.1 ? VIP input gesture

Home opens VIP preview after mouse/touch release using a deferred open, rather than on press. Project touch/mouse emulation can deliver paired press events: opening during the first press exposed the new modal scrim to the second press and immediately closed it. Both release callbacks share the existing single-instance guard. Release outside the badge cancels the gesture. Standard UiDialog scrim and close behavior remain unchanged.

| Version | Date | Change |
|---|---|---|
| 1.1.1 | 2026-10-26 | Open Home VIP after gesture release, preventing emulated touch/mouse click-through. |
