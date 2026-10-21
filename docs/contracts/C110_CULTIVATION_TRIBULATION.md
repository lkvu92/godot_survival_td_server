# CONTRACT: [C110] THIÊN PHÚ, LINH CĂN & THIÊN KIẾP — PHASE 1

| Metadata | Chi tiết |
|---|---|
| **Contract ID** | `C110_CULTIVATION_TRIBULATION` |
| **Feature Ref** | `docs/features/F010_CULTIVATION_TRIBULATION.md` |
| **Current Version** | `2.2.0` |
| **Status** | `ACTIVE` |
| **Last Updated** | `2026-10-21` |
| **Backend Target** | `nakama/data/modules/progression_rpc.ts`, `player_rpc.ts`, `config_rpc.ts`, `main.ts` |
| **Client Target** | `src/core/UserContext.gd`, `src/services/PlayerService.gd`, `src/services/CombatFormulaService.gd`, `src/ui/MainMenu.gd`, `src/tribulation/` |
| **Scene/Asset Target** | `scenes/tribulation/HeavenlyTribulation.tscn`, `assets/boss/violet-lightning/` |

---

## Balance revision 2026-10-16

This revision supersedes older boss stat and post-boss healing tables below.

Authoritative `server/data/tribulation_config.json` uses `balance_version: 3`, exactly five `boss_profiles` keyed by `user_level` (9/19/29/39/49), each with `base_hp`, `base_atk`, `hp_step`, `atk_step`. Boss HP = base_hp * (1 + hp_step * (wave-1)); ATK analogously. Profile selection uses cultivation level only, never hero/gear/current HP; displayed boss level can increase, stats do not scale a second time. Invalid/missing profiles block bootstrap (C121); no local gameplay fallback. Existing encounter/settlement RPCs and reward/EXP/attempt rules stay unchanged.

`post_boss_heal_by_wave` has exactly eight percentages, indexed by cleared wave-1: 20/20/25/25/30/30/35/35%; heal only if a subsequent wave exists. Both entry paths use the same rules.

Warnings: Thiên Phạt 1.5s and damage multiplier 0.8; Lôi Vực 0.8s; Lôi Võng 0.7s then impacts at 0/0.5/1.0s, multipliers 0.20/0.25/0.40 and 0.25s stun. No damage/status during warning. Cuồng Lôi charges 2s, displays a locked landing circle and flight route, damage 1.5 ATK; repeat is one Bernoulli roll per cast, 15% probability, at most once after a separate 0.6s warning, 0.5 damage multiplier. Hazard blocking remains active through repeat warning. The landing point, visuals and damage radius must agree.

No damage cap, fatal protection, rescue invulnerability, reward multiplier changes, or campaign-enrage changes. Regression: `tests/TestTribulationBalance.tscn` with explicit external server snapshot. Balance targets are audit criteria, never dynamic runtime damage clamps. Damage/escape geometry measured on all five heroes at all five milestones; DPS/time measurements must state builds and limitations.


## 1. Mục đích và phạm vi

Contract này định nghĩa Phase 1 của hệ tu luyện cấp tài khoản:

- Roll và lưu vĩnh viễn phẩm thiên phú, tổng điểm, linh căn chính và điểm năm hệ.
- Chặn tự động lên cấp tại cấp `9/19/29/39/49` khi EXP đạt 100%.
- Mở luồng Đột phá từ Home và trận Thiên Kiếp nhiều đạo.
- Áp dụng thưởng linh căn khi thành công và lượt thử/hình phạt khi thất bại.
- Đồng bộ cùng một mô hình trạng thái cho local save và Nakama.

Ngoài phạm vi Phase 1: sinh khắc mới, linh căn đặc biệt, lĩnh vực, pháp tắc và các skill boss ngoài Lôi Trụ. Các trường dự phòng vẫn phải được bảo toàn.

### Ràng buộc bất khả xâm phạm

