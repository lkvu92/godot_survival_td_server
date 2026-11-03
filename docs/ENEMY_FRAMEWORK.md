# Enemy framework v2 — C239

Khung mới được bật bằng `stage_rules.enemy_framework_version: 2`. Các stage hiện có chưa chuyển sang v2. Không có thay đổi DB/profile hoặc publication trong giai đoạn thử nghiệm.

## Nguồn dữ liệu

`server/data/progression.json → enemy_framework` là seed input. Khi phát hành qua quy trình config hiện có, Nakama lưu trong `game_config.progression` và trả qua bootstrap có xác thực. Client chỉ đọc snapshot đã validate; không đọc seed JSON để chơi offline.

- `species`: mỗi loài có base attributes, growth riêng, reward và tham chiếu presentation. Không có element hay danh sách skill theo loài.
- `skill_atlas`: mỗi ID có một element cố định, executor và dữ liệu từng level. Player/Enemy dùng chung resolver và executor.
- Stage entry: loài, level, hệ, skill/level, số lượng, EXP và lịch spawn. Difficulty override thay level/skill, không nhân stat lần nữa.

Catalog khởi đầu có 8 loài và 15 skill (5 hệ × strike/burst/vitality), mỗi skill có 5 level. Đây là bộ skill của pilot, không phải bản migration toàn bộ skill hero/boss cũ. Skill cũ tiếp tục chạy đường cũ cho đến khi được chuyển riêng.

```text
Stat = base + (level − 1) × growth
Skill damage cơ sở = ATK hiện tại × damage_multiplier(level skill)
```

Skill `direct` đánh một mục tiêu trong range; `area` chọn tâm ở mục tiêu đầu và gây damage các mục tiêu trong radius/range; `max_hp` là passive áp khi dựng actor. Burst có slow qua EffectService hiện có. VFX dùng CreepFireVisual/AtlasRegistry hiện có. Đòn direct hiện gây damage tức thì; chưa có projectile/windup mới. Mọi skill trang bị đều phải có hệ thuộc tập hệ của chủ thể.

## Ví dụ stage entry

```json
{
  "species_id": "stone_ape",
  "level": 60,
  "elements": ["wood", "fire"],
  "count": 4,
  "exp": 8,
  "skills": [{"skill_id": "fire_strike", "level": 2}],
  "interval": 1.2,
  "start_delay": 0,
  "spawn_role": "fast",
  "difficulty_overrides": {
    "epic": {"level": 65, "skills": [{"skill_id": "fire_strike", "level": 3}]},
    "legend": {"level": 70, "skills": [{"skill_id": "fire_strike", "level": 4}]}
  }
}
```

Thay `elements` bằng `random_elements: {"pool":["wood","fire"],"weights":{"wood":2,"fire":1},"count":2}` để chọn hệ khi loading. Các lượt chọn có trọng số, không trùng hệ trong cùng quái và dùng RNG riêng có seed. Cấu hình skill cụ thể phải tương thích với kết quả hệ; không tự bật mọi skill atlas. Khi random có thể bỏ mất hệ của skill đã trang bị, compiler sẽ từ chối kết quả đó; tác giả nên dùng pool/count bảo đảm hệ cần thiết.

Danh sách skill có thể học dùng `SharedSkillService.learnable(atlas, elements)`. Không có allowlist riêng theo loài. Pet dạy skill về sau chỉ cần lưu skill ID/level và kiểm tra cùng điều kiện hệ; chưa triển khai tính năng pet hay UI học skill trong C239.

## Đa hệ

Compiler dựng bảng 32×32 tập hệ. Người đánh chọn max, người thủ chọn min. Skill có hệ cố định luôn dùng đúng hệ skill, không tự chọn hệ khác của chủ thể. Đòn dùng tập hệ mới áp dụng cả hai phép chọn.

- Khắc ×1,30; trung tính ×1,00; bị khắc ×0,70.
- Mục tiêu vô hệ nhận ×1,30 từ đòn có hệ.
- Mục tiêu đủ năm hệ nhận ×1,00 từ đòn có hệ.
- Đòn vô hệ tạm dùng ×1,00.

Đây là hệ số khắc hệ trước các bonus affinity, trang bị và DEF. Các bonus/phòng thủ hiện có vẫn được giữ. Luật v2 áp khi một bên là actor v2 hoặc cast skill atlas chung; trận legacy không có bên v2 giữ công thức cũ.

## Loading, pooling và resume

Compiler mở rộng `count` thành descriptor riêng từng quái, resolve hệ, stat và skill trước trận; node vẫn spawn theo wave. Seed và descriptor được lưu để resume. Kiểu số được chuẩn hóa khi so descriptor sau JSON round-trip.

