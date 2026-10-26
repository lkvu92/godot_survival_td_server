# C218 — Kế hoạch triển khai Campaign Pressure Engine

- **Liên kết contract:** `C218_CAMPAIGN_WAVE_PRESSURE` v2.3.1
- **Trạng thái:** IN_PROGRESS — Godot runtime checkpoint calibrator đã triển khai và smoke-test; chưa ghi full catalog
- **Phạm vi:** Campaign Arc 1–5, mọi stage, Normal/Epic/Legend; mỗi Arc dùng đúng một hero tham chiếu đồng hệ

## Outcome

Xây một pipeline balance dùng chung thay vì cân bằng từng stage thủ công:

```text
catalog/config snapshots
        ↓
Pressure Simulator
        ↓
ArcPressureProfile + StageProgression
        ↓
proposed wave data + recommended power + report
        ↓
validation / canary / publish
```

Đầu ra là proposal versioned cho toàn Arc. Stage chỉ có override tối thiểu cho boss, tutorial mechanic hoặc encounter đặc biệt; không có bảng HP/ATK chỉnh tay độc lập cho từng wave như nguồn cân bằng chính.

## Nguyên tắc triển khai

1. Simulator ban đầu read-only: không ghi `stages.json`, DB, profile hay remote config.
2. Công thức damage, DEF, elemental matchup, cooldown, EXP và card selection phải có parity với runtime Godot; parity sai thì dừng rollout.
3. `ArcPressureProfile` sinh target cho mọi stage trong Arc từ ordinal chuẩn hóa, sau đó generator đề xuất thay đổi. Chỉ bước approval mới được ghi source data.
4. Lane trung hòa hệ/P50 là baseline; P25/P75 và bất lợi/lợi thế là guardrail.
5. `recommended_power` được sinh sau khi balance, không được dùng làm input để “hợp thức hóa” một stage quá khó.
6. Rollout theo Arc và difficulty, nhưng engine/profile/schema được hoàn thành cho tất cả Arc trước khi publish Arc đầu tiên.

## Kiến trúc và artifact

| Artifact | Vị trí đề xuất | Trách nhiệm |
|---|---|---|
| `campaign_pressure_profiles.json` | `server/data/` | Profile dữ liệu cho từng Arc; seed/publish authoritative |
| Pressure simulator | `server/tools/` | Discrete-event simulation read-only, deterministic seed |
| Benchmark fixtures | `server/tests/fixtures/` | Snapshot hero/loadout/card/RNG và expected report |
| Report | `server/reports/campaign_pressure/` (gitignored) | JSON/CSV/Markdown before-after theo Arc/stage/wave |
| Proposal manifest | `server/data/` hoặc generated review artifact | Diff có version, không tự apply |
| Client presentation | `client/src/ui/StageSelect.gd` | Chỉ đọc `recommended_power` đã publish; không tính balance cục bộ |

Không tạo local gameplay fallback. File profile phải qua pipeline seed/config và snapshot server như các gameplay config khác.

## Schema `ArcPressureProfile`

Mỗi Arc có đúng một profile versioned:

```json
{
  "arc_id": "arc_2",
  "version": 1,
  "stage_progression": {
    "power_start": 1.0,
    "power_end": 2.4,
    "curve": "ease_in_out"
  },
  "wave_phases": [
    {"id":"opening","from":0.0,"to":0.15,"pressure":[0.35,0.60]},
    {"id":"build","from":0.15,"to":0.35,"pressure":[0.50,0.70]},
    {"id":"mid","from":0.35,"to":0.70,"pressure":[0.65,0.85]},
    {"id":"climax","from":0.70,"to":0.999,"pressure":[0.75,0.95]},
    {"id":"final","from":1.0,"to":1.0,"pressure":[0.90,1.10]}
  ],
  "shape_limits": {
    "max_step_up": 0.15,
    "max_step_down": 0.10,
    "opening_caps": [0.50,0.60,0.70]
  },
  "composition": {
    "opening_allowed_roles": ["grunt","rusher"],
    "mid_min_role_mix": 2,
    "late_requirements": ["single_target_check","crowd_check"],
    "max_same_aoe_cluster": 0.5
  },
  "difficulty_clear_rate": {"normal":0.70,"epic":0.60,"legend":0.50}
}
```

