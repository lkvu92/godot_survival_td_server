# C166 — Contract tổng thể: Tháp Thí Luyện

Version: 1.0.0
Status: ACTIVE
Updated: 2026-10-22
Scope: Godot client + Nakama backend
Document type: đặc tả hợp nhất cơ chế hiện hành; không thay đổi runtime.

## 1. Mục tiêu và phạm vi

Tháp hiện có **20 tầng**. Người chơi dùng một hero đã sở hữu để đấu với Tâm Ma
của hero đó. Tầng thấp dễ tiếp cận; tầng cao yêu cầu build, trang bị, linh căn và
khả năng di chuyển/né skill. Đầu tư pháp bảo và cấp linh căn là lợi thế riêng của
người chơi, không tự động nâng sức mạnh tương ứng cho Tâm Ma.

Contract này là điểm đọc tổng thể. Các giá trị cân bằng cụ thể theo
[C165 v1.1.0](C165_TOWER_FLOOR_BALANCE.md); snapshot và giới hạn kế thừa theo
[C164](C164_TOWER_MIRROR_AND_MANUAL_CONTROLS.md); bonus combat dùng chung theo
[C163](C163_ADDITIVE_COMBAT_BONUSES.md).
Các mô tả cũ về sao chép pháp bảo, không tăng tốc đánh/CD, hệ số tầng 110%..300%
hoặc phiên bản luật 1/2/3 trong C160/C161/C164 không còn áp dụng cho trận mới.
Giữ các tài liệu đó để tra lịch sử, không xóa changelog.

Không đổi công thức damage hoặc chỉ số ở campaign, đột phá và các màn khác.
Không nhân HP hai bên ×5. Không bổ sung asset, RPC hoặc phần thưởng trong lần
viết tài liệu này.

## 2. Trạng thái triển khai

| Hạng mục | Hiện trạng |
|---|---|
| 20 tầng, khóa/mở tầng, chọn hero | Đã có |
| Vé hằng ngày và giới hạn tích trữ | Đã có |
| Snapshot Tâm Ma, draft, countdown, combat, xác nhận tiến độ | Đã có |
| Hai đường tăng chỉ số 10% và 5% | Đã có, luật trận phiên bản 4 |
| Manual/Auto, joystick, cụm skill hình quạt, log combat | Đã có |
| Danh sách phần thưởng từng tầng | Đã có trong cấu hình và UI |
| Cấp thưởng thắng trận lần đầu/lặp lại | **Chưa có trong `finish_trial_tower` hiện tại** |
| Càn quét và tiêu vé | **Chưa có RPC thực thi**; UI mới phát intent khi có handler |

Không được quảng bá preview thưởng là thưởng đã nhận. Các phần còn thiếu phải
có contract settlement/kinh tế và kiểm thử idempotency riêng trước khi mở.

## 3. Luồng người chơi

```text
Tải trạng thái → chọn tầng/hero → start_trial_tower
→ preparing: 19 lượt chọn, mỗi lượt 1 trong 3 thẻ
→ prepare_trial_tower xác nhận build của hai bên
→ countdown: 5 → 4 → 3 → 2 → 1 → Bắt đầu chiến đấu
→ combat → win/loss → finish_trial_tower → tải lại trạng thái
```

- Chỉ được vào tầng đã mở: `floor <= highest_cleared + 1`, trong khoảng 1..20.
- Một nhân vật không được có hai hoạt động combat xung đột cùng lúc.
- Thử thách hiện không tiêu vé càn quét. Vé không được trừ chỉ vì bấm nút UI.
- Chọn thẻ/countdown khóa di chuyển và cast; timer combat/cuồng bạo chỉ bắt đầu
  sau countdown. Countdown dùng giây thực, không chạy nhanh theo time scale.
- Không khôi phục một trận đang đánh bằng cách dựng lại hai bên đầy máu.
- Rời trận dùng abandon; lỗi mạng đóng băng thao tác, không tự ghi thắng/thưởng.

## 4. Base hero, kế thừa và thứ tự tính

Phân biệt **cấp hero vĩnh viễn** và **cấp 20 tạm trong trận**:

