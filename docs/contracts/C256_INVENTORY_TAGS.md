# C256 — Multi-tag inventory filtering

Version 1.0.0 · ACTIVE · 2026-11-03.

Catalog `tags` remain an array of semantic strings; one item may match several filters. Canonical user-facing keys: equipment, talisman, medicine, charm, spirit_fruit, boost, consumable, fragment, material, rune. Existing elemental/quality/family tags are preserved. Family aliases (charms/fruits/elixirs) remain for compatibility; canonical filters use singular semantic keys.

Examples: equipped talisman carries equipment+talisman; talisman fragment carries fragment+talisman+material; healing elixir carries medicine+consumable; combat boost charm carries charm+boost+consumable. Upgrade supplies use talisman_material/talisman_upgrade or rune_material rather than tagging the supply as the finished talisman/rune. Fixed EXP grants are not automatically classified as timed boost.

InventoryManager.matches_item_filter accepts the requested semantic tag or matching declared category, plus explicit compatibility aliases and category-family mappings. Unknown filters fail closed. No non-stackable-to-equipment or unknown-category-to-consumable inference. Category is still used for item actions, so fragment detail must not be mistaken for an equipped talisman merely because it has talisman tag.

Inventory Filter button opens a scrollable semantic-group picker using shared UiDialog/ScrollBarUI/PrimaryButtonUI. Choosing one group retains the search term and resets pagination; items with multiple tags can appear in each matching group. Existing top tabs continue to work.

Local migration updates only game_items.tags from the source catalog, with backup and a new release to invalidate the catalog version. Local release 84 covers 127 definitions; no inventory quantities, categories, stats, prices or rewards changed. Production is not deployed. Client must run updated scripts and reload catalog.

Validation: test_inventory_tags.gd checks actual catalog examples, multi-tag overlaps, exclusion of upgrade materials from equipment/talisman, unknown filters/categories and UI script compilation. Static suites tracked separately; no claim of device/provider acceptance.

Changelog 1.0.0: semantic item tags, working inventory filter picker and local metadata migration.