`stage_progression` dùng chỉ số stage trong Arc:

```text
s = (stage_ordinal - 1) / max(stage_count - 1, 1)
StageBudget = lerp(power_start, power_end, curve(s))
WaveBudget  = StageBudget × PhaseTarget(normalized_wave)
```

Generator phân bổ `WaveBudget` vào timing, role composition, HP, DEF, control-resistance và elite mechanics. ATK chỉ được tăng sau khi chứng minh wave không tạo burst opening.

## Phase 0 — Data audit và baseline

**Mục tiêu:** biến catalog hiện tại thành input xác định được cho simulator.

1. Validate toàn bộ `arcs`, `stages`, `stage_levels`, `enemies`, `heroes`, `skills`, `cards`, `progression` và difficulty modifiers.
2. Chuẩn hóa mapping role quái cho tất cả roster Arc; thiếu role là lỗi audit.
3. Extract lịch spawn thực, số quái đồng thời, EHP, DPS, EXP và boss mechanics từng wave.
4. Định nghĩa snapshot persistent power theo milestone account/hero của từng stage; bổ sung no-gear, standard, offensive, defensive loadout.
5. Định nghĩa policy dựng build P25/P50/P75 từ pool thẻ có thật và RNG deterministic.
6. Generate baseline report cho mọi Arc, không thay data.

**Gate:** 100% stage-level được parse; không duplicate/missing stage id; baseline report có đủ wave và hero lane.

## Phase 1 — Pressure Simulator

**Mục tiêu:** đo đúng áp lực runtime theo timeline, không dùng sheet DPS.

### 1A. Core event timeline

- Events: spawn, approach, enter-range, cast, projectile-hit, DOT tick, control start/end, death, leak, EXP, level-up, card choice.
- Mỗi actor giữ snapshot stats bất biến/biến đổi đúng lifecycle runtime.
- Event queue deterministic theo `seed`; cùng input luôn cho cùng output.
- Kết quả mỗi wave gồm `ClearTime`, `IncomingDamage`, `SurvivalBudget`, leaks, kill timeline, damage timeline và `WavePressure`.

### 1B. Combat parity adapter

- Port có kiểm soát công thức GDScript sang tool module hoặc gọi harness runtime; không viết công thức thứ hai không có parity test.
- Kiểm tra damage per hit, crit expectation, element/resistance, DEF curve, basic cooldown, skill cooldown/cast count, slow/freeze, shield/heal.
- Tạo fixtures từ combat log thật và so sánh tolerance được công bố.

### 1C. Hero power growth adapter

- Track EXP theo kill thực tế, level-up, card offer, card pick và skill levels qua từng wave.
- AOE/pierce tính theo vị trí/lịch spawn, không lấy total enemy count làm target count.
- Báo riêng `P25/P50/P75` và face-tank bound để chẩn đoán burst.

**Gate:** simulator match fixture Godot; một thay đổi combat formula làm CI fail nếu không cập nhật fixture/profile có version.

**Trạng thái hiện tại (2026-10-26):** Đã có baseline read-only tại `tools/campaign_pressure_engine.cjs`, profile cho 5 Arc tại `data/campaign_pressure_profiles.json` và regression toàn bộ 50 stage. Engine hiện là `analytical_single_target_neutral_v1`: nó tách persistent hero level với run level, tính timeline spawn/focus, expected crit, DEF curve, EXP/run-level theo wave và P25/P50/P75 multiplier; mọi report đều gắn model này. Engine xuất review-only proposal cho đủ stage-level bằng binary search `analytical_power_factor`; proposal không thể apply stage data. Parity skill geometry, control timeline, equipment loadout và bot di chuyển còn là phần tiếp theo của Phase 1, nên output hiện tại chỉ dùng để phát hiện spike/valley và tạo baseline, chưa được phép auto-tune/publish.

