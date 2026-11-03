# C239 ? Migration Arc 2?7 tr?n local

Ph?m vi: 60 stage, 1.200 wave, ba difficulty, catalog lo?i theo base/growth ??c l?p v? skill atlas c? ??nh h?. Gi? s? l??ng, th?i gian, EXP, loot v? unlock theo d? li?u g?c. Arc 2?5 d?ng m?t h? theo ph?n b? c?; Arc 6?7 random h? ch?nh v? x?c su?t ??c l?p 10% th?m m?t h? kh?c. H? skill kh?ng t? ??i theo h? boss; B?ch H? d?ng skill Kim v? Chu T??c d?ng skill H?a.

D? li?u ???c c?i v?o local Nakama; RPC c? ??ng nh?p ?? ??i chi?u 70 stage/1.385 wave c?a Arc 1?7. Client c?n m? l?i v? ??ng nh?p l?i ?? t?i c?u h?nh m?i. Production kh?ng thu?c ph?m vi.

## Ki?m tra

- `server/tests/test_campaign_levelled.cjs`: PASS 60 stage, 1.200 wave v? 8.402 entry, ??i chi?u l?ch wave, EXP, growth, atlas v? ch?nh s?ch h?.
- Ki?m tra atlas native: PASS 134 skill, 305 tham chi?u, 99 projection v? 5 level.
- Client/server static suite, build Nakama v? ki?m tra admission qua snapshot RPC: PASS.
- Damage v? native gameplay regression: 17/17 PASS; framework runtime: 1.191 ki?m tra PASS.
- Ki?m tra Arc 6 cu?i c?ng: 36.996 ki?m tra, 7.632 creep, 798 song h? (10,46% trong m?u c? ??nh), kh?ng l?i.
- Ki?m tra Arc 7 cu?i c?ng: 26.351 ki?m tra, 7.632 creep, 798 song h? (10,46% trong m?u c? ??nh), kh?ng l?i.
- B? 180 l??t ch?y ?? wave c?a Arc 2?7: **180/180 PASS**, 60 stage ? 3 difficulty; source gameplay kh?ng thay ??i trong l?c ch?y. K?t qu? chi ti?t t?i `tmp/c239-arcs2to7-final/report.json`. Hero 5 level 60 b?t t? ?? ki?m tra lu?ng k? thu?t, kh?ng ch?ng minh t? l? th?ng.

## B?ng ch?ng UI

?nh render d?ng gameplay/HUD th?t v? snapshot local ?? x?c th?c. Fixture b? tr? b?n creep ?? quan s?t; boss ???c g?n n?m h? trong fixture ?? ki?m tra b? c?c, kh?ng ph?n ?nh c?u h?nh h? th?c t?. Icon creep ph? ? b?n tr?i, icon boss ph? n?m d??i HP, ch?ng 50%.

- [Arc 2](../../../client/docs/reports/C239_CAMPAIGN_UI/arc2-gameplay.png), [Arc 3](../../../client/docs/reports/C239_CAMPAIGN_UI/arc3-gameplay.png), [Arc 4](../../../client/docs/reports/C239_CAMPAIGN_UI/arc4-gameplay.png), [Arc 5](../../../client/docs/reports/C239_CAMPAIGN_UI/arc5-gameplay.png).
- [Arc 6](../../../client/docs/reports/C239_CAMPAIGN_UI/arc6-dual.png), [Arc 7](../../../client/docs/reports/C239_CAMPAIGN_UI/arc7-dual.png).

C?c l??t b?t t? kh?ng thay th? benchmark balance. C?n b?ng hero c?ng h? boss v? h? tr? gameplay l? c?ng ?o?n ti?p theo theo y?u c?u. C?c installer l?u backup tr??c khi thay d? li?u d??i `tmp/c239-arcN-local/`.
