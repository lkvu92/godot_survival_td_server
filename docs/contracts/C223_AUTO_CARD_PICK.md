# C223 — VIP auto/manual card picking

Version: 1.1.2
Status: IN_PROGRESS
Updated: 2026-10-27

## Behavior and authority

VIP level >=4 unlocks a card-pick toggle in the Settings dialog and battle HUD. The card-selection dialog does not render or change this preference; it only follows the current setting. AtlasRegistry action icons target (index30) for Auto and map (index23) for Manual; use UiSkin. SaveManager local scoped setting `auto_card_pick` is boolean, defaults false. The existing environment/account/server/generation settings scope prevents preference bleed. Current authenticated VIP, server config readiness and connection are checked before each automated pick; local preference never grants VIP or offline gameplay.

Choose only from the current offered cards, through the same provider.choose_card method and existing validation/manual selection path. No reroll or ad consumption. After a short pause-independent delay, pick a skill card first, prioritizing the highest resulting skill level. Then ATK, cooldown reduction, effect accuracy, deep wound, DEF, attack speed, effect resistance, control tenacity, healing power, healing and remaining support. Within one support family use the strongest offered value; ties preserve offer order. Campaign and tower draft use the same dialog. No new RPC, gameplay config or reward data.

Manual input, refreshed offers, failure, result, destroyed dialog, busy reroll/retry, account scope changes, VIP downgrade or disconnect invalidate pending work. Manual mode does not select anything automatically. Automated selection must preserve existing pause/unpause and queued-offer behavior, without loops on an invalid offer.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-26 | VIP4 auto/manual local preference and deterministic offered-card priority. |

## Validation

Godot TestAutoCardPick and client static checks PASS, including paused/queued selection and local settings serialization. Details: [local acceptance](../reports/AUTO_CARD_PICK_ACCEPTANCE.md). Full repository gate remains blocked by the pre-existing daily-pack stamina-cap mismatch; status stays IN_PROGRESS. Client update only, no seed/publication.

## Revision1.1.0 ? action rows and skill captions

Battle HUD places all utility actions including Auto pick on one horizontal row below the top bar. Card overlay groups Auto/Manual with reroll/retry on one horizontal action row. Both rows use existing AtlasRegistry/UiSkin widgets. Skill tiles show only Lv.{level} as static text; remove key, activation, passive/talisman captions and basic-attack percentage. Locked icons retain the lock visual with Lv.0. Talisman exhaustion still disables casting without replacing the level caption. Cooldown text fills the badge and is horizontally/vertically centered, independent of the level caption. No input bindings, cooldown calculations, VIP gate or local preference behavior change.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-26 | Single action rows, level-only skill captions and centered cooldown numbers. |

## Revision1.1.1 ? gameplay action alignment correction

User clarification supersedes the horizontal gameplay row in1.1.0: gameplay utility actions remain one vertical column on the right, with equal spacing and a common horizontal center. Auto pick and skill-control mode join that same column; no detached horizontal row. Existing card-dialog action row is unchanged. Dynamic visibility updates the column height and keeps the campaign skill bar below its last visible action. Level-only skill captions and centered cooldown remain unchanged.

| Version | Date | Change |
|---|---|---|
| 1.1.1 | 2026-10-26 | Restore one centered, evenly spaced vertical gameplay action column. |

## Revision 1.1.2 — Settings owns card-pick mode

Remove the Auto/Manual control and status caption from the card-selection dialog. The dialog continues to honor `auto_card_pick`; Settings is the user-facing configuration surface, while the existing battle HUD shortcut remains unchanged.

| Version | Date | Change |
|---|---|---|
| 1.1.2 | 2026-10-27 | Remove the redundant Auto/Manual control from the card-selection dialog. |