**Mốc opening safety (2026-10-26):** `tools/campaign_opening_relief.cjs --write` đã áp dụng migration idempotent v1 cho toàn bộ 50 campaign stage trong `data/stages.json`. Wave 1/2/3 lần lượt dùng hệ số count 80%/65%/80%, khoảng spawn giãn 15%/35%/20%; EXP mỗi wave vẫn khớp chính xác contract. `tests/test_campaign_opening_relief.cjs` và Godot scene `tests/TestCampaignOpeningRelief.tscn` đọc trực tiếp data thật. Đây chỉ là relief an toàn đầu trận; không thay thế calibration late-game hay publish/seed remote config.

**Mốc runtime recommendation (2026-10-26):** `tools/godot_campaign_recommender.cjs` điều phối `client/tests/CampaignRecommendationHarness.tscn`. Harness dùng trực tiếp Player/Enemy/WaveManager/SkillManager/CardManager, neutral hóa hệ và kiểm tra lũy tiến W4 Skill1 max, W9 Skill1–2 max, W14 Skill1–3 max, W19 Skill1–4 max. Auto policy chỉ chọn trong offer thật. Report lưu base stats, minimum persistent level, CP từng hero, HP và skill tại checkpoint. Proposal `analytical_power_factor` cũ bị khóa vì sai đơn vị; `--write` mới từ chối filter và mọi kết quả UNSOLVED.

## Phase 2 — ArcPressureProfile cho mọi Arc

**Mục tiêu:** tạo profile data cho toàn bộ Arc trước khi áp balance.

1. Tạo một profile cho từng Arc có `order >= 1`.
2. Derive `power_start/power_end` từ persistent milestone và baseline report, không copy tỷ lệ từ Arc khác.
3. Định nghĩa identity mỗi Arc: roster roles, frequency rusher/ranged/tanker, elite mechanics, control resistance cap và boss pattern.
4. Áp cùng phase curve chuẩn hóa cho tất cả stage bất kể 15, 18 hay 20 wave.
5. Cho phép `stage_override` có lý do bắt buộc: onboarding mechanic, milestone boss, final boss hoặc accessibility exception. Override phải ghi delta so với profile và expiry/review owner.
6. Validate profile coverage: đủ stage ordinal, difficulty target, neutral lane và late-game checks.

**Gate:** không Arc nào dùng fallback profile; stage override không vượt 20% wave nếu chưa có approval gameplay.

## Phase 3 — Generator, recommended power và proposal review

**Mục tiêu:** sinh proposal toàn Arc có thể review trước khi ghi dữ liệu.

1. Input là profile + stage snapshot + benchmark target; output là proposal manifest theo stage/wave.
2. Điều chỉnh theo thứ tự ưu tiên: spawn timing → role mix/positioning → HP/DEF → elite/control counterplay → ATK.
3. Giữ stage ID, roster ownership, final boss, loot, EXP/reward policy và mode modifier trừ khi proposal ghi rõ thay đổi tương ứng.
4. Tính lại `recommended_power` bằng binary search trên baseline neutral P50; kiểm tra P25/P75 guardrails.
5. Sinh before/after matrix và danh sách violation; `--apply` chỉ cho phép khi `--reviewed-manifest <hash>` khớp artifact đã duyệt.
6. Migration catalog phải idempotent, có `pressure_profile_version` và rollback snapshot.

**Gate:** proposal không có opening spike, pressure valley late game hay recommended power mismatch theo C218 section 13.

## Phase 4 — Thứ tự rollout

### 4A. Shadow benchmark toàn game

