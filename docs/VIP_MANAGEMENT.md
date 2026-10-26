# VIP management

Authority: `data/vip_config.json` -> active `game_content_configs` row `id=vip` -> authenticated configuration bootstrap. The existing VIP credit ledger determines level; editing a cached player profile does not grant durable VIP. There is no dedicated VIP administration screen in this implementation.

Maintain thresholds in `levels`, purchase conversion in `product_exp`, `reward_bonus_per_level` and `milestone_rewards`. Current max level is12. Bonus amounts use floor(base*(1+VIP*0.10)); milestone gifts are never multiplied.

| VIP | Minimum EXP | Reward bonus | One-time milestone gifts |
|---|---:|---:|---|
| 1 | 500 | +10% | 10 Hồi Xuân Đan; 10 Hộ Thuẫn Đan; 3 Thể Lực Đan; 30 Vé càn quét chiến dịch |
| 2 | 1000 | +20% | 10 Hồi Xuân Đan; 5 Thể Lực Đan; 2 Thẻ EXP +10%; 60 Vé càn quét chiến dịch |
| 3 | 2000 | +30% | 15 Hồi Xuân Đan; 8 Thể Lực Đan; 2 Thẻ EXP +10%; 50 Rune hạ phẩm ngẫu nhiên; 100 Vé càn quét chiến dịch |
| 4 | 4000 | +40% | 20 Hồi Xuân Đan; 11 Thể Lực Đan; 2 Thẻ EXP +25%; 100 Rune hạ phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch |
| 5 | 8000 | +50% | 25 Hồi Xuân Đan; 14 Thể Lực Đan; 2 Thẻ EXP +25%; 150 Rune hạ phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 2 Ngộ Đạo Phù |
| 6 | 16000 | +60% | 30 Hồi Xuân Đan; 17 Thể Lực Đan; 2 Thẻ EXP +25%; 50 Rune trung phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 2 Ngộ Đạo Phù; 2 Cường Hóa Phù |
| 7 | 32000 | +70% | 30 Hồi Xuân Đan; 20 Thể Lực Đan; 2 Thẻ EXP +25%; 100 Rune trung phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 2 Ngộ Đạo Phù; 2 Cường Hóa Phù; 1 Linh quả ngũ hành ngẫu nhiên |
| 8 | 64000 | +80% | 35 Hồi Xuân Đan; 23 Thể Lực Đan; 3 Thẻ EXP +25%; 50 Rune thượng phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 2 Ngộ Đạo Phù; 2 Cường Hóa Phù; 3 Linh quả ngũ hành ngẫu nhiên |
| 9 | 128000 | +90% | 35 Hồi Xuân Đan; 23 Thể Lực Đan; 3 Thẻ EXP +25%; 100 Rune thượng phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 2 Ngộ Đạo Phù; 2 Cường Hóa Phù; 3 Linh quả ngũ hành ngẫu nhiên; 2 Tẩy Linh Quả |
| 10 | 256000 | +100% | 35 Hồi Xuân Đan; 23 Thể Lực Đan; 3 Thẻ EXP +25%; 100 Rune thượng phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 2 Ngộ Đạo Phù; 2 Cường Hóa Phù; 3 Linh quả ngũ hành ngẫu nhiên; 2 Tẩy Linh Quả; 50 Mảnh pháp bảo trung cấp ngẫu nhiên (một loại) |
| 11 | 512000 | +110% | 40 Hồi Xuân Đan; 26 Thể Lực Đan; 4 Thẻ EXP +25%; 100 Rune thượng phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 8 Ngộ Đạo Phù; 8 Cường Hóa Phù; 3 Linh quả ngũ hành ngẫu nhiên; 3 Tẩy Linh Quả; 70 Mảnh pháp bảo trung cấp ngẫu nhiên (một loại) |
| 12 | 1024000 | +120% | 45 Hồi Xuân Đan; 30 Thể Lực Đan; 4 Thẻ EXP +25%; 100 Rune thượng phẩm ngẫu nhiên; 150 Vé càn quét chiến dịch; 10 Ngộ Đạo Phù; 10 Cường Hóa Phù; 5 Linh quả ngũ hành ngẫu nhiên; 4 Tẩy Linh Quả; 100 Mảnh pháp bảo trung cấp ngẫu nhiên (một loại) |

## Local rollout

Build changed backend runtime with `npm run build` in `nakama`. Run `./deploylocal.ps1 seed --publish`, then restart Nakama local to load the rebuilt runtime. Client UI changes require restarting the game. No server reset/player reseed is needed.

Each character gets a stable `vip_milestone:<level>` delivery source, retained after deletion/purge. Existing high-VIP users recover all missing lower tiers on profile/monetization status refresh. Changing a config gift never resends an already delivered milestone. Claims are performed only through the existing mailbox.

Rune/fruit units independently select uniformly among their five elemental IDs. Random fragment bundles choose one of the ten medium-quality talisman IDs16-25 for the whole bundle. Actual choices are stored in the delivered mail. Never include spirit_root_reset in a random fruit pool.
