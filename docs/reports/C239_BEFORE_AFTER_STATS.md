# C239 ? ??i chi?u ch? s? tr??c v? sau migration

Ng?y 2026-10-30. ??i chi?u backup local tr??c migration c?a t?ng arc v?i snapshot `get_game_config` ?? x?c th?c sau migration. D? li?u qu?i legacy l?y t? snapshot local hi?n t?i: installer ch? ??i stage, wave v? framework, kh?ng c?p nh?t b?ng qu?i. M?i entry ???c gh?p theo stage, wave v? th? t? entry; th?ng k? creep theo s? c? th? ???c c?u h?nh. B?o c?o l? ??nh gi? ch? s? n?n, kh?ng ph?i benchmark t? l? th?ng.

Tr??c: ch? s? lo?i ? modifier wave, c?ng HP/DEF t?ng theo CampaignWavePressure (m?i 4 wave th?m 5% baseline), r?i nh?n difficulty Normal 1, Epic 1,25, Legend 1,5. Sau: base + (level ? 1) ? growth; Epic t?ng 3 level v? Legend t?ng 6 level, skill level c?ng ??i. Ch? s? tr?nh b?y ch?a ?p d?ng passive/buff, kh?c h?, critical, DEF mitigation, h?i m?u hay m? ph?ng chi?u.

## Creep ? Normal, trung v? t? l? sau/tr??c theo c? th?

| Arc | S? c? th? | HP | ATK | DEF |
|---|---:|---:|---:|---:|
| 1 | 3.617 | 77% | 103% | 97% |
| 2 | 3.922 | 101% | 144% | 187% |
| 3 | 3.915 | 45% | 58% | 54% |
| 4 | 3.684 | 29% | 39% | 25% |
| 5 | 3.684 | 16% | 25% | 13% |
| 6 | 2.544 | 23% | 29% | 27% |
| 7 | 2.544 | 17% | 16% | 17% |

Trung v? c?c t? l? theo c? th?, kh?ng ph?i t? l? c?a hai trung b?nh v? kh?ng thay th? t?ng lo?i/wave. T?c ?? di chuy?n creep trung v? c?a Arc 3?7 t?ng 33% do tr??c c? speed_mul 0,75 c?n species m?i d?ng t?c ?? g?c; Arc 1 t?ng 11%, Arc 2 t?ng 5%. ATK SPD median kh?ng ??i.

## Boss Normal ? ch? s? sau b?ng bao nhi?u ph?n tr?m tr??c

| Arc | Stage | Boss | HP | ATK | DEF |
|---|---|---|---:|---:|---:|
| 1 | 1.05 | magma_golem | 195% | 288% | 561% |
| 1 | 1.10 | infernal_dragon | 254% | 345% | 608% |
| 2 | 2.05 | ice_golem | 248% | 285% | 250% |
| 2 | 2.10 | ghost_medium | 198% | 252% | 208% |
| 3 | 3.05 | ancient_treant | 112% | 140% | 106% |
| 3 | 3.10 | poison_hydra | 59% | 82% | 72% |
| 4 | 4.05 | dreadnought_tank | 77% | 99% | 54% |
| 4 | 4.10 | mecha_overlord | 39% | 57% | 38% |
| 5 | 5.05 | earth_titan | 40% | 61% | 30% |
| 5 | 5.10 | primordial_god | 21% | 36% | 21% |
| 6 | 6.05 | arc6_wraith_mid | 23% | 37% | 19% |
| 6 | 6.10 | arc6_wraith_final | 22% | 35% | 18% |
| 7 | 7.05 | B?ch H? | 20% | 14% | 16% |
| 7 | 7.10 | Chu T??c | 19% | 19% | 15% |

Boss ??u `stage_flame_frontier` c?ng t?ng: HP 213%, ATK 224%, DEF 500%. Gi? tr? boss l? ch? s? tr??c passive/buff; m?t s? skill c? c? damage c? ??nh v? skill m?i c? level/h? s? ri?ng, kh?ng suy ra damage th?c t? ch? t? ATK. H? boss v? h? skill c?ng c? thay ??i, n?n c?n ph?n t?ch hi?u ?ng/kh?c h? trong benchmark th?c chi?n.

Chu T??c 7.10 Normal: HP 124.126 ? 22.983; ATK 1.001 ? 187; DEF 811 ? 124. Legend: HP 186.189 ? 24.665; ATK 1.502 ? 201; DEF 1.217 ? 133. ??y l? so s?nh stat, kh?ng ph?i damage hay th?i gian h? boss.

## Nh?n ??nh v? vi?c c?n ?o

Migration ch?a gi? ???c ???ng cong s?c m?nh c?: Arc 1?2 boss t?ng m?nh, c?n Arc 3?7 c? xu h??ng gi?m m?nh, nh?t l? cu?i arc. T?ng level theo difficulty t?o kho?ng c?ch nh? h?n nhi?u so v?i nh?n 1,25/1,5 tr??c ??y t?i level cao. T?c ?? ch?y Arc 3?7 l?i t?ng. ?u ti?n benchmark c? hero c?ng h? boss, c?u h?nh h? tr? r? r?ng v? theo d?i t? l? th?ng, th?i gian, s?t th??ng/skill, HP c?n l?i; sau ?? tune growth/level/skill theo t?ng arc, kh?ng y?u c?u 100% th?ng.

Chi ti?t t?ng entry v? difficulty: `tmp/c239-stat-comparison.json`; ph?p t?nh t?i `tmp/c239-stat-comparison.cjs`. Backup tr??c migration: th? m?c `tmp/c239-arcN-local/`, snapshot sau: `tmp/c239-arc1-rpc/authenticated-config.json`.