- `elements` tiếp tục là **cấp rune ngũ hành** của C008; không được ghi điểm linh căn bẩm sinh vào trường này.
- Điểm linh căn bẩm sinh sử dụng `element_affinities`.
- Khi đủ bốn field cốt lõi, dữ liệu thiên phú không được reroll khi load, retry hoặc chịu hình phạt. Cách xử lý profile thiếu một phần được mô tả chính xác tại mục 2.1 và mục 9.
- Online profile, EXP, lượt thử, số đạo và phần thưởng do server quyết định.
- Số đạo của một milestone chỉ roll một lần và giữ nguyên qua retry/hình phạt.
- Baseline Thiên Kiếp kích hoạt `skill_1.thien_phat`; các skill Phase 2 khác mở theo số đạo đã cấu hình.

---

## 2. Cấu hình cân bằng

Nguồn cấu hình client: `data/tribulation_config.json`.

Các key bắt buộc:

```json
{
  "max_attempts": 3,
  "penalty_exp_percent": 0.3,
  "post_boss_heal": [
    {"weight": 65, "heal_percent": 0.15},
    {"weight": 25, "heal_percent": 0.25},
    {"weight": 10, "heal_percent": 0.50}
  ],
  "boss_base_hp": 4000.0,
  "boss_hp_per_user_level": 750.0,
  "boss_base_atk": 50.0,
  "element_cap": 400.0,
  "reward_base": 5.0,
  "reward_multiplier_min": 0.8,
  "reward_multiplier_max": 1.2,
  "wave_stat_start": 0.6,
  "wave_stat_step": 0.1,
  "wave_hp_start": 2.0,
  "wave_hp_step": 0.25
}
```

Tỷ lệ phẩm phải là: Thái Cổ 1%, Cực Phẩm 5%, Thiên Linh Căn 10%, Thượng Phẩm 15%, Trung Phẩm 20%, Hạ Phẩm 49%.

| Phẩm | Tổng điểm T | Main | Số đạo đầu tiên |
|---|---:|---:|---:|
| Hạ Phẩm | `[10,50)` | 20–40% | 2 |
| Trung Phẩm | `[50,60)` | 30–50% | 3 |
| Thượng Phẩm | `[60,70)` | 40–60% | 4 |
| Thiên Linh Căn | `[70,80)` | 50–70% | 5 |
| Cực Phẩm | `[80,90)` | 60–80% | 6 |
| Thái Cổ | Online `[90,100)`; local có thể làm tròn thành `100.0` | 80–95% | 7 |

`main_pct = min + (max - min) × u²`. Bốn hệ phụ dùng trọng số ngẫu nhiên, phân phối lại phần dư khi chạm cap `min(25%, main_pct)`. Sau khi làm tròn một chữ số thập phân, tổng năm hệ phải bằng `talent_score` và hệ đã chọn ban đầu vẫn là `main_element`.

`main_element` được chọn đều từ `metal/wood/water/fire/earth` (20% mỗi hệ). Trên server, `Math.random()` làm cận trên của score và `main_pct` là cận mở; client fallback dùng RNG Godot và có nhánh riêng cho Thái Cổ với `score_max + 0.0001` trước khi làm tròn.

### 2.1. Luồng roll đang triển khai

#### Online — Nakama authoritative

1. `AuthService` tạo session qua device, email registration hoặc Google.
2. Chỉ khi `session.created == true`, client gọi `PlayerService.create_default_profile()`.
3. `save_player_profile` bỏ mọi field cultivation do client gửi trong nhánh tạo profile mới.
4. `cultivationEnsureProfile()` gọi `cultivationRollProfile()` và ghi kết quả vào `player_profiles/main`.
5. `load_player_profile` cũng gọi `cultivationEnsureProfile()` để migrate profile cũ và ghi lại nếu dữ liệu thay đổi.
6. Generic profile save bảo toàn các field cultivation đã có trên server; client không thể reroll bằng payload save.

