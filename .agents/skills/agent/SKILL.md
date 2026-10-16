---

## UI utility enforcement

Every UI implementation must use the shared composable controls:

- Text buttons: `UiNineSliceButton` and `UiSkin.apply_button()`.
- Resizable cards: `UiNineSliceCard`.
- Headers: `UiNineSliceHeader`.
- Avatar frame/background: `UiNineSliceAvatar` and `UiNineSliceAvatarBG`.
- Construction helpers: `UiAssetUtils.create_*()` and
  `UiAssetUtils.make_nine_patch_style()`.

Asset rectangles and variant/type mappings belong in
`data/atlas_registry.json` and are resolved via `AtlasRegistry`. Never scale a
complete ornamental asset, manually crop replacement PNGs, or hard-code new
asset paths in scenes/GDScript. Gate 3 verifies nine-slice resizing and Gate 4
runs `tests/run_static_tests.ps1`.

name: agent
description: Multi-Agent System (MAS) orchestrator for Godot Survival TD and Nakama Backend. Enforces Contract-First development with 4-phase GATE verification.
---

## Atlas Manifest Rules (mandatory for sprite work)

For every sprite, spritesheet, VFX, or atlas-region change, read `docs/standards/ATLAS_MANIFEST.md` and update `data/atlas_registry.json`. Keep asset paths, grid dimensions, frame counts, and pixel rectangles in JSON; do not add new hard-coded asset metadata to GDScript. Runtime code must resolve IDs through `AtlasRegistry`, including `AtlasRegistry.get_atlas_region(region_id)` for arbitrary rectangles. Gate 3 must validate JSON, referenced files, and missing textures; Gate 4 must run `tests/run_static_tests.ps1`.

# MAS Orchestrator: Godot Survival TD & Nakama Backend

Skill này điều phối toàn bộ chu trình phát triển tính năng, tái cấu trúc hoặc sửa lỗi theo chuẩn Multi-Agent System (MAS) 4 Pha có GATE bắt buộc.

---

## Khi nào kích hoạt Skill này?
- Người dùng gõ `/agent` hoặc `/agent <yêu cầu>`.
- Triển khai bất kỳ tính năng mới, chỉnh sửa logic gameplay, RPC Nakama hoặc màn hình UI.

---

## 🛠️ Quy trình thực thi tuần tự (Tự động chuyển vai)