- Deploy tool/CI read-only và profile cho tất cả Arc.
- Không thay `stages.json`, database hay recommended power.
- Xuất dashboard/report để quyết định band cần tune.

### 4B. Calibration anchor

- Chọn một stage thường đại diện của mỗi Arc để hiệu chỉnh role identity. Đây chỉ là anchor, không phải công thức riêng cho stage đó.
- `stage_1_03` là anchor phù hợp cho Arc Băng vì có opening spike đã đo được; Arc khác chọn stage không-boss giữa dải level.
- Sau khi anchor đạt, generator phải áp target liên tục cho toàn bộ stage trong Arc.

### 4C. Publish theo Arc

1. Arc 1 Normal → Epic → Legend.
2. Arc 2 Normal → Epic → Legend.
3. Arc 3–5 theo cùng thứ tự.
4. Mỗi đợt publish chỉ một Arc/difficulty; giữ snapshot rollback.
5. Không thay nhiều Arc cùng lúc để telemetry còn chẩn đoán được.

### 4D. Canary và promotion

- Telemetry bắt buộc: stage, difficulty, hero, power ratio, element lane, wave chết, death/leak reason, card quantile proxy và clear time.
- So sánh trước/sau theo cohort đủ mẫu; kiểm tra wave 2 không còn là mode fail cao nhất nếu stage không có mechanic chủ đích.
- Rollback profile/data snapshot nếu clear rate hoặc retention lệch ngoài band đã phê duyệt.

## Work breakdown đề xuất

| PR | Nội dung | Phụ thuộc | Gate |
|---|---|---|---|
| 1 | Schema profile v2, loader/validator, audit command | C218 | parse/coverage test |
| 2 | Event timeline + basic damage/DEF/element parity | PR1 | Godot fixture parity |
| 3 | Skills, control, EXP, cards và P25/P50/P75 adapter | PR2 | deterministic replay |
| 4 | Reporter + shape validator + CI artifacts | PR3 | full catalog baseline |
| 5 | Generator dry-run + review manifest + recommended-power search | PR4 | idempotence/rollback dry run |
| 6 | Profiles cho toàn bộ Arc và shadow benchmark | PR5 | no fallback/coverage |
| 7+ | Tune/publish từng Arc-difficulty | PR6 | canary acceptance |

## Acceptance trước khi viết balance live

- Baseline report đủ mọi Arc/stage/difficulty, neutral P25/P50/P75.
- Parity combat và progression với runtime đạt cho fixtures đã chọn.
- Mọi Arc có `ArcPressureProfile` versioned và validator pass.
- Generator ở chế độ dry-run không sửa dữ liệu.
- Mọi proposal có matrix before/after và review hash.
- Recommended power của proposal sinh từ benchmark, không còn dãy hard-code tĩnh không liên hệ combat.

## Acceptance trước khi publish Arc

- Không vi phạm opening caps/shape limits của C218.
- Late P75 không có ba wave liên tiếp dưới pressure floor.
- Neutral P50 đạt clear-rate target; P25 opening đạt floor.
- Boss, roster, rewards, EXP policy, difficulty modifier, save/resume và config-unavailable gate vẫn pass.
- Backend build, client/server static tests, simulator regression và canary dashboard pass.

## Không thuộc scope của plan này

- Tự động thay đổi profile người chơi, inventory hoặc quyền sở hữu hero.
- Tự động publish balance chỉ từ telemetry.
- Thay combat formula gameplay mà không có contract riêng.
- Dùng chiến lực leaderboard như DPS thực tế.

## Quyết định cần chốt trước PR1

1. Simulator là module TypeScript parity hay harness Godot headless làm oracle chính.
2. Cách biểu diễn bot di chuyển chuẩn và phạm vi “player skill” được chấp nhận.
3. Quy tắc chọn thẻ để tạo P25/P50/P75 từ pool hiện có.
4. Ngưỡng telemetry/cohort tối thiểu cho canary promotion.