Bốn field cốt lõi được backend kiểm tra là `talent_tier`, `talent_score`, `main_element`, `element_affinities`. Nếu bất kỳ field nào `undefined` hoặc `null`, backend tạo một candidate roll mới nhưng **chỉ copy field `undefined` hoặc `null`** vào profile. Vì vậy profile thiếu một phần có thể chứa field lịch sử và field từ candidate mới; đây là hành vi thực tế hiện tại, không phải transaction snapshot nguyên tử.

`PlayerService.create_default_profile()` hiện await RPC nhưng không kiểm tra success envelope. `AuthService` vẫn trả auth success sau khi gọi hàm này. Nếu RPC profile thất bại, account Nakama vẫn tồn tại nhưng chưa có `player_profiles/main`; `LoadingScreen` sau đó dừng ở lỗi không tải được hồ sơ.

#### Local/offline fallback

`UserContext._normalize_cultivation_profile()` chỉ khởi tạo candidate khi dictionary không có key `talent_tier` hoặc `element_affinities`, rồi chỉ điền những key chưa tồn tại bằng `Dictionary.has()`. Giá trị `null` đã có key không được xem là thiếu ở nhánh local. Candidate dùng `data/tribulation_config.json` và RNG của Godot. Kết quả được commit vào user registry/local save.

#### Nguồn cấu hình và RNG

- Server dùng `CULTIVATION_TIERS` và `CULTIVATION_ELEMENTS` hard-code trong `progression_rpc.ts`, với `Math.random()`.
- Client fallback dùng `data/tribulation_config.json`, với `randi_range`, `randf_range`, `pick_random` và `randf`.
- Hai implementation hiện có cùng tỷ lệ/công thức nhưng không dùng chung một nguồn cấu hình runtime, không lưu seed roll và không hỗ trợ replay/audit deterministic.

---

## 3. Schema profile

Các trường sau nằm trực tiếp trong `player_profiles/main` và user dictionary local:

```json
{
  "talent_tier": "thuong_pham",
  "talent_score": 64.5,
  "main_element": "wood",
  "element_affinities": {
    "metal": 12.0,
    "wood": 25.8,
    "water": 8.4,
    "fire": 10.2,
    "earth": 8.1
  },
  "affinity_flags": [],
  "comprehension_points": 0,
  "unlocked_laws": [],
  "breakthrough": {
    "milestone_level": 9,
    "attempts_left": 3,
    "tribulation_count": 4,
    "count_rolled": true,
    "in_tribulation": false,
    "failures": 0,
    "history": [{"level": 10, "waves": 4, "failures": 1}]
  }
}
```

`history.level` là cấp đạt được sau khi thành công. `in_tribulation` phải được ghi trước khi chuyển scene.

---

## 4. Điều kiện EXP và state machine

### 4.1. Gate cấp độ

- Milestone hợp lệ: `level < 50 && level % 10 == 9`.
- Ready: milestone hợp lệ và `exp >= next_level_exp`.
- Khi nhận thêm EXP ở trạng thái Ready, `exp` bị cap bằng `next_level_exp`; overflow không được giữ lại.
- Chỉ kết quả Thiên Kiếp thành công mới tăng `level` thêm 1 và trừ threshold hiện tại khỏi EXP.

### 4.2. Chuyển trạng thái

```text
LOCKED -> READY                         khi EXP milestone đạt 100%
READY -> IN_TRIBULATION                 khi action=start hợp lệ
IN_TRIBULATION -> SUCCESS               vượt đủ số đạo
IN_TRIBULATION -> READY                 thất bại nhưng còn lượt
IN_TRIBULATION -> PENALTY -> LOCKED     thất bại hết lượt
```

- Mỗi lần thất bại: `attempts_left -= 1`, `failures += 1`.
- Hết lượt: trừ `round(next_level_exp × 0.30)`, reset lượt về 3, giữ nguyên số đạo.
- Load profile với `in_tribulation=true`: xử lý đúng một lần thất bại rồi ghi lại `false`.

---

## 5. Số đạo, chỉ số và phần thưởng

