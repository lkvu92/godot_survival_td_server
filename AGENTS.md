# MULTI-AGENT SYSTEM (MAS) — GODOT SURVIVAL TD & NAKAMA BACKEND

> **Mandatory repository instructions.** Codex and every implementation agent must read and obey this file before planning, editing, or testing. The canonical copy is root `AGENTS.md`; `.agents/AGENTS.md` mirrors it. Update both copies together whenever these rules change.

Hệ thống MAS chuẩn hóa cho dự án **Survival TD (Godot 4.x + Nakama Backend)**.

---

## 🤖 Hệ thống 5 Vai trò chuyên biệt

| Vai trò | Phạm vi phụ trách (Scope) | Trách nhiệm chính |
|---|---|---|
| **The Architect** | Toàn bộ dự án (`docs/`, `data/`, `contracts/`) | Thiết kế giải pháp, tạo & cập nhật Contract (SemVer + Changelog), phân rã nhiệm vụ $\rightarrow$ **GATE 1** |
| **Senior Nakama Backend Dev** | `nakama/` (Docker, TS modules, RPCs, Storage) | Triển khai RPC, Data Seeding, Storage Collections, build runtime với esbuild $\rightarrow$ **GATE 2A** |
| **Senior Godot Gameplay Dev** | `data/`, `src/services/`, `src/managers/`, `src/combat/` | Triển khai Gameplay balance, Math/Formulas, Combat logic, Online-only validation $\rightarrow$ **GATE 2B** |
| **Presentation & UI/VFX Dev** | `assets/`, `scenes/`, `src/ui/`, `src/effects/` | Đăng ký asset vào `AtlasRegistry`, style qua `UiSkin`, thiết kế Scene, VFX frames, Audio $\rightarrow$ **GATE 3** |
| **Principal Game Tester** | Toàn bộ dự án | Chạy static tests, test container Nakama, test online-only failure handling, đối soát Contract (Score $\ge 8/10$) $\rightarrow$ **GATE 4** |

---

## ⚠️ Quy trình 4 Pha BẮT BUỘC (KHÔNG ĐƯỢC SKIP)

```
[Phase 1: Architect] ──(GATE 1)──> [Phase 2: Backend + Core] ──(GATE 2)──> [Phase 3: Presentation] ──(GATE 3)──> [Phase 4: Tester] ──(GATE 4)──> [DONE]
```

Mọi tính năng/nhiệm vụ đều phải vượt qua **GATE** trước khi chuyển sang pha tiếp theo:

- **GATE 1 (Architect Approval)**:
  - Phải có file Contract trong `docs/contracts/` tương ứng.
  - Phải cập nhật `docs/contracts/REGISTRY.json` và `docs/INDEX.md`.
  - Phải tăng Version (SemVer: `x.y.z`) và ghi rõ mô tả thay đổi trong bảng `Changelog` của Contract.
  - Đã định nghĩa đủ: Data Schema (JSON/Dict), RPC Payload (Request/Response), Interface Methods, Offline Fallback rule.
- **GATE 2 (Implementation Green)**:
  - Nếu có Backend: TypeScript runtime compile sạch qua `npm run build` trong `nakama/`.
  - Phía Godot: Script không có lỗi syntax/parser, data nạp thành công qua `DataRegistry`.
  - Online-only: missing/invalid config or network blocks gameplay and mutations; no local gameplay JSON fallback.
- **GATE 3 (Visual & Integration Bound)**:
  - Assets và Sprite frames đăng ký đủ trong `AtlasRegistry.gd`.
  - Giao diện tuân thủ tiêu chuẩn `UiSkin.gd`, 9-patch frame, không custom stylebox tùy tiện.
  - Tín hiệu `GameEvents` hoặc Signals được kết nối chuẩn xác.
- **GATE 4 (Test & Acceptance Pass)**:
  - Chạy `tests/run_static_tests.ps1` đạt 100% PASS (không có lỗi Assert-True).
  - Điểm nghiệm thu chất lượng (Gate Score) $\ge 8/10$.
  - Trạng thái Contract được chuyển thành `ACTIVE`.

---

## 📜 5 Quy tắc Bất Khả Xâm Phạm (Golden Rules)

1. **"No Code Without Contract"**: Tuyệt đối không viết mã nguồn (GDScript hoặc TypeScript) khi chưa đọc docs hoặc chưa có Contract và Changelog tương ứng.
2. **"Server Data Authority"**: Gameplay balance is authoritative in Nakama DB. Only server/data JSON provides versioned seed input; client may keep presentation manifests, never gameplay JSON or local overrides.
3. **"Asset Access via AtlasRegistry Only"**: Không dùng `load("res://assets/...")` trực tiếp rải rác trong gameplay code. 100% texture, icon, frame phải qua `AtlasRegistry`.
4. **"UI via UiSkin Only"**: Không tạo stylebox cục bộ rời rạc trong Scene. Mọi Button, LineEdit, Dialog phải áp dụng qua `UiSkin` hoặc Theme tập trung.
5. **"Online-Only Resilience (C121)"**: Authenticated server bootstrap and a complete validated config snapshot are mandatory. Disconnects block actions and return to retry/login; no local rewards, profiles or gameplay fallback. This supersedes every older offline-first rule per the user instruction.

---

## 🎯 Kích hoạt Agent & Lệnh điều phối

- `/agent` hoặc `/agent <yêu cầu>`: Tự động kích hoạt toàn bộ quy trình MAS từ Phase 1 đến Phase 4.
- `/agent architect`: Kích hoạt riêng vai trò Architect (Thiết kế, RAG Index, Contract, Versioning).
- `/agent backend`: Kích hoạt riêng vai trò Nakama Backend (TypeScript runtime, RPC, Docker).
- `/agent gameplay`: Kích hoạt riêng vai trò Godot Gameplay Core (Services, Managers, JSON).
- `/agent presentation`: Kích hoạt riêng vai trò Presentation (UI, Sprites, Scenes, VFX).
- `/agent tester`: Kích hoạt riêng vai trò Tester (Static test, Chaos test, Gate Review).


