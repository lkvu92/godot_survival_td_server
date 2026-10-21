# C139 — ĐẢO THỨ TỰ ARC 1 & ARC 2: TỐI ƯU HÓA TRẢI NGHIỆM KHỞI ĐẦU KHẮC HỆ NGŨ HÀNH (ONBOARDING ELEMENTAL COUNTER)

- **Version**: 1.0.1
- **Trạng thái**: ACTIVE
- **Ngày hiệu lực**: 2026-10-19
- **Phạm vi tác động**: `server/data/`, `server/nakama/data/modules/`, `client/src/core/`, `client/src/assets/`, `client/tests/`

---

## 1. Bối cảnh & Lý do thay đổi (Context & Rationale)

1. **Cơ chế Ngũ Hành Khắc Hệ**:
   - Hero tân thủ mặc định mở khóa ban đầu là `hero_1` (**Băng Tuyết Thánh Nữ**), sở hữu thuộc tính nguyên tố **Thủy** (`water`).
   - Theo ma trận khắc hệ (`matchup_modifier_pct` trong `progression.json` và `CombatFormulaService.gd`):
     - `water` tấn công `fire`: **+50% Sát thương** (Khắc chế).
     - `fire` tấn công `water`: **-50% Sát thương** (Hero nhận giảm 50% sát thương từ quái Hỏa).
     - `water` tấn công `water`: **0% Sát thương** (Đồng hệ, không có thưởng sát thương).

2. **Vấn đề của thiết kế cũ**:
   - Trước đây, **Arc 1** là **Băng Giới** (`arc_frozen_realm`, nguyên tố `water`). Người chơi dùng Hero Thủy đánh quái Thủy là đồng hệ, không được trợ lực từ cơ chế ngũ hành khắc hệ.
   - Trong khi đó, **Arc 2** mới là **Hỏa Giới** (`arc_2`, nguyên tố `fire`), nằm ở mốc cấp độ 11 – 20. Người chơi mới không được trải nghiệm ngay cảm giác "khắc hệ cực đã" ngay khi mới vào game.

3. **Giải pháp**:
   - **Đảo Hỏa Giới (`arc_2`) xuống làm Arc 1 (Cấp 1 – 10)**.
   - **Đảo Băng Giới (`arc_frozen_realm`) lên làm Arc 2 (Cấp 11 – 20)**.
   - Đảo toàn diện:
     - Số wave và nhịp độ wave: Arc 1 mới nhận nhịp độ tân thủ (10 wave mở đầu $\rightarrow$ 20 wave ở stage 10). Arc 2 mới nhận nhịp độ bậc 2 (15 wave $\rightarrow$ 20 wave).
     - Chỉ số sức mạnh quái vật (HP, ATK, DEF, Modifiers): Quái Hỏa trong Arc 1 mới được scale về mức tân thủ (Level 1 – 10). Quái Băng trong Arc 2 mới được scale về mức trung cấp (Level 11 – 20).
     - Milestone Bosses: Hoán đổi hợp lý theo nguyên tố của từng Arc.
     - Initial Unlocks: Người chơi mới mặc định mở khóa Arc 1 (Hỏa Giới) và Stage đầu tiên là `stage_flame_frontier`.

---

## 2. Quy cách Arc & Stage Mới (Arc & Stage Specifications)

### 2.1. Cấu hình Arc (`arcs.json`)

| Trường | **Arc Order 1 (Hỏa Giới)** | **Arc Order 2 (Băng Giới)** |
| :--- | :--- | :--- |
| **ID** | `arc_2` | `arc_frozen_realm` |
| **Order** | `1` | `2` |
| **Display Name** | Hỏa Giới | Băng Giới |
| **Element** | `fire` | `water` |
| **Level Range** | `1 – 10` | `11 – 20` |
| **Stage IDs** | `stage_flame_frontier`, `stage_2_02` $\rightarrow$ `stage_2_10` | `stage_frozen_frontier`, `stage_1_02` $\rightarrow$ `stage_1_10` |
| **Background Asset** | `arc_background_1` (`res://assets/bg/arc2_bg.jpg`) | `arc_background_2` (`res://assets/bg/background.png`) |

