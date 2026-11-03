# C255 — Gameplay VIP policy

Version 1.0.0 · ACTIVE · 2026-11-03.

`system.gameplay_vip` is a JSON system setting with integer nonnegative keys `speed_3x` and `auto_card_pick`. Seed defaults: 3 and 4. Zero means no VIP requirement for an authenticated player. Missing/invalid policy does not unlock either feature; x1/x2 and manual card selection remain available. Publish validates thresholds. Existing releases without this new optional key remain publishable for compatibility.

Client GameplayAccessPolicy reads live ConfigService settings and UserContext VIP. CardAutoPick retains enabled preference, online/catalog/account-scope checks. HUD skips locked x3 on toggle, displays the configured requirement, and clamps a previously selected x3 to x2 at entry or after VIP/config change. No local fallback thresholds. This is client-side gameplay convenience enforcement; not a new server-side anti-cheat or card/reward authorization API.

Config persists through remote_config_settings and subsequent releases. Local installer clones the latest published snapshot and updates only this setting, with transaction/version check and backup. Threshold edits require config publication, not client rebuild. New clients/runtime must first be installed for this capability.

AvatarPickerDialog confirmation uses PrimaryButtonUI, preserving existing avatar entitlement and save flow.

Validation: test_gameplay_vip_config.gd covers VIP0–5, JSON numeric types, changed threshold, missing policy, HUD compilation and avatar confirmation util. Local release 83 installed. No production deployment.

Changelog 1.0.0: configurable auto-card/x3 VIP thresholds and avatar confirmation styling.