Milestone đầu dùng `base_waves` của phẩm. Các milestone sau roll từ số đạo lịch sử gần nhất: giữ nguyên 70%, `-1` 15%, `+1` 10%, `+2` 5%; clamp `[1,9]`.

Đạo thứ `n`:

```text
ATK factor = 0.60 + 0.10 × (n - 1)
HP factor  = 2.00 + 0.25 × (n - 1)
```

Chỉ số tham chiếu là base stat của hero theo persistent hero level, không gồm rune/linh căn/trang bị. Hero hồi 20% max HP giữa các đạo.

Thiên Kiếp dùng cùng `CombatFormulaService` và cùng snapshot Thiên Phú/Linh Căn như trận thường; công thức `1 + affinity/300` cũ bị loại bỏ. Boss/hazard Lôi không nằm trong ma trận ngũ hành nên tương tác hệ là trung lập, nhưng DEF và kháng Pháp Bảo vẫn chỉ áp dụng một lần. Sát thương hero lên boss vẫn lấy hệ của hero/skill và được khuếch đại bởi đúng điểm Thiên Phú + cấp Linh Căn của hệ tấn công.

Pipeline sát thương chung:

```text
attack_bonus = attacker_affinity[incoming_element] × attacker_amplification[incoming_element]
innate_resist = 0.5 × defender_affinity[incoming_element] × (1 + defender_amplification[incoming_element])
modifier = max(-80%, attack_bonus + matchup - innate_resist - talisman_resist)
def_factor = 100 / (100 + effective_DEF)
final = raw × crit × (1 + modifier) × def_factor
```

C154 supersedes the former linear defense rule: the same diminishing-return defense multiplier applies to all combat damage and combat-power projection.

Quan trọng: phía phòng thủ luôn tra theo **hệ của đòn đánh đến**, không tra theo hệ hero phòng thủ. `10 DEF = 1%` giảm sát thương. Snapshot được chốt khi vào trận để kết quả ổn định và giống nhau ở gameplay thường/Đột Phá.

Thưởng khi thành công:

```text
base(main) = 5 + max(0, waves - 5)
base(other) = 5
k = clamp(1 + (hp_ratio - 0.5)×0.2 - failures×0.05 + random(-0.1,+0.1), 0.8, 1.2)
gain = round_1_decimal(base × k)
```

Mỗi hệ bị cap tại 400 điểm.

---

## 6. UI và scene contract

### Home

- `TalentBadge` nằm cùng hàng, ngay sau username; text lấy từ `talent_tier` qua display name trong config.
- `BreakthroughButton` chỉ visible khi `UserContext.is_breakthrough_ready()`.
- Dialog hiển thị lượt còn lại, tổng số đạo, ATK/HP đạo cuối và cảnh báo hình phạt.

### HeavenlyTribulation

- Scene: `scenes/tribulation/HeavenlyTribulation.tscn`.
- Combat runs at the shared gameplay baseline of `Engine.time_scale = 1.5`; this
  applies immediately when entering Thi?n Ki?p, independent of the campaign HUD
  speed control.
- Background bắt buộc: `assets/boss/violet-lightning/heavenly_tribulation _bg.png` — giữ nguyên khoảng trắng trong tên file cho đến khi có migration asset riêng.
- HUD tối thiểu: hero HP, boss HP, `đạo hiện tại / tổng đạo`, trạng thái skill và nút thoát.
- Thoát cần confirmation và được tính như thất bại.
- Result hiển thị level trước/sau, số đạo, nhãn hệ số `Thường/Tốt/Tuyệt` và gain từng hệ; main element có đánh dấu nổi bật.

### Boss Phase 1

- Sprite idle: `violet-lightning-idle.png`, grid `3×2`, cell `512×512`.
- Lôi Trụ: warning circle đỏ 1 giây tại vị trí hero đã snapshot, bán kính config, sau đó mới gây damage.
- VFX: `violet-lightning-skill1-animation.png`, grid `3×3`, cell `418×418`.
- Boss không được sử dụng Lôi Võng, Lôi Vực, Thiên Phạt hoặc Cuồng Lôi trong Phase 1.

