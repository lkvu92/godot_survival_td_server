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
