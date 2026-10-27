# C218 — Khung cân bằng áp lực Campaign theo wave

- **Version:** 2.4.2
- **Status:** IN_PROGRESS
- **Updated:** 2026-10-26
- **Owner:** Gameplay Balance
- **Scope:** Mọi Campaign arc có `order >= 1`, mọi stage và Normal/Epic/Legend. Không áp dụng cho training, admin, Trial Tower hoặc Tribulation.

## 1. Mục tiêu

Campaign phải có đường cong áp lực tăng có kiểm soát. Người chơi đạt đúng chiến lực đề cử không được gặp “tường chỉ số” ở wave 1–3 rồi mất áp lực từ wave 5 do thẻ, cấp trong trận, multi-projectile hoặc AOE tăng nhanh hơn quái.

Contract này định nghĩa một phép đo chung cho mọi hero, stage và arc; quy trình sinh/hiệu chỉnh wave; cách suy ra chiến lực đề cử; và các gate tự động trước khi publish. Cân bằng không được dựa riêng vào tổng HP, tổng số quái hoặc cảm giác chơi một hero.

## 2. Nguyên tắc bất biến

1. Server config và catalog là nguồn gameplay có thẩm quyền. Client chỉ hiển thị kết quả đã publish.
2. Mọi stage phải vượt benchmark **trung hòa hệ**. Kết quả lợi hệ và bất lợi hệ là các lane kiểm tra bổ sung, không được dùng để che lỗi lane trung hòa.
3. Benchmark phải mô phỏng sức mạnh hero sau từng lượt nhận thẻ; không giữ DPS wave 1 cho toàn trận và không giả định thẻ tối ưu tuyệt đối.
4. Wave đầu kiểm tra thao tác và hình thành build; wave giữa kiểm tra chất lượng build; wave cuối tạo cao trào. Wave 2 không được là wave khó nhất của stage thường.
5. Tăng số quái không mặc nhiên tăng áp lực: AOE, xuyên mục tiêu và EXP nhận thêm phải được đưa vào phép tính.
6. `recommended_power` phải được suy ra từ benchmark stage, không nhập theo cấp số nhân độc lập với combat.
7. Không thay đổi dữ liệu người chơi. Migration balance phải versioned, idempotent và chỉ tác động catalog/config được chỉ định.

## 3. Không gian benchmark bắt buộc

Mỗi stage-level phải tạo ma trận sau:

| Trục | Giá trị bắt buộc |
|---|---|
| Arc/stage | Tất cả stage campaign đã bật |
| Difficulty | Normal, Epic, Legend |
| Hero | Mỗi hero sở hữu hợp lệ; thêm các archetype ranged, melee, single-target, AOE/control |
| Quan hệ hệ | Bất lợi, trung hòa, lợi thế; lane trung hòa là chuẩn nghiệm thu |
| Build RNG | P25, P50 và P75 theo chất lượng lựa chọn thẻ hợp lệ |
| Trang bị | Không trang bị; loadout chuẩn tại power mục tiêu; loadout chống chịu và tấn công |
| Điều khiển | Đứng đánh hợp lệ và bot di chuyển chuẩn; không dùng perfect dodge làm baseline |

Baseline để chốt `recommended_power` là hero không lợi hệ, build P50, loadout chuẩn, bot di chuyển chuẩn. P25 dùng để phát hiện phụ thuộc RNG; P75 dùng để phát hiện late-wave mất áp lực.

## 4. Snapshot sức mạnh hero theo wave

Tại đầu và cuối mỗi wave `w`, benchmark phải ghi:

```text
HeroSnapshot(w) = {
  hp, max_hp, shield, healing_per_second,
  atk, def, move_speed,
  basic_attack_cooldown,
  skill_levels, skill_cooldowns,
  target_count, pierce_count, aoe_area,
  outgoing_element_multiplier,
  incoming_element_multiplier,
  cards_selected, run_level
}
```

Các thuộc tính dùng đúng runtime. Ví dụ cooldown đánh thường phải lấy từ `Player.get_basic_attack_cooldown_duration()`, không suy diễn `attack_speed` là số hit/giây.

EXP và lượt chọn thẻ là một phần của pressure loop:

```text
PowerBudget(w + 1) = PowerBudget(w)
                   + level_growth(w)
                   + expected_card_gain(w)
                   + expected_skill_gain(w)
```

Nếu một wave cấp nhiều EXP hơn, phần sức mạnh nó trao cho các wave sau phải được trừ vào lợi ích của việc tăng mật độ quái.

## 5. Ma trận tính combat của một wave

### 5.1. Damage hero gây ra

Với quái `e`:

```text
DamagePerHit(h,e) = RawDamage(h)
                  × ExpectedCrit(h)
                  × ElementMultiplier(h,e)
                  × 100 / (100 + EffectiveDEF(e))

HitsToKill(h,e) = ceil(HP(e) / DamagePerHit(h,e))
```

Kỹ năng phải tính theo cast thực tế: cooldown, giới hạn lần dùng, số projectile/strike, pierce, vùng AOE, thời gian bay, phạm vi, hit rule và xác suất số mục tiêu thực sự đứng trong vùng. Không nhân damage AOE với toàn bộ số quái nếu hình học spawn không cho phép.

```text
EffectiveTargets(skill,w) = min(configured_target_cap,
                                geometric_targets_reached(skill,w))

HeroDamageTimeline(w,t) = basic hits + skill hits + DOT tại thời điểm t
```

`ClearTime(w)` là thời điểm quái cuối cùng chết hoặc bị tính là leak, lấy từ timeline; không dùng `total_hp / sheet_dps` làm kết quả nghiệm thu duy nhất.

### 5.2. Damage quái gây ra

Mỗi quái có thời điểm spawn, tiếp cận, bắt đầu đánh, bị control và chết:

```text
EnemyDPS(e,t) = Alive(e,t)
              × InRange(e,t)
              × ATK(e)
              × attack_speed(e)
              × ElementMultiplier(e,h)
              × 100 / (100 + EffectiveDEF(h,t))
              × ControlUptimeFactor(e,t)

IncomingDamage(w) = integral(sum(EnemyDPS(e,t)), t=wave_start..wave_end)
```

Slow, freeze, stun, knockback, ranged positioning và thời gian tiếp cận phải thay đổi timeline. Báo cáo thêm biên `face_tank` khi mọi quái trong tầm để phát hiện burst nguy hiểm, nhưng không dùng biên này làm kết quả duy nhất.

### 5.3. Ngân sách sống sót và leak

```text
SurvivalBudget(w) = HP_at_start
                  + usable_shield
                  + healing_during_wave
                  + mitigation_value

DamagePressure(w) = IncomingDamage(w) / SurvivalBudget(w)
TimePressure(w)   = ClearTime(w) / AllowedClearTime(w)
LeakPressure(w)   = weighted_leaks / allowed_leaks

WavePressure(w) = max(DamagePressure, TimePressure, LeakPressure)
```

`AllowedClearTime` lấy từ thời lượng spawn, khoảng nghỉ và điều kiện thất bại thực tế của mode. Thành phần không áp dụng phải bằng `0`, không được chia cho 0.

`WavePressure` là chỉ số chẩn đoán, không phải xác suất thắng. Xác suất thắng chỉ được báo cáo từ nhiều lượt benchmark có RNG thực.

## 6. Đường cong mục tiêu chuẩn hóa

Chuẩn hóa vị trí wave:

```text
p = (wave_index - 1) / max(total_waves - 1, 1)
```

| Pha | Vị trí `p` | WavePressure P50 mục tiêu | Clear rate mục tiêu ở power đề cử |
|---|---:|---:|---:|
| Mở đầu | 0–0,15 | 0,35–0,60 | 90–97% |
| Hình thành build | >0,15–0,35 | 0,50–0,70 | 85–93% |
| Giữa trận | >0,35–0,70 | 0,65–0,85 | 75–88% |
| Cao trào | >0,70–<1,00 | 0,75–0,95 | 65–82% |
| Final/boss | 1,00 | 0,90–1,10 | 50–70% |

Ràng buộc hình dạng:

- Wave 1 không vượt `0,50`; wave 2 không vượt `0,60`; wave 3 không vượt `0,70` ở baseline.
- Mức tăng giữa hai wave thường không quá `+0,15`.
- Không giảm quá `-0,10` nếu wave không được đánh dấu `recovery_wave`.
- Trung vị ba wave cuối không thấp hơn trung vị ba wave đầu.
- Không wave thường nào trước 50% stage được có pressure cao hơn final wave.
- Build P75 từ giữa stage không được có ba wave liên tiếp dưới `0,45`.
- Build P25 ở ba wave đầu phải đạt clear rate ít nhất 80%; stage không được bắt người chơi roll đúng thẻ để sống qua opening.

Difficulty dùng cùng hình dạng nhưng tăng target pressure có kiểm soát. Epic và Legend không được tạo spike opening bằng cách nhân đồng loạt ATK khi hero chưa có build.

## 7. Quy tắc phân bổ áp lực

### 7.1. Wave 1–3

- Ưu tiên kéo giãn `interval`/`start_delay`, giới hạn số quái đồng thời và tách ranged khỏi cụm melee.
- Chỉ dùng grunt/rusher nhẹ trước khi giới thiệu tanker, ranged control hoặc elite.
- Nếu stage yêu cầu kỹ năng xử lý đàn, cấp lựa chọn cần thiết trước khi kiểm tra nó.
- Không dùng burst đồng thời của nhiều entry để bù cho thiếu scaling cuối trận.

### 7.2. Wave giữa

- Tăng phối hợp vai trò: tanker che ranged, rusher buộc đổi vị trí, control phá nhịp đứng yên.
- HP/DEF phải tăng theo `PowerBudget(w)`, không chỉ theo số wave.
- Khi số mục tiêu tăng, benchmark phải kiểm tra lợi ích AOE và giảm EXP/đổi đội hình nếu mật độ đang làm hero mạnh nhanh hơn quái.

### 7.3. Wave cuối

- Tăng effective HP, kháng control có giới hạn, tách đội hình hoặc thêm elite mechanic; không chỉ spam số lượng vào cùng một vùng AOE.
- Ít nhất một lane kiểm tra single-target và một lane kiểm tra xử lý đàn trong 30% cuối stage.
- Boss không miễn nhiễm toàn bộ build; resistance/control floor phải được công bố trong data.
- Wave recovery phải explicit và tối đa một wave liên tiếp.

## 8. Scaling giữa stage và arc

Mỗi stage kế tiếp lấy benchmark power thực của mốc mở khóa, không lấy `recommended_power` cũ làm đầu vào vòng lặp.

```text
TargetHeroPower(stage) = expected permanent power tại level mở khóa
                         + expected earned upgrades trước stage

EnemyBudget(stage,w) = TargetHeroPower(stage)
                     × PhaseCurve(normalized_wave)
                     × DifficultyFactor
                     × RoleCompositionFactor
```

Arc định nghĩa identity qua roster, hệ và mechanic; không được định nghĩa độ khó chỉ bằng một multiplier chung. Khi chuyển arc:

- Stage đầu arc mới có một đoạn onboarding mechanic nhưng không reset toàn bộ pressure.
- Lane trung hòa hệ phải nằm trong target.
- Lợi hệ có thể dễ hơn nhưng không dưới floor P75.
- Bất lợi hệ được phép khó hơn nhưng ba wave đầu không được thành hard gate.

## 9. Tính chiến lực đề cử

Với mỗi stage-level, chạy tìm kiếm nhị phân trên các snapshot loadout hợp lệ:

1. Chọn power thử `P`.
2. Chạy đủ hero/archetype trung hòa hệ với build RNG P25/P50/P75.
3. Đo clear rate toàn stage, không chỉ wave cuối.
4. `recommended_power` là `P` nhỏ nhất mà baseline P50 đạt target clear rate của difficulty và không vi phạm opening gate.
5. Làm tròn theo bậc hiển thị sau khi benchmark, không làm tròn trước.

UI phải ghi đây là “đề cử theo build trung vị”. Không so sánh trực tiếp score với tổng HP quái.

## 10. Schema cấu hình mục tiêu

`campaign_wave_pressure` version 2 mở rộng version 1 và giữ tương thích đọc trong migration:

```json
{
  "version": 2,
  "reference_model": {
    "element_lane": "neutral",
    "card_quantiles": [0.25, 0.5, 0.75],
    "simulation_runs": 200,
    "movement_profile": "standard_bot"
  },
  "phase_targets": [
    {"id":"opening","from":0.0,"to":0.15,"pressure_min":0.35,"pressure_max":0.60},
    {"id":"build","from":0.15,"to":0.35,"pressure_min":0.50,"pressure_max":0.70},
    {"id":"mid","from":0.35,"to":0.70,"pressure_min":0.65,"pressure_max":0.85},
    {"id":"climax","from":0.70,"to":0.999,"pressure_min":0.75,"pressure_max":0.95},
    {"id":"final","from":1.0,"to":1.0,"pressure_min":0.90,"pressure_max":1.10}
  ],
  "shape_limits": {
    "max_step_up": 0.15,
    "max_step_down": 0.10,
    "opening_wave_caps": [0.50, 0.60, 0.70],
    "p75_low_pressure_floor": 0.45,
    "p25_opening_min_clear_rate": 0.80
  },
  "difficulty": {
    "normal":{"target_clear_rate":0.70},
    "epic":{"target_clear_rate":0.60},
    "legend":{"target_clear_rate":0.50}
  }
}
```

Giá trị publish có thể được hiệu chỉnh bằng dữ liệu playtest nhưng phải giữ schema, lane trung hòa và shape gates. Thiếu/sai config chặn publish campaign balance; không dùng local gameplay fallback.

## 11. Báo cáo bắt buộc cho từng stage

Tool balance phải xuất JSON/CSV và bản tóm tắt đọc được:

| Trường | Nội dung |
|---|---|
| `arc_id/stage_id/level_id` | Định danh |
| `hero_id/archetype/element_lane/card_quantile` | Lane benchmark |
| `wave` và `phase` | Vị trí trong stage |
| `hero_snapshot_before/after` | Sức mạnh thực theo wave |
| `enemy_count/total_ehp/spawn_duration` | Tải wave |
| `hits_to_kill_by_enemy` | Số hit basic/skill |
| `clear_time/incoming_damage/survival_budget/leaks` | Kết quả |
| `damage_pressure/time_pressure/leak_pressure/wave_pressure` | Chẩn đoán |
| `clear_rate/death_reason` | Kết quả nhiều lượt |
| `violations` | Gate bị vi phạm |

Mỗi thay đổi balance phải lưu before/after diff; không chấp nhận chỉ báo “PASS” mà thiếu ma trận.

## 12. Pipeline triển khai

1. **Extract:** tải snapshot server của heroes, skills, cards, enemies, stages, progression và difficulty.
2. **Simulate:** chạy ma trận ở mục 3 bằng đúng combat formula/runtime timing.
3. **Diagnose:** đánh dấu opening spike, pressure valley, AOE inversion, RNG gate, elemental gate và recommended-power mismatch.
4. **Tune:** ưu tiên timing/composition; sau đó HP/DEF/control; ATK là núm chỉnh cuối cùng cho opening.
5. **Re-simulate:** lặp đến khi tất cả shape gates đạt.
6. **Generate:** ghi thay đổi có version vào seed source và sinh report before/after.
7. **Validate:** roster, boss, EXP, reward, mode multiplier, idempotence, save/resume và config gate.
8. **Publish:** deploy runtime nếu cần, seed catalog/System config rồi publish snapshot.
9. **Canary:** thu telemetry fail wave/death reason theo power band; không tự động sửa live data.
10. **Promote/Rollback:** promote khi KPI đạt; rollback bằng snapshot catalog/config trước migration.

## 13. Acceptance gates

- 100% campaign stage-level có report cho neutral P25/P50/P75.
- Không vi phạm shape gates mục 6.
- `recommended_power` sai lệch không quá 10% so với power benchmark tìm được.
- Không hero/archetype nào có opening clear rate thấp hơn floor chỉ vì không có lợi hệ.
- Late-stage P75 không có pressure valley ba wave liên tiếp.
- EXP thực nhận, số lượt chọn thẻ và skill level trong mô phỏng khớp runtime.
- Damage/hit, cooldown, crit kỳ vọng và DEF curve có parity với Godot.
- Migration lặp lại không đổi dữ liệu; boss/roster/reward không mất.
- Backend build, client/server static suite và benchmark regression PASS.
- Báo cáo canary phân nhóm theo stage, difficulty, hero, power ratio, wave chết và nguyên nhân chết.