---

## 7. API client

Các method public thuộc `UserContext`:

- `get_talent_tier()`, `get_talent_display_name()`.
- `get_main_element()`, `get_element_affinities()`.
- `is_breakthrough_milestone(level)`, `is_breakthrough_ready()`.
- `get_or_create_breakthrough_preview()` — roll/persist count nhưng chưa trừ lượt.
- `prepare_breakthrough_authoritative()` — đánh dấu bắt đầu, dùng RPC khi online.
- `resolve_breakthrough_authoritative(success, hp_ratio)` — settle kết quả local hoặc server.

`PlayerService.tribulation_action(action, hp_ratio)` là cổng RPC duy nhất của client online.

---

## 8. RPC Nakama

### Bootstrap `save_player_profile`

Khi account mới có `session.created == true`, client gửi profile mặc định qua `save_player_profile`. Nhánh server chưa có stored profile sẽ reset level/EXP/VIP/stamina/resources về baseline, xóa các field cultivation từ payload, roll server-side rồi mới ghi storage. RPC hiện trả `{"success":true}`; caller `create_default_profile()` chưa parse hoặc propagate failure envelope.

### `tribulation_action`

Request bắt đầu:

```json
{"action":"start","hp_ratio":0.0}
```

Request kết quả:

```json
{"action":"success","hp_ratio":0.72}
```

hoặc:

```json
{"action":"fail","hp_ratio":0.0}
```

Success envelope:

```json
{
  "ok": true,
  "outcome_success": true,
  "old_level": 9,
  "new_level": 10,
  "attempts_left": 3,
  "penalty_applied": false,
  "reward": {"multiplier": 1.08, "gains": {}},
  "profile": {}
}
```

Server phải từ chối khi profile chưa Ready, action không hợp lệ hoặc không có `in_tribulation` cho action kết quả. Generic `save_player_profile` không được phép ghi đè các trường cultivation authoritative đã tồn tại.

---

## 9. Offline-first và migration

- User local cũ thiếu `talent_tier` hoặc `element_affinities` sẽ tạo một candidate trong `_normalize_cultivation_profile()`, chỉ điền key còn thiếu rồi ghi vào `user://users.json`.
- Offline dùng cùng config, state machine, thưởng và hình phạt qua `UserContext`.
- Profile Nakama cũ thiếu bất kỳ field cốt lõi nào được `cultivationEnsureProfile()` tạo candidate, chỉ điền field thiếu và ghi lại khi load.
- Khi online, response server thắng local cache. Tuy nhiên partial-profile migration hiện có thể ghép các field đã lưu với field từ một candidate roll mới.
- Account auth chưa có `player_profiles/main` không được tự tạo trong `load_player_profile`; Loading Screen báo lỗi cho đến khi bootstrap profile thành công.

---

## 10. Tiêu chí nghiệm thu

- [x] Tổng weight tier bằng 100 và Monte Carlo 100.000 lượt khớp 1/5/10/15/20/49 trong sai số hợp lý.
- [x] Mọi allocation có tổng bằng T; hệ phụ không vượt 25% hoặc main.
- [x] EXP dừng ở 100% tại cấp 9/19/29/39/49 ở cả client và server.
- [x] Số đạo nằm `[1,9]`, không reroll khi retry.
- [x] Ba thất bại trừ 30% threshold, reset 3 lượt và giữ số đạo.
- [x] Kill app/thoát giữa trận được tính một thất bại.
- [x] Home có badge thiên phú và CTA chỉ xuất hiện khi Ready.
- [x] Stage dùng đúng background/boss asset và chỉ triển khai Lôi Trụ.
- [x] JSON/static tests, Nakama build và JavaScript syntax check pass.
- [ ] Chạy smoke test scene trên Godot 4.6 runtime và xác nhận touch dodge trên thiết bị 720×1280.