1. Server lấy hero đã sở hữu và cấp vĩnh viễn, giới hạn 1..50 theo runtime.
2. `B` là `current_attribute` vĩnh viễn trước trang bị; nếu chưa có thì server
   dựng từ catalog hero và tăng trưởng cấp vĩnh viễn, không dùng JSON gameplay client.
3. Hero nhận `attributes = cpApplyEquipment(B, equipped)`; Tâm Ma nhận
   `demon_attributes = B`. Không lấy chỉ số đã cộng trang bị rồi trừ ngược.
4. Client áp hệ số tầng lên Tâm Ma, sau đó tăng trưởng tạm 19 cấp cho cả hai.
5. Áp build thẻ đã được server xác nhận và passive theo cơ chế dùng chung.
6. Combat đọc chỉ số hiệu dụng và chạy cùng engine damage/status như gameplay.

| Thành phần | Hero | Tâm Ma |
|---|---|---|
| Hero ID, base vĩnh viễn, cấp hero gốc | Giữ | Kế thừa trước trang bị |
| Tư chất linh căn `element_affinities` | Giữ | Sao chép |
| Cấp linh căn `elements` | Giữ | Tất cả level về 0 |
| Chỉ số pháp bảo, có xét độ bền | Có | Không |
| Skill/passive pháp bảo | Có theo luật pháp bảo hiện tại | Không |
| Skill hero được phép chọn | Pool mở khóa thực tế | Cùng pool, AI draft riêng |
| Tăng trưởng cấp 20 tạm | Có | Có |
| Thẻ nâng cấp | Người chơi chọn | AI chọn độc lập |
| Hệ số tầng | Không | Có |

Tư chất và cấp linh căn đi vào công thức sát thương/kháng hệ; không cộng thẳng
vào ATK/DEF. Snapshot linh căn của cả hai được server chốt lúc tạo trận.
Không đọc lại trang bị/linh căn trực tiếp từ profile cho từng hit.

## 5. Cân bằng tầng — quy tắc bắt buộc

Với tầng `f ∈ [1,20]`, server làm tròn hệ số đến 4 chữ số thập phân:

```text
stat_multiplier(f)  = 0.70 + (f - 1) × 0.10
speed_multiplier(f) = 0.70 + (f - 1) × 0.05

HP/ATK/DEF vào trận Tâm Ma = chỉ số B tương ứng × stat_multiplier
attack_speed Tâm Ma       = B.attack_speed × speed_multiplier
skill_cooldown_mul        = B.skill_cooldown_mul / speed_multiplier
                           (B thiếu trường cooldown thì hệ số gốc là 1)
```

Tăng **điểm phần trăm trên base**, không nhân chồng theo từng tầng.

| Tầng | HP/ATK/DEF | Tốc đánh / tốc độ hồi chiêu | Thời gian hồi chiêu so với gốc |
|---|---:|---:|---:|
| 1 | 70% | 70% | ×1,4286 |
| 2 | 80% | 75% | ×1,3333 |
| 4 | 100% | 85% | ×1,1765 |
| 7 | 130% | 100% | ×1,0000 |
| 10 | 160% | 115% | ×0,8696 |
| 15 | 210% | 140% | ×0,7143 |
| 20 | 260% | 165% | ×0,6061 |

Ví dụ skill gốc hồi 10 giây: tầng 1 khoảng 14,29 giây, tầng 20 khoảng 6,06 giây,
**trước** thẻ, passive và giới hạn chung. Tăng tốc độ hồi chiêu không phải tăng
thời gian chờ. Giữ cap cooldown và khoảng cách cast chung hiện có.
Tốc đánh ở đây là chỉ số `attack_speed`; nhịp đánh thực tế còn theo công thức
đánh thường dùng chung, không cam kết tăng tuyến tính số hit/giây.

Không áp hệ số tầng lên move speed, tầm đánh, crit hoặc tư chất linh căn.
Tăng trưởng tạm phải bảo toàn hệ số của các stat nhân; không đẩy tốc đánh/CD
quay lại đường tăng 10%.

## 6. Draft và bonus trong trận