Resume tìm descriptor trong stage đã compile từ server hiện tại, dựng lại stat/skill và bỏ modifier cũ. Save không được thay base/max HP hoặc đưa enrage dựa trên hero vào actor v2. Cooldown được khôi phục trong giới hạn skill hiện tại. Object pool xóa metadata/cooldown của khung mới khi trả actor.

Boss v2 không dùng enrage tăng ATK theo ATK hero. Khi cần enrage mới, nên khai báo bằng skill atlas thay vì thêm phụ thuộc vào hero.

## Chạy kiểm chứng từ workspace

```powershell
& ./client/tests/run_enemy_framework.ps1 -Godot 'C:/path/to/Godot_console.exe'
node server/tests/test_enemy_framework.cjs
node server/tools/benchmark_enemy_framework.cjs --godot=C:/path/to/Godot_console.exe --lanes=baseline,pilot --jobs=4
node server/tools/benchmark_enemy_framework.cjs --godot=C:/path/to/Godot_console.exe --lanes=minus5,plus5 --seeds=239 --jobs=2 --out=tmp/c239-sensitivity --report=server/docs/reports/C239_LEVEL_SENSITIVITY.json
```

Runner tạo fixture local rõ ràng cho harness; không ghi stage campaign, DB, profile hoặc recommended_power. Pilot là bản sao bố cục stage_7_05 trong arc thử nghiệm riêng, giữ count, formation, thời điểm và EXP. Fixture tải JSON chỉ tồn tại trong test harness, không có đường fallback ở gameplay.

Benchmark chính: 150 trận (baseline/pilot × 5 hero × 3 difficulty × 5 seed). Độ nhạy: 30 trận (−5/+5 level × 5 hero × 3 difficulty × 1 seed). Cả hai dùng hero Lv60, không gear/affinity/Thần Luân, card được offer bình thường, kite theo policy xác định và tử vong thật.

Report chứa fingerprint dữ liệu/mã nguồn và kiểm tra nguồn không đổi trong lúc chạy; seed, loadout, wave chết, damage theo loài/skill, phân bố hệ, hệ số khắc hệ, timing, compile time và peak static memory/process time. Telemetry hệ cho các đòn hero legacy suy ra từ hệ actor; telemetry skill atlas dùng hệ skill chính xác. Số liệu hiệu năng là quan sát headless tăng tốc, không chứng nhận ngân sách frame mobile.

Xem [báo cáo nghiệm thu](reports/C239_ACCEPTANCE.md). Chỉ xem xét migration diện rộng sau khi đánh giá chênh lệch theo từng hero và thiết kế skill/đội hình tiếp theo.

## C240 damage update

Spawn/growth v2 remains opt-in. All actors now share the C240 damage pipeline, authoritative server element matrix and neutral basics. See [shared damage](COMBAT_DAMAGE.md). Historical C239 benchmark JSON files describe the earlier pipeline and are not current balance evidence.

## C239 v1.2 native skill migration

`server/data/creep_boss_skill_atlas.json` is canonical authoring input. Run `node server/tools/creep_boss_skill_atlas.cjs --apply` to regenerate progression atlas and enemy compatibility projections. Each stage-v2 entry equips `{skill_id, level, slot}`; slot is `attack_skill`, `boss_skills`, or `generic_skills`, and the skill element must match the actor (neutral is universal). Specialized Enemy cast/trait adapters preserve existing effects and timings. Existing stage bindings use level 1; levels 2-5 scale authored damage coefficients by 10% per level. Skill-specific level tuning remains future balance work. Ice-named attacks now use water; legacy encounters can change elemental damage and should be benchmarked. Legacy stages retain equipped historical bindings even where the actor element differs; migrate stage loadouts to enforce eligibility. Native adapters currently require Enemy; pet/hero executor adapters and learning are not implemented.

## Arc 1 local rollout (C239 v1.4)

The ten order-1 stages of arc_2 are migrated on local Nakama with 6 species, per-level growth, random primary elements and independent 10% dual-element creeps. Authoring input: server/data/c239_arc1_migration.json; stage-specific per-element native loadouts preserve fixed skill elements. See [Arc 1 acceptance and evidence](reports/C239_ARC1_ACCEPTANCE.md). Balance is deferred and does not block technical migration. Existing generic seed stages are the legacy reference; local rollout uses the explicit guarded installer.

## User correction v1.4.1

Arc 1 now uses one element and the exact legacy distribution: 70% arc element, 30% authored species element. Current Arc 1 authored species are all fire, hence the effective distribution is fire-only. Arcs 1-5 cannot use multiple elements; only Arc 6+ may do so. Creep primary element remains inside its original HP-bar anchor, extras extend left. Boss secondary elements are in a horizontal HUD row below its HP bar. See [correction evidence](reports/C239_UI_ELEMENT_CORRECTION.md).