---

## 11. Changelog

| Phiên bản | Ngày | Người thực hiện / Agent | Nội dung |
|---|---|---|---|
| `2.0.0` | 2026-10-15 | Architect | Hợp nhất sát thương trận thường và Thiên Kiếp theo C008 v3: Thiên Phú + khuếch đại Linh Căn, kháng theo hệ đòn đánh, ma trận một chiều, sàn -80% và DEF nhân. |
| `1.2.0` | 2026-10-07 | Codex | Đồng bộ tài liệu với runtime roll hiện tại: bootstrap account mới, server authority, local fallback, partial-profile migration, cấu hình/RNG kép và failure behavior khi chưa có profile storage. |
| `1.1.0` | 2026-10-07 | Presentation & UI Dev | Tích hợp spiritual badge sprite atlas (`system-badges-spiritual.png`) vào `data/atlas_registry.json`, `AtlasRegistry.get_spiritual_badge`, thiết kế lại `TalentBadge` tại Home Screen đặt sát sau username với font size tự thích ứng. |
| `1.0.0` | 2026-10-06 | Codex | Khởi tạo contract Phase 1, schema cultivation, milestone gate, battle, reward/penalty, UI và RPC authoritative. |

Phase kế tiếp được mô tả tại [C111_CULTIVATION_TRIBULATION_PHASE_2](C111_CULTIVATION_TRIBULATION_PHASE_2.md). C110 tiếp tục là nguồn sự thật cho dữ liệu nền, milestone và fallback ruleset 1.

### Balance changelog

| Version | Date | Change |
|---|---|---|
| 2.1.0 | 2026-10-16 | Five milestone profiles, deterministic healing, fair warnings, single-roll Cuồng Lôi repeat; no rescue mechanics or reward changes. |
| 2.1.1 | 2026-10-16 | Campaign and Thi?n Ki?p gameplay now start at 1.5x; the HUD speed control cycles between 1.5x and 2x. |

## Revision 2.1.2 ? 2026-10-21
Breakthrough confirmation derives final-wave HP/ATK percentages from TribulationBalance.boss_stats using current account cultivation level and the published milestone profile. Remove legacy multiplier defaults (.18 ATK/.35 HP), which incorrectly displayed172%/240% for five waves while runtime applies132%/160%. No encounter balance, rewards, attempt count or RPC changes. Existing C121 remote-only configuration rules apply.

| 2.1.2 | 2026-10-21 | Correct breakthrough preview to use actual milestone boss stats; five waves show132% ATK/160%HP. |

## Revision 2.2.0 ? 2026-10-21: boss defense
Server milestone profiles add required base_def=100 and def_step=0.15. TribulationBalance validates the fields and returns def=base_def*(1+def_step*(wave-1)); TribulationBoss.setup installs it into attributes.def, used by the existing shared damage/defense-ignore resolver. The first five waves have100/115/130/145/160DEF; wave9 has220DEF. Applies to all five account milestones and both entry paths. HP, ATK, healing, rewards and hazard timing stay unchanged. No new RPC. Existing config snapshot carries profile fields; missing/invalid defense fields block bootstrap under C121, no local balance fallback. Release current client together with the enriched server snapshot; no production deployment authorized in this revision.

| 2.2.0 | 2026-10-21 | Add server-configured progressive boss DEF100*(1+.15*(wave-1)), validation and actual damage/defense-ignore regression coverage. |

### 2.2.0 verification
Godot TestTribulationBalance PASS using an explicit test-only snapshot with updated server tribulation seed:25 hero/milestone combinations,225 stat cases,45 actual boss setup/damage cases including50% defense ignore, and rejection of missing/negative defense fields. Client standalone/C110/C111 static checks PASS. Backend npm run build and runtime packaging PASS. Gate score8.5/10. Production config was not published/reseeded; no DPS/time-to-kill re-audit performed. Existing prior timing estimates predate defense and should not be reused as measured results.