### Bước 1: Tra cứu RAG Index & Phân tích yêu cầu (The Architect)
1. Đọc file [docs/INDEX.md](file:///e:/LKVU/survival_td_godot/docs/INDEX.md) và [docs/contracts/REGISTRY.json](file:///e:/LKVU/survival_td_godot/docs/contracts/REGISTRY.json) để xác định:
   - Tính năng này đã có Contract chưa?
   - Thuộc phạm vi nào: Gameplay Client, Nakama Backend, hay Full-stack?
   - Các file mục tiêu (`target_files`) liên quan.
2. Nếu là tính năng mới hoặc có thay đổi logic:
   - Tạo mới hoặc mở Contract tương ứng trong `docs/contracts/`.
   - **Tăng số phiên bản (SemVer: `x.y.z`)** và ngày cập nhật (`updated_at`).
   - Ghi rõ nội dung thay đổi vào bảng **Changelog** của Contract.
   - Định nghĩa chi tiết Data Schema, RPC payloads (Request/Response), Interface Methods và Fallback rule.
3. **Kiểm tra GATE 1**: Contract đã đầy đủ, có Version và Changelog $\rightarrow$ Đạt GATE 1 mới được bước sang Bước 2!

---

### Bước 2: Triển khai Core & Logic (Backend Dev & Gameplay Dev)
1. **Nếu có phần Backend Nakama**:
   - Chuyển vai **Senior Nakama Backend Dev**:
   - Triển khai/sửa code TypeScript trong [nakama/data/modules/](file:///e:/LKVU/survival_td_godot/nakama/data/modules).
   - Đăng ký RPC trong `main.ts` và cập nhật `seed.ts` nếu cần.
   - Chạy lệnh build:
     ```powershell
     cd nakama; npm run build; cd ..
     ```
2. **Nếu có phần Game Client Logic**:
   - Chuyển vai **Senior Godot Gameplay Dev**:
   - Cập nhật cấu hình trong [data/*.json](file:///e:/LKVU/survival_td_godot/data).
   - Triển khai/sửa GDScript trong [src/services/](file:///e:/LKVU/survival_td_godot/src/services), [src/managers/](file:///e:/LKVU/survival_td_godot/src/managers), [src/combat/](file:///e:/LKVU/survival_td_godot/src/combat).
   - Tuân thủ quy tắc: Không hardcode balance, luôn hỗ trợ Offline-First Fallback.
3. **Kiểm tra GATE 2**: TypeScript runtime build không lỗi; GDScript không lỗi cú pháp $\rightarrow$ Đạt GATE 2.

---

### Bước 3: Triển khai Presentation & Asset/UI (Presentation Dev)
1. Chuyển vai **Presentation & UI/VFX Dev**:
2. Đăng ký Asset / Sprite frames / Icons vào [src/assets/AtlasRegistry.gd](file:///e:/LKVU/survival_td_godot/src/assets/AtlasRegistry.gd).
3. Đảm bảo file ảnh tồn tại trên đĩa trong `assets/cutouts/` hoặc `assets/ui/`.
4. Style các nút/giao diện qua [src/ui/UiSkin.gd](file:///e:/LKVU/survival_td_godot/src/ui/UiSkin.gd) và 9-patch frame.
5. Cập nhật các Node trong file Scene `.tscn` và kết nối tín hiệu qua `GameEvents`.
6. **Kiểm tra GATE 3**: Không có texture bị thiếu (missing texture), giao diện co giãn đúng chuẩn 720x1280 mobile portrait $\rightarrow$ Đạt GATE 3.

---

### Bước 4: Kiểm định chất lượng & Nghiệm thu (Principal Tester)
1. Chuyển vai **Principal Game Tester**:
2. Chạy script kiểm thử tĩnh toàn diện:
   ```powershell
   powershell -ExecutionPolicy Bypass -File tests/run_static_tests.ps1
   ```
3. Đối soát mã nguồn với các tiêu chí trong Contract.
4. Kiểm tra Chaos Fallback: Nếu tắt Nakama, game client có tự động đọc local JSON và lưu file an toàn không.
5. Đánh giá chất lượng (Gate Score /10):
   - Đạt $\ge 8/10$: Chuyển trạng thái Contract thành `ACTIVE`.
   - Nếu $< 8/10$: Yêu cầu quay lại Pha 2 để khắc phục.
6. **Kiểm tra GATE 4**: Toàn bộ bài test pass $\rightarrow$ Bàn giao cho người dùng.

---

## 📋 Mẫu Báo cáo Tiến độ khi gọi `/agent`

Agent luôn phản hồi theo định dạng chuẩn:

```markdown
### 🤖 [MAS EXECUTION REPORT]
- **Yêu cầu**: <Tóm tắt yêu cầu người dùng>
- **Contract**: <Contract ID - Version x.y.z>

- [x] **Phase 1 (The Architect)**: Đã cập nhật docs/contracts/<ID>.md (vX.Y.Z) & Changelog. `[GATE 1: PASSED]`
- [x] **Phase 2 (Core & Backend)**: Đã triển khai data/ & src/services/ & nakama/modules/. `[GATE 2: PASSED]`
- [x] **Phase 3 (Presentation)**: Đã đăng ký AtlasRegistry & UiSkin & Scene. `[GATE 3: PASSED]`
- [x] **Phase 4 (Principal Tester)**: Chạy run_static_tests.ps1 (PASS). Score: 9/10. `[GATE 4: PASSED]`

**Trạng thái**: DONE
```
