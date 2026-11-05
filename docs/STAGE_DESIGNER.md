# Stage Designer — C269

Quản lý ở **Dashboard → Arc & Stage** (`/dashboard/campaign`). Enemy Catalog tiếp tục sở hữu loài, chỉ số, hình ảnh và skill; Stage Designer sở hữu lựa chọn quái, wave, tỷ lệ hệ và nhịp trận.

## Cách thao tác
1. Chọn Arc rồi chọn stage. Nhãn **Chưa chuyển đổi** nghĩa là runtime vẫn dùng cấu hình cũ. Mở màn hình không thay đổi gameplay.
2. Nhập năm tỷ lệ hệ, tổng bằng 100%. Ví dụ Hỏa 100 và bốn hệ 0 chỉ sinh Hỏa; Hỏa 50 và bốn hệ 12,5 chia creep gần đúng tỷ lệ bằng cách làm tròn phần dư rồi xáo trộn.
3. Chọn một wave để chỉnh nhóm quái: loài, số lượng, level, EXP, trễ bắt đầu, interval, bộ skill. Có thể thêm, nhân bản, đổi thứ tự và xóa wave/nhóm. ID ổn định không đổi khi sắp xếp.
4. Wave mặc định dùng tỷ lệ stage. Bật **Tỷ lệ hệ riêng cho wave** khi cần ghi đè.
5. Boss chọn hệ cố định; để **Random theo tỷ lệ wave** nếu muốn server roll. Boss không tiêu thụ quota creep. Mỗi creep có một hệ chính; Arc 1–5 không cho phép quái đa hệ. Boss đa hệ đã có ở Arc 6+ được giữ nguyên.
6. **Nhịp sinh quái & tăng tiến** quản lý batch, giới hạn sống, lane, jitter, cảnh báo/chuyển wave, level tăng và scale hình ảnh. Khi đầy giới hạn sống, queue chờ; không bỏ quái. Khi hết giờ wave thường, wave tiếp theo được mở và giữ backlog. Boss/wave cuối chờ diệt hết.
7. **Kiểm tra & mô phỏng** chọn difficulty và seed. Preview dùng sprite đã đăng ký, phát x1/x2/x3, tua lịch và xem level cuối. Đây là lịch danh nghĩa, chưa dự đoán combat, batch toàn màn hay thời điểm quái chết.
8. **Lưu cấu hình** kiểm tra toàn bộ nhánh hệ/loadout. Một lần lưu cập nhật nguyên stage, dùng revision chống ghi đè. Khi gặp 409, giữ bản nháp đang mở để xem lại, tải lại trước khi lưu tiếp.
9. **Kiểm tra & phát hành** dùng cùng lifecycle với Enemy Catalog. Publish/rollback áp dụng một snapshot chung; không phát hành catalog và stage độc lập.

## Skill và EXP
- Skill giữ nguyên hệ cố định. Bộ skill theo hệ phải có đủ các nhánh mà tỷ lệ cho phép sinh ra. Không tự đổi màu/hệ skill hoặc tự trang bị mọi skill phù hợp.
- Với quái đang dùng skill cố định, thay tỷ lệ có thể bị từ chối vì skill không hợp hệ. Chọn bộ skill theo hệ phù hợp trước khi lưu.
- Difficulty resolve trước, sau đó cộng bonus tăng tiến theo wave. Server từ chối vượt max level; không cắt ngầm.
- Tổng số quái/EXP của cùng snapshot + stage + difficulty không đổi theo seed/timeout. `start_stage` đóng băng ngân sách EXP trong run; đây là trần settlement, không thay thế kiểm tra kết quả trận.

## API và phiên bản
Contract: [C269](contracts/C269_STAGE_DESIGNER.md). Admin: overview, stage_get, stage_save, stage_resolve; lifecycle dùng C259. Không có API gọi từng lần spawn.

`start_stage` nhận `stage_plan_version:1` và `request_id`. Server tạo plan trong quá trình chuẩn bị trận, trước storageWrite trừ thể lực + tạo run. Retry cùng request trả lại cùng run/plan. Client cũ bị từ chối trước debit khi stage đã chuyển đổi.