- Một skill khởi đầu Lv1; cả hai có 19 lượt nâng cấp, tương ứng cấp combat 20.
- Pool do server cấp từ `skill_pool`, `hero_level_unlock <= cấp hero vĩnh viễn`
  và điều kiện cấp trong trận phù hợp. Cấp 20 tạm **không mở khóa skill vĩnh viễn**.
- Respect max level, prerequisite; không chọn skill đã hết cấp nâng.
- Dùng `CardChoiceOverlay`/cơ chế card gameplay, không tạo một hệ card khác.
- Xem trước lựa chọn không thay đổi stat thật trước khi xác nhận.
- AI chọn từ 3 ứng viên hợp lệ ngẫu nhiên mỗi lượt, ưu tiên:
  `SKILL → ATK → hồi chiêu → DEF → tốc đánh → HP`; hòa ưu tiên thì ngẫu nhiên.
- Server kiểm tra đủ 19 lựa chọn và lưu cả hai build. Retry giữ nguyên payload;
  build đã xác nhận không được đổi.
- Bonus `stat_percent` cộng trên base chưa buff, theo C163:
  `stat = base × (1 + tổng bonus %) + bonus cố định`.
  Ví dụ ATK base 100 + 9 thẻ 10% = 190, không phải 235,79.
- Thẻ CD hiện dùng cơ chế riêng: nhân hệ số còn lại và cap hiện có; **không**
  suy từ quy tắc cộng ATK/DEF rằng thẻ CD cũng đã đổi sang cộng tuyến tính.

## 7. Combat, UI và điều khiển

- Player/TowerFighter, Projectile, SkillManager và status/damage engine dùng chung.
  Skill định hướng, homing, AOE, passive on-hit phải tác động được ở cả hai chiều.
- Đánh thường và chọn mục tiêu tự động. Hero Tháp mặc định manual cho active skill;
  Auto/Manual không ảnh hưởng passive, quyền dùng skill hay luật cooldown/khống chế.
- PC: WASD/phím mũi tên; phím 1..4 cho slot hero, slot pháp bảo theo luật slot 5.
  Mobile: joystick đa chạm, ngón còn lại bấm skill.
- Tâm Ma AI tuân thủ tầm đánh/khống chế; tiếp cận ngoài 90% tầm đánh thường,
  lùi khi trong 65%, giữ khoảng cách ở giữa. Dash/knockback không vượt biên.
- World cố định 1800×3200, margin 96, spawn gap cấu hình 720; cả hai cùng biên.
  Cặp spawn hạ 10% chiều cao map; camera offset 43% chiều cao thiết kế để nhân vật
  xuất hiện thấp hơn trên sàn, clamp cặp spawn vào vùng hợp lệ.
- Camera zoom 70% mức cũ: map/nhân vật/VFX cùng nhỏ về mặt hiển thị; không giảm
  kích thước world, tầm đánh hoặc tốc độ thật. HUD nằm trong CanvasLayer riêng.
- Foot VFX bám actor; skill framing Tháp cố định theo caster 720×1280, không theo camera.
- Sprite Tâm Ma lớn hơn hero 10%, không tăng collision hoặc stat vì scale hình.
- Skill 1 lớn ở phải; Skill 2 dưới-trái, Skill 3 trên-trái, Skill 4 phía trên.
  Các nút nhỏ nằm sát nút chính nhưng không chồng vùng bấm; slot chưa mở vẫn khóa.
- Nút chế độ dùng `ButtonUI.create_icon`, không viền, icon qua AtlasRegistry:
  `[4] auto_combat` = đang Auto; `[5] manual_control` = đang Manual.
  Đồng bộ ngay lúc setup/bấm và khi controller đổi, không hiển thị chế độ đích.

## 8. Hết giờ và kết quả

Timer bình thường 90 giây. Sau đó không xử hòa; Tâm Ma cuồng bạo, với
`t = max(combat_elapsed - 90, 0)` và chỉ số mốc sau draft:

```text
ATK(t) = ATK_mốc × (1 + 0.05 × t)^2
element_resist_pct(t) = min(90, kháng_mốc + 0.5 × t)
harmful_effect_resistance(t) = min(0.95, kháng_hiệu_ứng_mốc + 0.02 × t)
```