## Tham chiếu bắt buộc: quái, stage và skill dùng chung (C239)

Các đường dẫn dưới đây tính từ root của từng repository.

Trước khi sửa cơ chế sinh quái, growth, difficulty, skill hoặc khắc hệ, đọc:
- `docs/contracts/C239_LEVELLED_ENEMY_FRAMEWORK.md` — contract và phạm vi áp dụng.
- `docs/ENEMY_FRAMEWORK.md` — schema, API và cách chạy kiểm chứng; bản hướng dẫn đầy đủ nằm ở `server/docs/ENEMY_FRAMEWORK.md` trong workspace.
- `docs/reports/C239_ACCEPTANCE.md` — benchmark, giới hạn và quyết định migration.

Quy tắc triển khai:
- Dùng khung v2 cho thiết kế mới: mỗi loài có base attributes và growth riêng, `Stat(L) = base + (L - 1) * growth`. Không suy stat quái từ base/level hero hoặc power tham chiếu của arc.
- Loài không sở hữu element cố định hay danh sách skill có thể học. Atlas skill tập trung có element cố định; danh sách có thể học được lọc theo tập hệ của chủ thể. Stage chọn skill ID và level thực sự trang bị; không tự bật toàn bộ skill phù hợp.
- Skill dùng chung định nghĩa cho creep, boss, pet và hero; damage dựa trên ATK hiện tại của chủ thể và hệ số level skill. Không sao chép định nghĩa theo loài hoặc loại actor. Tính năng học skill từ pet và migration toàn bộ skill legacy chưa nằm trong phạm vi đã hoàn thành.
- Stage/wave khai báo loài, level, hệ hoặc random hệ có seed, số lượng, skill/level và lịch spawn. Difficulty v2 điều chỉnh level/skill; không chồng multiplier HP/ATK/DEF legacy hoặc enrage dựa trên stat hero.
- C240 supersedes pilot-only damage rules: use the authoritative server matrix in every mode; defender chooses safest owned element. Empty defender takes 1.30 from five-element hits, all-five takes 1.00. Basic attacks are neutral (1.00 counter, no elemental affinity modifiers); skill damage uses its fixed element once.
- Compile stat, hệ, skill và bảng tra khắc hệ khi loading; spawn node theo wave. Random dùng RNG riêng có seed. Resume phải resolve lại từ snapshot server, không tin stat/skill payload lưu trong save; pooling phải xóa state của framework.
- Gameplay data mới thuộc `server/data/progression.json -> enemy_framework`, được cấp qua snapshot server có xác thực. Không tạo gameplay JSON fallback hoặc override ở client. Fixture JSON chỉ dùng trong test harness rõ ràng.
- V2 hiện opt-in qua `stage_rules.enemy_framework_version: 2`. Không xem trạng thái ACTIVE của framework/pilot là campaign đã migrate hoặc đã cân bằng tương đương. Giữ đường legacy cho stage chưa chuyển; mọi migration tiếp theo phải có benchmark thực chiến phù hợp phạm vi, tử vong thật, seed/loadout/policy được ghi lại và báo cáo chênh lệch theo hero/difficulty.

Kiểm chứng liên quan: `client/tests/run_enemy_framework.ps1`, `server/tests/test_enemy_framework.cjs`, `server/tools/benchmark_enemy_framework.cjs` (đường dẫn tính từ workspace). Không tuyên bố đã cân bằng hoặc đạt hiệu năng mobile chỉ từ static checks hay benchmark headless tăng tốc.

## Required reference: shared damage (C240)

- Read `docs/contracts/C240_SHARED_COMBAT_DAMAGE.md`, `docs/COMBAT_DAMAGE.md` and `docs/reports/C240_ACCEPTANCE.md` before changing damage or adding combat modes.
- Every mode uses `CombatFormulaService` -> `CombatDamageService`; do not duplicate damage formulas. Actors own immunity/dodge/shields/HP/death.
- Basics always use `neutral`. Damage uses the fixed skill/component element, never caster element or a second actor counter. Projectiles, areas and DoTs snapshot their element at creation.
- Element matchups come from validated server snapshots, with no separate hardcoded pilot matrix. Actor elements determine defense and skill eligibility.
- Preserve the seven-argument take_damage protocol. Raw damage excludes crit/DEF/counter/reductions. New producers require element-forwarding checks and mode regression coverage.

## Arc 1 migration reference (C239 v1.4)

- `server/data/c239_arc1_migration.json` (workspace-relative) authors the 10 order-1 stages of arc_2, including stage_flame_frontier and stage_2_02..10. Do not identify campaign order by stage ID prefix.
- Read docs/reports/C239_ARC1_ACCEPTANCE.md before editing these stages. Local deployment uses server/tools/install_c239_arc1_local.cjs, with backup/CAS/readback. Generic seed stages remain legacy reference inputs until the separate production rollout. Never use client JSON gameplay fallback.
- Technical migration gates require spawn/cast/damage/seed/resume/pooling and UI evidence. Balance is a later phase per user instruction; do not block migration on hero clear rates or alter hero stats to force pass.
- User correction v1.4.1: Arcs 1-5 are single-element and retain their existing element distribution. Only Arc 6+ may spawn multiple elements. Keep creep primary icon at its original HP-bar anchor (-19,2.5); extra icons extend LEFT on the same baseline. Boss primary stays in its HUD badge; extra elements form a row immediately below the boss HP bar. Explicit loadouts preserve fixed skill elements.