`get_stage_plan` chỉ đọc run active của đúng chủ sở hữu/character context, có login/account/server admission guard. Loading/resume lấy plan này từ server; không dùng bản plan lưu cục bộ. Identity khác snapshot hiện tại thì phải bắt đầu trận mới.

C260: chỉ develop có hai cờ hợp lệ mới áp dụng live draft. Lưu và projection nguyên tử; trận đã load giữ snapshot riêng. Production vẫn tách draft/publish. Rollback về release trước khi có đủ các stage designer đang active bị chặn để tránh để lại runtime stage cũ/mới trộn lẫn. Draft không bị rollback theo runtime.

Stage header/wave hiện có được đưa vào công cụ bằng thao tác lưu tường minh. Không tự migrate toàn campaign, không đổi chỉ số hero, không chỉnh cân bằng tự động. Việc tạo/xóa Arc và thay điều kiện unlock không nằm trong API C269 v1.

## Kiến trúc client
- `StagePlanCompiler.gd`: compile descriptor từng cá thể và loadout từ kế hoạch server, giữ một group queue.
- `SpawnScheduler.gd`: scheduler thuần dữ liệu, callbacks spawn/formation; ưu tiên wave cũ đã sẵn sàng, round-robin nhóm trong wave, hoãn khi hết capacity.
- `WaveManager.gd`: tích hợp scene, pool, position và resume; đường legacy giữ compatibility.

Trong một batch có thể phát nhiều cá thể cùng nhóm; interval điều khiển lần dispatch tiếp theo của nhóm, batch delay/jitter điều khiển toàn màn. Không có jitter interval ngầm trên đường mới. RNG hệ đã dùng khi server generate; client lưu state RNG lịch/vị trí bằng chuỗi decimal để resume qua JSON không mất độ chính xác.

## Kiểm chứng
Từ workspace:
```powershell
npm --prefix server/nakama run build
node server/tests/test_stage_designer.cjs
node server/tests/test_stage_start_plan.cjs
node server/tests/test_stage_designer_http.cjs --web --game
& client/tests/run_stage_designer.ps1 -Godot 'C:/path/to/Godot_console.exe'
& client/tests/run_enemy_framework.ps1 -Godot 'C:/path/to/Godot_console.exe'
npm --prefix web_client run lint
npm --prefix web_client run typecheck
npm --prefix web_client run build
```
DB test dùng PostgreSQL local trong Docker để đọc fixture, tạo DB dùng một lần rồi xóa; không sửa DB đang dùng. HTTP test tạo Nakama riêng với tài khoản/secret ngẫu nhiên; browser test chạy Next trên cổng 3219, không dừng dev server 3000. Browser cần playwright-core và Chromium; đường dẫn có thể cấu hình bằng biến môi trường được mô tả trong script kiểm thử. Không đưa endpoint fixture vào runtime production.

Bằng chứng và giới hạn: [nghiệm thu](reports/C269_STAGE_DESIGNER_ACCEPTANCE.md).

Browser test configuration: `C269_PLAYWRIGHT_MODULE` points to an installed playwright-core module, `C269_CHROMIUM` to a Chromium executable and `C269_GODOT` to the Godot console executable. Defaults target the local workspace test install and existing Windows tools.

## Serial spawning - C269 v1.1

Enable serial spawning in the pacing panel. `individual_delay` controls spacing between actors (0.05..120 game seconds); `batch_delay` plus jitter begins only after the batch's last actual spawn. For three actors with 0.4s spacing and a 2s rest: 0s, 0.4s, 0.8s; the next batch starts no earlier than 2.8s. A group's interval may delay it further.

Capacity stalls preserve the pending batch without catch-up credit. Timeout transitions and JSON resume preserve reservations and cooldown. x2/x3 divide wall-clock delays by two/three. Existing published plans without individual_delay retain simultaneous batches; enable and save/publish to opt in. Newly converted stages default to 0.4s.

Preview includes batching, group intervals and serial spacing, with individual timestamps and real-time conversion. It shows earliest timings without jitter, formation gates, capacity, combat or overlapping waves.