Hero sống và Tâm Ma hết HP: win. Hero hết HP: loss, kể cả cùng hết HP trong lần
kiểm tra kết quả. Không có nhánh kết quả draw. Chỉ server xác nhận mới mở tiến độ.
Server hiện kiểm tra run, thời gian, terminal HP và CAS, **không replay toàn bộ
combat**; đây không phải cơ chế chống gian lận tuyệt đối. Run hết hạn không được
nhận thắng; abandon không cần terminal HP.

## 9. Dữ liệu và RPC

Nguồn seed duy nhất: `server/data/trial_tower.json` → Nakama `content_configs/trial_tower`.
Client không chứa gameplay JSON hoặc tự suy hệ số nếu snapshot online thiếu.

```ts
type Floor = {
  floor: number; stat_multiplier: number; speed_multiplier: number;
  first_rewards: RewardPreview[]; repeat_rewards: RewardPreview[];
};
type RewardPreview = { label: string; kind?: string; amount?: number; item_id?: string };
type ElementProfile = { affinities: Record<string, number>; levels: Record<string, number> };
// Preview hiện kiểm tra label; không coi đó là validation đủ để cấp thưởng.
```

| RPC | Payload nghiệp vụ | Kết quả chính |
|---|---|---|
| `get_trial_tower_status` | `{}` | `{success, snapshot:{floors, highest_cleared, tickets, daily_tickets, ticket_cap, server_time, next_ticket_at}}` |
| `start_trial_tower` | `{floor, hero_id, request_id}` | `{success, run}` |
| `prepare_trial_tower` | `{run_id, picks:string[19]}` | `{success, run}` có hai build, phase countdown |
| `finish_trial_tower` | `{run_id, result:"win"\|"loss"\|"abandon", player_hp?, demon_hp?}` | `{success, result, highest_cleared, duplicate?}` |

Mọi request còn phải qua auth/app-config version/server/generation admission của
hệ thống; bảng không thay thế envelope dùng chung. `request_id` gồm 8..128 ký tự
chữ/số/`_`/`-`. Client không được gửi chỉ số combat thay cho snapshot server.

Run ngoài trường lifecycle chuẩn phải có:

```ts
{
  stage_id: "stage_trial_tower", run_id, request_id, floor, hero_id,
  attributes, demon_attributes, hero_element_profile, demon_element_profile,
  stat_multiplier, speed_multiplier, skill_levels, draft_catalog,
  skill_unlock_version: 4,
  phase: "preparing" | "countdown", combat_level: 20,
  upgrade_count: 19, countdown_sec: 5, arena, combat_rules,
  player_picks?, demon_picks?, combat_started_at_ms?,
  status, expires_at_ms, min_win_duration_ms
}
```

Client có phase combat cục bộ sau countdown; server lưu phase countdown cùng
`combat_started_at_ms = thời điểm xác nhận + 5000`. Không yêu cầu server đổi
phase combat mới được finish. Run luật cũ bị từ chối prepare, cần abandon/tạo mới.
Thiếu/sai config trả lỗi, không fallback; các mã thường gặp gồm FLOOR_LOCKED,
HERO_NOT_OWNED, COMBAT_ACTIVE, TOWER_RUN_ACTIVE, INVALID_BUILD, BUILD_LOCKED,
RUN_RULES_CHANGED, NOT_STARTED, TOO_EARLY, INVALID_RESULT, CONFLICT.

## 10. Storage, vé và phần thưởng

Storage nhân vật được namespace theo server/generation qua repository chung;
không dùng tiến độ/vé của nhân vật hoặc server khác.

| Collection / logical key | Nội dung |
|---|---|
| `player_trial_tower/main` | `{highest_cleared:0..20, tickets:0..20, last_ticket_day:int}` |
| `player_stage_runs/active` | Run và snapshot bất biến, lựa chọn, trạng thái/kết quả |
| `player_profiles/main` | Khóa hoạt động `activity` gắn run |

Các record nghiệp vụ là private read/write 0, mutation server-only qua CAS.
Start cùng request ID trả cùng run đang sống; finish cùng kết quả là idempotent,
khác kết quả bị từ chối. Finish hiện ghi run + tiến độ + clear activity nguyên tử.