### 2.2. Nhịp độ Wave & Cấp độ Stage (`stages.json`)

#### Arc 1: Hỏa Giới (Level 1 – 10)
- `stage_flame_frontier` (Lvl 1): 10 waves. Roster quái Hỏa (`flame_imp`, `lava_brute`). Boss W10: mini-boss Hỏa.
- `stage_2_02` (Lvl 2): 12 waves.
- `stage_2_03` (Lvl 3): 12 waves.
- `stage_2_04` (Lvl 4): 14 waves.
- `stage_2_05` (Lvl 5): 15 waves. Milestone Boss W15: `magma_golem` (scale HP ~ 2,000, ATK ~ 25).
- `stage_2_06` (Lvl 6): 15 waves.
- `stage_2_07` (Lvl 7): 16 waves.
- `stage_2_08` (Lvl 8): 16 waves.
- `stage_2_09` (Lvl 9): 18 waves.
- `stage_2_10` (Lvl 10): 20 waves. Final Boss Arc 1 W20: `infernal_dragon` (scale HP ~ 3,240, ATK ~ 40). `fragment_drop` enabled.

#### Arc 2: Băng Giới (Level 11 – 20)
- `stage_frozen_frontier` (Lvl 11): 15 waves. Roster quái Băng.
- `stage_1_02` (Lvl 12): 15 waves.
- `stage_1_03` (Lvl 13): 15 waves.
- `stage_1_04` (Lvl 14): 15 waves.
- `stage_1_05` (Lvl 15): 16 waves. Milestone Boss W16: `ice_golem` (scale HP ~ 4,500, ATK ~ 75, DEF ~ 16).
- `stage_1_06` (Lvl 16): 16 waves.
- `stage_1_07` (Lvl 17): 18 waves.
- `stage_1_08` (Lvl 18): 18 waves.
- `stage_1_09` (Lvl 19): 18 waves.
- `stage_1_10` (Lvl 20): 20 waves. Final Boss Arc 2 W20: `ghost_medium` (scale HP ~ 6,500, ATK ~ 100). `fragment_drop` enabled.

---

## 3. Quy chuẩn Khởi tạo Tân thủ (New Profile Onboarding)

1. **Nakama Server (`player_rpc.ts`)**:
   - `unlocked_arcs`: `["arc_0", "arc_2"]`
   - `unlocked_stages`: `[{ stage_id: "stage_flame_frontier", unlocked_levels: ["normal"] }]`
2. **Godot Client (`UserContext.gd`)**:
   - Mặc định mở khóa tương tự khi khởi tạo người chơi mới hoặc fallback: `["arc_0", "arc_2"]` và stage `stage_flame_frontier`.

---

## 4. Bảng Changelog

| Version | Ngày | Người thực hiện | Nội dung |
| :--- | :--- | :--- | :--- |
| **1.2.0** | 2026-10-21 | Antigravity | Chuẩn hóa Archetype & Hitbox va chạm chân thực (Authentic Sizing) cho Arc 1 & Arc 2: Rusher 16px, Mage 18px, Grunt 20px, Tanker 32-34px, Boss 46.8-76.8px. Dynamic `CircleShape2D` & UI anchoring trong `Enemy.gd`. Chuẩn hóa wave modifiers $M \in [0.35, 1.20]$ (Arc 1) và $M \in [1.05, 2.00]$ (Arc 2), xóa bỏ hoàn toàn `def_add` âm, bảo toàn 100% EXP. |
| **1.0.1** | 2026-10-19 | Codex | Reduced Arc 1/3/4/5 creep presentation scale by 20%; capped their boss render sizes at 1.3x the Arc 2 Ice Golem. |
| **1.0.0** | 2026-10-19 | The Architect | Khởi tạo Contract: Đảo Hỏa Giới thành Arc 1 (Lvl 1-10) và Băng Giới thành Arc 2 (Lvl 11-20), đảo số wave, creep stats và milestone bosses. |