## 14. Kế hoạch chuyển đổi từ version 1

Version 1 tiếp tục mô tả dữ liệu đang chạy: giảm count bốn wave đầu, tăng HP/DEF và skill recovery theo block bốn wave. Version 2 chưa tự động thay đổi stage data cho tới khi simulator, report và toàn bộ acceptance gate hoàn tất.

Thứ tự rollout:

1. Xây simulator read-only và tạo baseline toàn campaign.
2. Hiệu chỉnh `stage_1_03` làm stage chuẩn kiểm chứng.
3. Áp dụng theo từng arc, bắt đầu Normal; sau đó Epic/Legend.
4. Recompute `recommended_power` sau cùng.
5. Publish canary, theo dõi rồi mới mở rộng toàn bộ server.

## 15. Changelog

Local operation 2026-10-27 (explicit historical results requested): sync_campaign_recommendations_local.cjs --check/--apply/--verify PASS. All150 Arc1–5 recommended_power rows changed to the exported historical JSON and matched on readback. Develop target survival_td_local at127.0.0.1:7350; config version40→41 with identical active settings. Every other stage-level field and all outside rows (including Arc6) were preserved. No profile mutations or production access. Before/after backup: workspace .tmp/c218-db-recommendations/1793092410267/. Seed source was intentionally not rewritten; a later full seed can replace these DB-only values unless the selected recommendations are explicitly incorporated into seed input. This operation does not resolve the broader C218 calibration/acceptance gates.

Arc 2 Normal is recalibrated toward minimum reference levels `10..19` across its ten stages. Every authored enemy entry, including bosses, receives the one-time stage correction `0.45 + 0.40 × (stage_index - 1) / 9` on `hp_mul`, `atk_mul`, and `def_mul`; movement, counts, cadence, EXP, roles, and rewards do not change. The first runtime probe rejected the analytical `0.67` opening factor: Lv10 passed W4 but died at W6 after roughly 1.46–1.52K incoming damage against about 924 HP. Stage metadata records version/factor so the revised migration remains idempotent. C156 then applies difficulty once at `1.00 / 1.25 / 1.50`. Existing Arc 2 recommendation checkpoints are stale and must be regenerated before writing recommended power.

Calibration search has no Arc or persistent-level ceiling. With harness flag
`--uncapped-level=true`, only the in-memory progression snapshot extends the
hero cap to the tested level; authored stat growth and CP evaluation use that
same snapshot. Levels above the gameplay cap are extrapolated balance results.
Each failed level is checkpointed with `last_tested_level` and `next_level`.
Existing v4 PASS rows remain valid, and capped UNSOLVED rows resume above their
previous tested maximum. Search continues until PASS or user cancellation.