Vé khởi tạo 5; mỗi ngày UTC+7 nhận thêm 5, tối đa 20. Ngày marker vẫn tăng khi
đang đầy; không tích phần tràn để nhận lại sau. Clock lùi không phát vé.

Config hiện có first_rewards/repeat_rewards cho đủ 20 tầng, gồm EXP, Gold, Gem,
mảnh Pháp Tắc và thẻ boost theo từng tầng. Không sao chép bảng amount sang client.
UI preview đọc trực tiếp cấu hình; finish hiện **chỉ cập nhật tiến độ**, không grant
các reward này. Càn quét chỉ là intent UI và chưa tiêu vé/cấp thưởng.

Yêu cầu cho phần settlement còn thiếu: server kiểm tra tầng đã vượt, đủ vé,
idempotency và cấp thưởng/trừ vé nguyên tử; first-clear chỉ nhận một lần. Không
tự coi các yêu cầu tương lai này là chức năng hiện đã chạy.

## 11. Interface và log

Client entry points: `TrialTowerService.load_status/request`,
`TrialTower.set_snapshot`, `TrialTowerBattle.setup_duel`,
`TowerPreparation.setup_tower/choose_card`, `HUD.setup_duel`, `SkillManager.try_cast`.
Backend: `trialTowerStatus`, `startTrialTower`, `prepareTrialTower`, `finishTrialTower`
trong `nakama/data/modules/progression_rpc.ts`.

Log JSONL: `user://logs/trial_tower/`, có base hai bên, hệ số stat/speed, snapshot
linh căn/pháp bảo trong trận, bonus thẻ, cast/projectile, raw damage, crit/hệ/DEF,
shield, HP loss/overkill và summary. Không log token/mật khẩu/toàn bộ account.
Chỉ ghi giá trị thực, không reroll RNG hoặc tính damage thêm lần nữa.
Đọc bằng `client/tools/analyze_tower_log.ps1`; tắt ghi bằng `--no-tower-log`.

## 12. Tiêu chí nghiệm thu và giới hạn

- Kiểm tra đủ 20 hệ số stat 70..260% và speed 70..165%, không nhân chồng tầng.
- Kiểm tra native RPC: quyền sở hữu, khóa tầng, same-server/generation, replay,
  draft hợp lệ, countdown/timing, luật cũ, abandon và CAS settlement.
- Fixture trang bị +500 ATK/+50 DEF/+2000 HP chỉ nâng hero; tư chất bằng nhau,
  level linh căn hero 10 thì Tâm Ma 0, không có skill/passive pháp bảo phía địch.
- Combat thật hai chiều: skill định hướng/homing/passive, khống chế, hit feedback,
  giảm damage theo DEF, không tự bắn trúng phe mình.
- Cấp 20 tạm giữ đúng hai tỷ lệ, không mở khóa skill chưa có; 19 vòng card và
  countdown 5..1; manual bấm không bypass cooldown.
- UI phone/tall-phone/tablet: camera 70%, giữ world/range, spawn thấp, fan không
  chồng hitbox, icon mode đúng trước/sau bấm, joystick + skill hai ngón.
- Chưa nghiệm thu kinh tế nhận thưởng/càn quét cho đến khi có implementation.

Test tham chiếu:

```text
server: npm run build (trong nakama/)
server: node tests/test_trial_tower_status.cjs
server: node tests/test_multiserver_runtime.cjs --trial-tower-only
client: TestTrialTowerBattle.tscn, TestTrialTowerUI.tscn
client: TestTowerCombatParity.tscn, TestAutoSkillRotation.tscn
client: TestAdditiveCombatBonuses.tscn
both: tests/run_static_tests.ps1
```

Kết quả lịch sử gần nhất: các test Tháp/build/client static đạt; suite server tổng
có lỗi cửa hàng không thuộc Tháp (expected 23 vật phẩm, catalog 33). Không tuyên bố
toàn bộ suite server xanh. Lần viết contract này chỉ kiểm tra tài liệu/registry,
không chạy lại combat hoặc deploy. Production chưa được cập nhật bởi tác vụ này.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-22 | Hợp nhất contract Tháp: kế thừa, hai đường balance, draft, UI/manual, RPC/storage và phần thưởng/càn quét còn thiếu. |
