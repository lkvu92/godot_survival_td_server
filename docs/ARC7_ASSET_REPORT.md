# Arc7 environment assets — 2026-10-29

Generator: built-in image_gen tool via imagegen skill, two independent generations. Existing assets were preserved. Native generated images were resampled with System.Drawing HighQualityBicubic solely to meet the established asset dimensions; no painting/compositing changes.

| Asset | Final size | Consumer |
|---|---|---|
| client/assets/bg/arc7_van_yeu_co_linh_bg.jpg | 572×1024 | AtlasRegistry arc_background_7; shared by stage select and planned Arc7 stages |
| client/assets/ui/clear-map-widget/van-yeu-co-linh.png | 512×170 | AtlasRegistry get_sweep_background(arc_van_yeu_co_linh) |

Native sources retained in `C:/Users/lkvu9/.codex/generated_images/01a1839b-f56d-7473-9403-e871dce61580/`: background `exec-4fbcaaa8-275b-417d-8a50-c55d9a1ac77f.png`, banner `exec-6e3bd928-1f28-4d6a-8148-b405912d1e61.png`.

## Generation prompts

Background: Create a production game background asset, portrait 572x1024 exact desired final size, for a 2D chibi xianxia survival game. Vạn Yêu Cổ Lĩnh: ancient savage sacred beast forest. Hand painted clean stylized cartoon linework, readable shapes, matching mobile game environment art. High three-quarter overhead view of forest floor arena, broad open unobstructed central 65 percent playable dirt and roots ground, ancient huge trees framing outer sides and top, interlocked dense canopy, muted dark jade green foliage, restrained purple toxic mist near edges, giant ancient beast fossil ribs partially buried along edges, tiny dark crimson traces in soil, no gore. Subtle warm amber spiritual lighting near roots and distant vermilion glow hint for bird queen, overall readable green forest. NO characters, enemies, statues, weapons, UI, letters, symbols, text, grid or watermark. Flat continuous terrain for combat, no horizon, no foreground blocking center. Opaque background. Save generated image as project asset.

Minimap: Create a single very wide short game environment minimap banner for clear-stage sweep widget. Target final exact 512x170 pixels, ratio about 3:1. Vạn Yêu Cổ Lĩnh, savage ancient sacred beast forest. Clean outlined hand-painted cartoon xianxia mobile game scenery, rich readable shapes, matching chibi 2D game. A horizontal open dirt path through giant ancient root arches, dark jade green canopy enclosing upper edge, soft purple poisonous mist hugging outer ground, weathered huge beast fossil ribs and skull fragments embedded at edges, tiny crimson soil accents without gore, warm amber openings and faint distant vermilion light. Clear center for overlay UI. NO characters, icons, pins, text, numerals, borders, watermark, weapons, magical loot or statues. This is environment art, not a geographical diagram. Wide landscape full bleed opaque illustration, compose to fit a 512 by 170 thumbnail.

## Verification

Viewed both final-size assets: forest/root/fossil identity consistent, center clear, no text or UI baked in. Dimensions match existing arc background and Arc6 sweep banner. Client static suite passes. Live Godot UI crop/import and combat rendering remain to verify during full Arc7 integration; no claim of completed gameplay or measured balance.