| Version | Date | Change |
|---|---|---|
| 2.4.2 | 2026-10-27 | User-directed application of historical Arc 1–5 recommendation JSON to the isolated develop DB. Selectively update only recommended_power for exactly 150 stage-level pairs, back up before/after, preserve all other fields and Arc 6, and advance the local config version with the identical active settings snapshot. Historical fingerprints remain unchanged; this is not a fresh calibration or production publication. Seed source is not rewritten by this DB-only operation. |
| 2.4.1 | 2026-10-27 | Allow explicit read-only runtime calibration with --arc=6 (hero_3, W19 checkpoint). Default calibration and unfiltered --write remain Arc 1–5; existing fingerprint gates and gameplay inputs are unchanged. Historical JSON extraction is a separate report, not a validated catalog write. |
| 2.4.0 | 2026-10-27 | Recurve Arc 2 with runtime-corrected stage factors `0.45..0.85` to target Normal levels `10..19`; align C156 Epic/Legend multipliers to `1.25/1.50`; require fresh runtime recommendations. |
| 2.3.4 | 2026-10-27 | Tìm minimum level theo bước +3 cho đến lần PASS đầu tiên, sau đó dò ngược từng level đến biên FAIL gần nhất. Ví dụ 10 FAIL → 13 FAIL → 16 PASS → 15/14 để chốt minimum. Trạng thái `stride`/`descend`, biên fail và best pass được checkpoint để resume đúng pha. |
| 2.3.3 | 2026-10-26 | Benchmark flag `--guarantee-skills=true` inserts the first legal unfinished hero skill into each offer and selects skills in pool order. Default gameplay offers remain random; persistent/run unlock gates and one-card-per-level budget remain enforced. Model v4/policy v2 invalidates older checkpoints. This measures survival with a guaranteed skill build, not ordinary offer RNG. |
| 2.3.2 | 2026-10-26 | Godot recommender chay survival benchmark that (`mortal=true`): HP khong con bi kep o 1. Persistent skill gate van dung level benchmark khi mortality bat. Row `UNSOLVED` luu ly do/telemetry cua level cao nhat; Arc dung sau Normal UNSOLVED de khong chay cac stage phu thuoc vo ich. Model v3 lam checkpoint v2 khong con hop le. |
| 2.3.1 | 2026-10-26 | Calibrator chỉ dùng một hero đồng hệ cho mỗi Arc (Hỏa/Thủy/Mộc/Kim/Thổ = hero_2/1/4/5/3). Trong cùng stage, Epic bắt đầu từ level Normal đã pass và Legend bắt đầu từ Epic; mỗi difficulty cũng giữ lower bound của stage trước. Kết quả được ghi atomic vào một JSON riêng sau từng row/Arc và tự resume; persistent skill unlock vẫn dùng level benchmark thật. |
| 2.3.0 | 2026-10-26 | Thay proposal `analytical_power_factor` bằng Godot runtime calibrator. Stage pass theo checkpoint lũy tiến W4/W9/W14/W19 với Skill 1/1–2/1–3/1–4 max, neutral element, offer/card policy thật, HP xuyên wave và clear-rate nhiều seed. Report ghi base stats, persistent level và per-hero CP; `--write` chỉ cho phép full catalog không filter và từ chối mọi row UNSOLVED. |
| 2.2.0 | 2026-10-26 | Áp dụng `campaign_opening_relief_version: 1` cho 50 campaign stage: giảm mật độ count wave 1/2/3 theo 80%/65%/80%, tăng giãn spawn và giữ chính xác EXP theo wave. Migration idempotent, không đổi boss/loot; regression Node và Godot headless đọc dữ liệu thật đều phải pass. Late-game simulator vẫn là hạng mục tiếp theo, chưa auto-tune/publish. |
| 2.1.1 | 2026-10-26 | Baseline engine bổ sung `time_pressure`, tách persistent/run level và binary-search `analytical_power_factor`. CLI có `--proposal=path` để xuất đủ 150 stage-level review-only; không có đường tự ghi `stages.json`/`recommended_power`. |
| 2.1.0 | 2026-10-26 | Triển khai baseline read-only: `data/campaign_pressure_profiles.json` chứa ArcPressureProfile cho đủ 5 Campaign Arc; `tools/campaign_pressure_engine.cjs` mô phỏng deterministic neutral lane P25/P50/P75 và sinh pressure/violation report cho Normal/Epic/Legend; regression chạy đủ 50 stage. Chưa ghi stage data hoặc publish balance. |
| 2.0.1 | 2026-10-26 | Bổ sung kế hoạch triển khai canonical tại `docs/C218_CAMPAIGN_PRESSURE_IMPLEMENTATION_PLAN.md`: engine/simulator cho mọi Arc, ArcPressureProfile, generator/recommendation, shadow benchmark, canary và rollout theo Arc/difficulty. Chưa thay đổi live balance. |
| 2.0.0 | 2026-10-26 | Định nghĩa framework áp lực dùng cho mọi stage/arc: snapshot hero theo wave, neutral-element benchmark, card quantiles, pressure formula, target curve, recommended-power calibration, report, rollout và acceptance gates. Chưa thay đổi live balance. |
| 1.0.0 | 2026-10-25 | Four-wave opening relief and additive creep pressure; revised campaign lengths. |
