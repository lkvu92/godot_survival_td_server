# Kế hoạch triển khai nhiều server logic

Ngày: 2026-10-19  
Trạng thái: IMPLEMENTED LOCAL / RELEASE GATED — chưa bật production.  
Phạm vi: backend Nakama, client Godot, migration dữ liệu và vận hành.

### Tiến độ implementation — 2026-10-19

Contract: [C143 Multi-server](contracts/C143_MULTI_SERVER.md) v1.2.0, trạng thái IN_PROGRESS cho nghiệm thu phát hành. Các đường tích hợp còn lại đã có implementation/test local; **không đồng nghĩa đủ điều kiện bật production**. Xem mục 16 về API, chạy thử và giới hạn chính sách.

Đã có trong working tree:

- Registry SQL, context account/server/generation, API `list_servers`, `list_my_characters`, `create_character`, `enter_server`.
- Repository namespace Storage theo server/generation, version precondition và quyền runtime-only; request-local adapter đã nối các helper gameplay qua guard, giữ batch Storage nguyên tử và prefs/compliance cấp tài khoản.
- Admin RPC `admin_server_list`, `admin_server_inspect`, `admin_server_create`, `admin_server_disable`, `admin_server_enable`, `admin_server_update`; create disabled, kiểm tra config release, idempotency và audit; mutation dùng expected revision.
- Writer counter theo server: disable chặn nhận request mới, request đang chạy trả counter trong finally. Lifecycle step có checkpoint/lease, recovery sau crash yêu cầu đối soát offline, không tự giả định writer đã chết theo timeout.
- BXH lifetime namespace theo server/generation; bảng tuần riêng có composite key, snapshot mùa, finalization và claim riêng từng server; scheduler có đường xử lý server đang mở, không quét profile toàn hệ thống khi startup multi-server.
- BillingService facade/provider, generic `iap_claim`, SKU mapping theo store, order platform/target snapshots, hàm cấp thưởng chung từ verified envelope; `resolve_purchase_order` tra đích đơn gốc và không tạo đơn restore ở server hiện tại. iOS chưa cấu hình verifier nên fail-closed. Bootstrap nhận android/ios và URL cập nhật theo nền tảng.
- Scene chọn server kế thừa scene Login, cùng background/frame/UiSkin, tìm kiếm, trạng thái bảo trì, chọn và vào server.
- Loading xác minh admission trước config; transport gắn context và loại response cũ; xóa state nhân vật khi chọn lại.
- Test repository/admission, integration PostgreSQL registry/admin/BXH và Godot UI/transport/provider; native smoke bằng Nakama 3.24.2 trong container cô lập xác minh auth, bootstrap iOS, rename có CAS, S1/S2/legacy isolation, create/enter và counter drain. Preview giao diện tại `client/temp/server-selection-preview.png` trong workspace, không phải asset phát hành.

Còn phải triển khai trước khi có thể nghiệm thu:

1. Smoke toàn bộ gameplay theo server với catalog đầy đủ, phục hồi writer counter sau process crash; rebuild BXH theo batch và kiểm thử cạnh tranh scheduler/lifecycle.
2. Đối soát migration BXH cũ trên bản sao dữ liệu thật và kiểm tra tải/reset tuần với 200 server.
3. Kiểm thử Google Play sandbox với credentials thật và service verifier/package name, chốt chính sách bồi hoàn cho nhân vật trả phí bị trùng khi hợp nhất hoặc reset.
4. Diễn tập crash/recovery đa node, backup/restore, vòng đời toàn bộ catalog gameplay và callback cạnh tranh trên bản staging.
5. Rehearsal migration trên bản sao dữ liệu thật và benchmark 200 server/40.000 nhân vật; chưa có bằng chứng tải cho production.

Chế độ legacy chỉ được client dùng sau khi backend xác nhận `server_mode: legacy`, và được kiểm tra lại trước bootstrap. `MULTI_SERVER_ENABLED` vẫn chưa bật trong cấu hình triển khai. Fixture test đã chạy thanh toán, quảng cáo, callback và hợp nhất Google qua đường multi-server thực tế; không còn khóa placeholder `MULTI_SERVER_NOT_READY`/`MULTI_SERVER_LINK_PENDING`. **Không bật production chỉ vì native smoke đã qua.** Không tự chạy migration trên startup. Chưa deploy hay sửa dữ liệu production.

Các lệnh test bổ sung (chạy từ `server/`): `node tests/test_store_platforms.cjs`, `node tests/test_character_repository.cjs`, `node tests/test_server_admission.cjs`. `node tests/test_multiserver_runtime.cjs` cần Docker; tạo network/container test tên `c143-*` duy nhất và tự dọn đúng các tài nguyên đó. PostgreSQL suite chạy khi có `SEED_TEST_PSQL` và `SEED_TEST_PORT` trỏ tới instance test. Godot scenes: `res://tests/TestServerSelection.tscn`, `res://tests/TestBillingProviders.tscn`.

Runtime RPC phải đăng ký bằng callback global trực tiếp trong InitModule; native smoke phát hiện lỗi mà build JS không phát hiện. Tham chiếu: [Nakama TypeScript runtime](https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/).

## 1. Mục tiêu và quyết định kiến trúc

Hỗ trợ khoảng 200 server logic, mỗi server khoảng 200 nhân vật, với cùng một tài khoản có thể có tiến trình độc lập tại nhiều server.

- `account_id` là Nakama `userId` hiện tại.
- Mỗi nhân vật được xác định duy nhất bằng `(account_id, server_id)`.
- Giữ một hệ thống xác thực; không tạo Nakama user riêng cho từng server.
- Giai đoạn đầu dùng chung Nakama và PostgreSQL, giữ Nakama Storage cho tiến trình.
- Mọi truy cập tiến trình đi qua repository nhận context tường minh.
- Chưa chia 200 schema, chưa partition chỉ vì số lượng server.
- Chuẩn bị registry ánh xạ server sang nơi lưu trữ/cụm để có thể mở rộng sau này.

40.000 nhân vật lưu trữ khác với 40.000 người online đồng thời. Khả năng chịu tải của hạ tầng hiện tại chưa được xác nhận; cần đo RPC, số lần ghi, kết nối, CPU và I/O theo hành vi thực tế.

## 2. Luồng sử dụng

```text
Đăng nhập tài khoản
  → lấy danh sách server và nhân vật
  → chọn server / tạo nhân vật
  → kiểm tra quyền vào server
  → bootstrap config và tiến trình
  → vào game
```

Đổi server phải chặn thao tác mới, vô hiệu hóa response cũ, xử lý lượt chơi hiện tại, xóa state nhân vật và bootstrap lại. Lỗi mạng hoặc thiếu config thì dừng ở retry; không có gameplay fallback local.

## 3. Phân chia phạm vi dữ liệu

### Ràng buộc đa nền tảng: Android và đường mở rộng iOS

BillingService là facade chung; provider Google Play và provider StoreKit tách biệt. Backend nhận claim trung lập theo platform, tra platform/SKU/target từ order bất biến rồi giao cho verifier tương ứng; kết quả xác minh được chuẩn hóa trước khi cấp thưởng. Không để UI gameplay, inventory hoặc VIP phụ thuộc trực tiếp Google Play.

Catalog dùng product ID nội bộ và mapping SKU theo platform. Ledger lưu platform, store transaction/token identity, account và đích server/generation; chống replay trong toàn hệ thống theo định danh store đã xác minh. Apple notification/restore sau này phải tra order gốc, không tự tạo order ở server đang mở. Giao dịch consumable chưa tìm được đích đáng tin cậy được đưa vào reconciliation, không đoán server.

iOS chưa có StoreKit/verifier/credential thì trả lỗi provider chưa sẵn sàng, không chạy Google Billing hoặc gửi receipt rỗng giả lập trên release. Bootstrap/config và URL cập nhật phải nhận biết nền tảng. Việc chừa interface không đồng nghĩa đã hỗ trợ thanh toán App Store.

Các chính sách dưới đây là đề xuất; phải chốt trong contract và đối chiếu quyền lợi đã bán trước migration.

| Dữ liệu | Phạm vi đề xuất | Yêu cầu |
|---|---|---|
| Email, Google, mật khẩu, phiên đăng nhập | Tài khoản | Giữ định danh Nakama |
| Compliance | Tài khoản | Không yêu cầu nhập lại theo server |
| Âm thanh, tùy chọn thiết bị | Thiết bị/tài khoản | Tách khỏi lựa chọn gameplay |
| Tên, avatar, số lần đổi tên | Nhân vật/server | Không lấy username tài khoản làm nguồn chính |
| Resources, inventory, heroes, progression | Nhân vật/server | Độc lập hoàn toàn |
| Lượt chơi đang hoạt động | Nhân vật/server | Gắn server và run ID |
| Điểm danh, event, thưởng BXH | Nhân vật/server | Campaign toàn tài khoản phải khai báo riêng |
| VIP, gói ngày, quà nạp đầu | Nhân vật/server | Gắn nơi nhận giao dịch |
| Quyền bỏ quảng cáo | Tài khoản | Đối chiếu mô tả sản phẩm trước khi chốt |
| Purchase token, transaction ID | Toàn hệ thống | Chống cấp lại giữa các server |
| Balance, catalog | Dùng chung có phiên bản | Override theo server khi có nhu cầu rõ ràng |
| Ngày mở server, lịch event, trạng thái vận hành | Server | Backend là nguồn quyết định |

Không sao chép quyền lợi hiện có sang mọi server một cách mặc định.

## 4. Mô hình SQL bổ sung

| Bảng dự kiến | Trường chính | Vai trò |
|---|---|---|
| `game_servers` | `server_id`, tên, trạng thái, `opens_at`, `placement_id` | Danh mục và vị trí phục vụ server |
| `player_characters` | `account_id`, `server_id`, trạng thái khởi tạo, tên, ngày tạo, lần vào cuối | Registry nhân vật, không thay toàn bộ Storage |
| `player_server_preferences` | `account_id`, `last_server_id` | Gợi ý server lần đăng nhập sau |
| Migration ledger | account, phiên bản migration, trạng thái, thời điểm | Retry và đối soát chuyển dữ liệu |

Ràng buộc `UNIQUE(account_id, server_id)`. Trạng thái server dự kiến: `provisioning`, `scheduled`, `open`, `maintenance`, `disabled`, `resetting`, `deleting`, `deleted`, `failed`. `deleted` là tombstone, không tái sử dụng ID.

Registry bổ sung `generation`, `revision`, `allow_new_characters`, `active_operation_id`. Mọi dữ liệu nhân vật, run, order, claim và job phải xác định được generation đích để callback cũ không cấp vào tiến trình sau reset. Chi tiết vòng đời tại mục 15.

Tách quyền vào của nhân vật cũ và quyền tạo nhân vật mới. Nếu có giới hạn cứng 200 nhân vật/server, giữ chỗ phải nguyên tử trong DB; không dùng đếm rồi tạo bằng hai bước không khóa.

Việc tạo nhân vật trải qua SQL và Storage cần trạng thái `initializing → ready`, có thể tiếp tục sau lỗi. Chỉ cho vào game khi hoàn tất; không giả định hai hệ lưu cùng commit.

## 5. Repository và server context

Module mới dự kiến:

```text
server/nakama/data/modules/server_context.ts
server/nakama/data/modules/character_repository.ts
server/nakama/data/modules/server_rpc.ts
server/nakama/data/modules/server_tables.ts
```

Context gồm `accountId`, `serverId`, `generation`, truyền tường minh qua mọi helper đọc/ghi tiến trình. Cặp account/server vẫn là định danh nhân vật logic; generation xác định lần khởi tạo tiến trình hiện hành.

Repository dự kiến có `readProfile`, `readInventory`, `readHeroes`, `readActiveRun`, `readCharacterBundle`, `writeCharacterBatch`.

Giữ collection hiện tại và namespace key bằng một hàm tập trung:

| Collection | Key cũ | Key mới minh họa |
|---|---|---|
| `player_profiles` | `main` | `s001:g1:main` |
| `player_inventory` | `items` | `s001:g1:items` |
| `player_heroes` | `states` | `s001:g1:states` |
| `player_stage_runs` | `active` | `s001:g1:active` |

Event, điểm danh, identity và claim marker cũng cần namespace tương ứng; kiểm tra giới hạn độ dài key của SDK/server khi chốt quy ước.

Yêu cầu bắt buộc:

- Không có server mặc định ngầm trong RPC gameplay mới.
- Không có biến runtime toàn cục `currentServer`.
- Giữ optimistic concurrency bằng version Storage và các batch ghi liên quan.
- Không tự tạo nhân vật khi đọc thiếu dữ liệu.
- Scheduler/callback dựng context từ bản ghi bền vững.
- Quyền đọc Storage trực tiếp cũng cần rà soát: namespace key không tự tạo ranh giới phân quyền server.
- Đường ghi gameplay thông thường không được truy cập key legacy sau cutover.

## 6. RPC và kiểm tra truy cập

RPC mới: `list_servers`, `list_my_characters`, `create_character`, `enter_server`.

RPC gameplay bổ sung `server_id`; `account_id` luôn lấy từ phiên xác thực. Backend kiểm tra server tồn tại, trạng thái vận hành, nhân vật thuộc tài khoản và đã khởi tạo xong.

Phân loại RPC thành tài khoản, nhân vật, admin và callback. Không ép RPC đăng nhập/link/compliance hoặc callback phải có context lấy từ màn hình client.

Mã lỗi dự kiến: `SERVER_REQUIRED`, `SERVER_NOT_FOUND`, `SERVER_MAINTENANCE`, `CHARACTER_NOT_FOUND`, `CHARACTER_NOT_READY`.

Response tiến trình nên có server ID để client đối chiếu. Server ID trong đơn hàng và lượt chơi phải được kiểm tra với context request.

## 7. Bản đồ tích hợp backend

Đường dẫn trong bảng tính từ `server/nakama/data/modules/`.

| Module | Phần cần sửa |
|---|---|
| `main.ts` | Đăng ký RPC server và áp dụng guard theo loại RPC |
| `player_rpc.ts` | Load/save/create profile, identity, avatar và repair qua repository |
| `inventory_rpc.ts` | Inventory, consumable, talisman và shop theo nhân vật |
| `resource_rpc.ts` | Resources, stamina, mua hero, quota ngày theo server |
| `progression_rpc.ts` | Start/finish/abandon run, tu luyện, thưởng và helper truyền context |
| `combat_power.ts` | Đọc đúng nhân vật, ghi đúng BXH |
| `daily_checkin_rpc.ts` | Namespace state và mốc tạo nhân vật cho campaign người mới |
| `event_service_rpc.ts` | State, trigger, claim, điều kiện và lịch event theo server |
| `leaderboard_setup.ts` | Khởi tạo BXH cho server được kích hoạt |
| `leaderboard_rpc.ts` | Phân vùng ID BXH, tra tên/avatar theo nhân vật |
| `weekly_leaderboard.ts` | Khóa SQL, stored function, snapshot, rank, claim và scheduler |
| `monetization_rpc.ts` | Order, VIP, gói ngày, quảng cáo và cấp thưởng đúng đích |
| `monetization_tables.ts` | Server ID, index và unique constraint theo phạm vi |
| `account_link.ts` | Preview/commit tài khoản có nhiều nhân vật và tài chính liên quan |
| `config_rpc.ts`, `config_tables.ts` | Bootstrap config hiệu lực theo server; registry/override nếu cần |

Rà thêm mọi `storageRead`, `storageWrite`, SQL trực tiếp vào `storage`, batch read theo user, helper chỉ nhận `userId`, script admin, migration, seed và test fixture. Chỉ sửa wrapper RPC là chưa đủ.

### 7.1. BXH và scheduler

Hiện các bảng tuần có khóa `period_id, board_id, user_id`, chưa có server; stored function sử dụng advisory lock chung.

- Thêm server vào khóa, quan hệ tham chiếu và index liên quan.
- Tính rank riêng từng server; marker claim gồm server, mùa và board.
- Snapshot cấu hình thưởng lúc mở mùa.
- Chia khóa/tác vụ theo server, tránh mọi server chờ cùng một khóa toàn cục.
- Scheduler batch có checkpoint, retry và idempotency.
- Loại việc quét/đồng bộ toàn bộ profile khỏi đường startup thông thường.
- ID Nakama leaderboard minh họa: `s001:campaign_stage`.
- Rà `weekly_leaderboard_tick.py`, timer/service và script rebuild BXH.

### 7.2. Thanh toán, quảng cáo và entitlement

Đơn mua lưu bất biến `account_id`, `target_server_id`, `product_id`, `reward_snapshot`.

- Callback luôn cấp vào đích trong order/ad session gốc.
- Đổi server hoặc restart app không thay đổi đích nhận.
- Token/transaction ID giữ unique toàn hệ thống.
- Unique order pending và quota được điều chỉnh theo phạm vi sản phẩm, không thêm server một cách máy móc vào mọi constraint.
- Quota chống lạm dụng toàn tài khoản tách khỏi quota nhận thưởng nhân vật.
- Refund/RTDN tra giao dịch gốc.
- Grant ID/marker bền vững đảm bảo retry an toàn giữa SQL ledger và Storage.
- Không tự tạo nhân vật từ callback khi thiếu đích.
- Verifier tại `server/services/monetization-verifier/src/server.js` truyền tham chiếu đủ để backend tra đích đáng tin cậy.
- Đối soát giao dịch pending trước cutover và hỗ trợ callback cũ trong giai đoạn chuyển đổi đã giới hạn rõ.

### 7.3. Liên kết Google

`account_link.ts` hiện preview một profile và có stored function hợp nhất Storage/tài chính. Cần thay thiết kế trước khi cho nhiều nhân vật vào production.

- Server khác nhau: giữ cả hai nhân vật.
- Cùng server: preview xung đột và yêu cầu chọn tiến trình giữ cho server đó.
- Không cộng dồn tài nguyên/inventory tùy tiện.
- Giữ nguồn gốc giao dịch và nơi đã cấp thưởng.
- Preview toàn bộ server bị ảnh hưởng và phát hiện dữ liệu đổi trước commit.
- Thiết kế xử lý ownership, unique constraint, archive, session và BXH của tài khoản cũ.
- Quyền lợi mua trước đây và đơn pending phải được đối soát trong cùng quy trình.

## 8. Bản đồ tích hợp Godot

| Vị trí trong client | Thay đổi |
|---|---|
| `src/core/NakamaClient.gd` | Gắn server cho RPC gameplay, kiểm tra context và response đến muộn |
| `src/services/AuthService.gd` | Đăng nhập xong chuyển tới chọn server |
| `src/services/ServerService.gd` mới | Registry, nhân vật, tạo/vào server |
| `src/services/PlayerService.gd` | Cache và request pending theo account/server |
| `src/core/UserContext.gd` | Nhận diện nhân vật bằng account + server |
| `src/services/ConfigService.gd`, `src/data/DataRegistry.gd` | Snapshot config hiệu lực của server |
| `src/core/GameState.gd` | Xóa run, lựa chọn và state tạm khi đổi server |
| `src/services/LeaderboardService.gd` | BXH/thưởng của server hiện tại |
| `src/services/MonetizationService.gd`, `BillingService.gd` | Giữ đích order qua đổi server/restart |
| UI đăng nhập và main | Chọn server, hiện server đang chơi và bảo trì |

Hiện `_session_epoch` chỉ phát hiện đổi tài khoản. Thêm epoch context nhân vật, chụp trước khi gửi request và kiểm tra sau await.

`UserContext` đang bảo toàn tên/avatar/VIP revision theo account ID; phải so sánh cả server để không giữ dữ liệu S1 trên S2.

Luồng đổi server phải xóa profile, inventory, heroes, entitlement theo nhân vật, event/checkin, BXH, run, dialog và request pending liên quan. Quyền lợi toàn tài khoản được xử lý theo scope riêng. UI tiếp tục dùng UiSkin và AtlasRegistry.

## 9. Migration dữ liệu cũ vào S1

Ưu tiên cutover có cửa sổ bảo trì thay vì chạy hai mô hình ghi song song.

1. Tạo S1 và migration ledger.
2. Kiểm kê Storage, SQL, giao dịch pending, active run, claim marker và dữ liệu tài khoản dùng chung.
3. Chạy dry-run trên bản sao DB; xuất số lượng và sai lệch.
4. Chặn mutation trong bảo trì. Callback phải có tiếp nhận bền vững hoặc cơ chế retry đã xác minh.
5. Chuyển tiến trình sang namespace S1, tạo registry nhân vật.
6. Backfill server cho order, reward, quota, VIP và BXH theo phạm vi đã chốt.
7. Giữ mã giao dịch, marker đã nhận thưởng và mốc thời gian phục vụ điểm danh/người chơi cũ.
8. Đối soát tài nguyên, inventory, entitlement, transaction, thưởng và run.
9. Smoke test S1/S2, bật version gate chặn client cũ rồi mở lại.

Script phải có dry-run, batch, checkpoint, retry và báo cáo. Không tự xóa dữ liệu legacy ngay sau chuyển đổi; chính sách lưu giữ/dọn dẹp là bước riêng sau đối soát.

Rollback sau khi phát sinh giao dịch mới không được chỉ restore backup cũ. Cần quy trình bảo toàn/reconcile giao dịch và dữ liệu mới; chốt trong runbook trước phát hành.

## 10. Các giai đoạn và tiêu chí bàn giao

| Giai đoạn | Deliverable | Điều kiện hoàn thành |
|---|---|---|
| 1. Contract và kiểm kê | Data scope, RPC schema, chính sách entitlement/link, migration | Không còn dữ liệu quan trọng chưa xác định phạm vi |
| 2. Repository | Truy cập tiến trình tập trung, giữ hành vi legacy trong bước refactor | Bộ hồi quy hiện tại đạt |
| 3. Server/nhân vật | Registry, namespace, create/enter RPC, guard và lifecycle API mục 15 | S1/S2 độc lập; create/disable/reset/delete có dry-run và job kiểm tra được |
| 4. Hệ thống liên quan | Gameplay, checkin/event, BXH, payment và link | Không còn đường legacy ngoài compatibility/migration có kiểm soát |
| 5. Client/UI | Chọn/đổi server, reset cache và epoch | Đổi server/reconnect không lẫn dữ liệu |
| 6. Migration và tải | Dry-run, cutover/rollback runbook, đối soát, kịch bản tải | Chuyển bản sao DB đạt và có kết quả tải |
| 7. Phát hành | S1 dữ liệu cũ, S2 thí điểm, mở thêm từng đợt | Theo dõi ổn định trước mở hàng loạt |

Các giai đoạn có thể chia thành PR nhỏ nhưng không bật nhiều server trên production khi payment/link/claim vẫn dùng scope cũ.

Theo AGENTS.md: tạo/cập nhật contract, registry và index tài liệu của repository liên quan trước viết mã; backend build, Godot parser, static suite và UI gate áp dụng theo phạm vi thay đổi. Tài liệu này không thay thế contract và không đánh dấu tính năng ACTIVE.

## 11. Kiểm thử nghiệm thu

- Một tài khoản ở S1/S2 không chia sẻ tài nguyên, inventory, tiến trình hoặc claim.
- Tạo nhân vật đồng thời chỉ có một bộ dữ liệu; lỗi giữa SQL/Storage khôi phục được.
- Giả server ID hoặc nhân vật chưa ready bị chặn.
- Run S1 không hoàn tất/nhận quảng cáo bằng context S2.
- Response S1 đến muộn không cập nhật state/UI S2.
- Mua ở S1 rồi đổi S2, callback vẫn cấp đúng S1.
- Token không được cấp lại ở server khác; callback retry không cấp trùng.
- Claim đồng thời chỉ phát một lần; BXH không trộn server.
- Google link xử lý cả nhân vật không xung đột và xung đột cùng server.
- Migration chạy lại không nhân đôi dữ liệu, giữ quota và thưởng đã nhận.
- Client cũ bị version gate chặn an toàn.
- Server bảo trì chặn request mới và có quy tắc rõ cho run/callback đang tồn tại.
- Kiểm tra mất mạng/reconnect, logout và thay phiên đăng nhập.

## 12. Kiểm thử tải và vận hành

Dữ liệu mẫu: 200 server, 40.000 nhân vật; số account có thể thấp hơn nếu một account có nhiều nhân vật.

Đo bootstrap, start/finish run, nâng cấp, inventory, mua hàng và reset BXH tuần. Tăng CCU theo từng mức dựa trên mục tiêu kinh doanh; không coi 40.000 nhân vật là 40.000 CCU.

Theo dõi p95/p99 độ trễ, lỗi RPC, conflict/retry, DB CPU/I/O, pool connection, thời gian khóa, hàng đợi cấp thưởng và scheduler lag. Chốt ngưỡng chấp nhận trước benchmark.

Log nghiệp vụ mang account, server, run/order/grant ID và request ID phù hợp; không ghi token hay dữ liệu nhạy cảm. Dashboard cần lọc theo server.

Chỉ partition/chia DB khi số đo hoặc nhu cầu vận hành chứng minh cần. Việc chuyển server sang cụm khác còn cần công cụ copy/reconcile, định tuyến và chiến lược xác thực; registry/repository chỉ tạo nền tảng.

## 13. Quyết định cần chốt trước implementation

1. 200 người/server là dự kiến hay giới hạn cứng; mục tiêu CCU và tải cao điểm.
2. Tên nhân vật unique theo server hay toàn game.
3. Scope chính thức của VIP, bỏ quảng cáo, nạp đầu, gói ngày và giới hạn mua.
4. Khi đổi server có active run: chặn đổi, cho giữ run để quay lại, hay abandon có xác nhận.
5. Điểm danh/event tính theo ngày tạo nhân vật hay ngày mở server; campaign cũ bảo toàn thế nào.
6. Chính sách chọn tiến trình khi link hai tài khoản cùng có nhân vật trên một server.
7. Cửa sổ bảo trì, phiên bản client tối thiểu, thời gian giữ legacy và runbook rollback.

## 14. Tài liệu tham chiếu

- [Index backend](INDEX.md)
- [C121 Online-only](contracts/C121_ONLINE_ONLY_CONFIG.md)
- [C131 Single login](contracts/C131_SINGLE_LOGIN.md)
- [C133 Run lifecycle](contracts/C133_RUN_LIFECYCLE.md)
- [C135 Weekly leaderboard rewards](contracts/C135_WEEKLY_LEADERBOARD_REWARDS.md)
- [PostgreSQL 16: Schemas](https://www.postgresql.org/docs/16/ddl-schemas.html)

Thiết kế ban đầu dựa trên mã nguồn rà ngày 2026-10-19. Implementation và diễn tập runtime/migration local được cập nhật ở mục 16; chưa chạy benchmark hoặc migration production.

## 15. API quản trị vòng đời server và dọn dữ liệu

Đây là phạm vi bắt buộc của implementation, gồm tạo mới, disable/enable, reset, delete và kiểm tra/dọn dữ liệu liên quan. API được thiết kế dưới dạng Nakama admin RPC; không mặc định có HTTP route riêng. Mục này là đặc tả dự kiến, chưa triển khai endpoint hoặc thao tác dữ liệu thật.

### 15.1. Danh mục API

| RPC dự kiến | Mục đích | Kết quả/hành vi |
|---|---|---|
| `admin_server_list` | Liệt kê cả server ẩn, disabled, tombstone | Pagination, filter trạng thái và môi trường |
| `admin_server_inspect` | Xem cấu hình, generation, số nhân vật, dependency, job | Read-only; nêu thời điểm snapshot |
| `admin_server_create` | Tạo server từ config release/template | Job provisioning; chỉ mở sau validate |
| `admin_server_update` | Sửa tên, lịch mở, cho tạo nhân vật mới | Kiểm tra revision; không sửa ID/generation trực tiếp |
| `admin_server_disable` | Ngừng cho vào và ngừng gameplay mutation | Fence writer, drain request, trả trạng thái drain |
| `admin_server_enable` | Mở lại server đã disable | Chỉ khi không có job phá hủy, integrity đạt |
| `admin_server_operation_plan` | Dry-run reset/delete/cleanup | Manifest, số lượng, blocker, plan ID và hạn dùng |
| `admin_server_reset` | Tạo thế hệ tiến trình mới cho cùng server | Job có checkpoint; mặc định giữ disabled sau reset |
| `admin_server_delete` | Ngừng server và xóa dữ liệu gameplay trong phạm vi | Job; giữ tombstone và dữ liệu lưu giữ bắt buộc |
| `admin_server_cleanup` | Dọn generation cũ, orphan và dữ liệu tạm đủ điều kiện | Chỉ chạy manifest có ownership rõ ràng |
| `admin_server_integrity_check` | Phát hiện tham chiếu hỏng, orphan, sai scope | Báo cáo; không tự sửa/xóa |
| `admin_server_job_get` | Xem tiến độ, checkpoint, lỗi và báo cáo | Read-only theo job ID |
| `admin_server_job_retry` | Tiếp tục job lỗi | Resume checkpoint, không chạy lại grant/delete đã xong |

Create hỗ trợ `template_id`, `config_release`, `opens_at`, `allow_new_characters` và `request_id`. Template chỉ chứa cấu hình được phép sao chép, không clone nhân vật, giao dịch hoặc secret. Lệnh create trùng request ID và cùng payload trả lại kết quả trước; khác payload trả conflict.

Disable không xóa dữ liệu và không khóa tài khoản Nakama dùng chung. Nó phải chặn cả request HTTP còn phiên hợp lệ, worker, scheduler và realtime gameplay của server đích. Có thể gửi tín hiệu client thoát về chọn server, nhưng guard backend mới là ranh giới thực thi.

### 15.2. Giao thức dry-run và thực thi

Ví dụ plan:

```json
{
  "server_id": "s002",
  "action": "reset",
  "expected_generation": 1,
  "expected_revision": 12,
  "policy": "fresh_progress",
  "reason": "reset bộ dữ liệu test"
}
```

Response gồm `plan_id`, `manifest_hash`, `expires_at`, generation/revision đã đọc, số bản ghi theo nhóm, dữ liệu giữ lại, blocker và yêu cầu snapshot/backup nếu có. Manifest lưu phía backend, không nhận danh sách table/key tùy ý từ client quản trị.

Lệnh execute gửi `server_id`, `plan_id`, `manifest_hash`, `request_id`, `expected_generation`, `expected_revision`. Trả `job_id`, không giữ RPC chờ xóa toàn bộ dữ liệu. Mỗi action chỉ nhận đúng loại plan của nó.

Plan chỉ là preview. Worker phải khóa operation của server, fence/drain writer rồi kiểm tra lại inventory và các blocker trước bước phá hủy. Revision không thay đổi theo từng lần ghi gameplay nên revision một mình không chứng minh dữ liệu chưa đổi. Phạm vi/count/hash thay đổi làm plan hết hiệu lực hoặc cần lập lại; không âm thầm mở rộng tập xóa.

Các mã lỗi cần có: `PLAN_EXPIRED`, `PLAN_STALE`, `OPERATION_IN_PROGRESS`, `SERVER_NOT_DRAINED`, `PENDING_FINANCIAL_DELIVERY`, `GENERATION_MISMATCH`, `INTEGRITY_CHECK_FAILED`, `RETENTION_BLOCKED`.

### 15.3. Generation và chống request/callback cũ

Reset chuyển `generation = n` sang `n + 1`. Key Storage, ID BXH, claim, run, event và dữ liệu SQL theo tiến trình đều mang generation. Ví dụ key là `s002:g2:main`; ID BXH tương ứng cần chứa `g2`.

- Client gửi generation đã bootstrap; backend từ chối generation cũ.
- Mọi writer, kể cả worker/callback/link tài khoản, tham gia cùng cơ chế fence/lease theo server. Kiểm tra trạng thái một lần ở đầu RPC chưa đủ: phải ngăn request đang chạy commit sau khi reset đã được coi là hoàn tất.
- Job đóng quyền lấy lease mới, chờ writer hiện có hoàn tất; không coi timeout là bằng chứng writer đã dừng. Nếu không xác minh được thì giữ server disabled và job blocked/failed.
- Callback lưu bền vững theo order/ad session gốc với server và generation bất biến.
- Giao dịch generation cũ không được tự chuyển thưởng sang generation mới; đưa vào luồng reconciliation có trạng thái rõ ràng.
- Account link chạm nhiều server phải lấy khóa theo thứ tự ổn định hoặc từ chối khi lifecycle job đang hoạt động.

### 15.4. Quy trình reset

1. Yêu cầu server disabled; lấy operation lock và fence/drain toàn bộ writer.
2. Revalidate plan, integrity và giao dịch đang chờ. Pending delivery chưa có hướng xử lý là blocker mặc định.
3. Lập manifest dữ liệu generation cũ; ghi snapshot phục hồi theo policy và kiểm tra khả năng đọc snapshot.
4. Khởi tạo namespace/config/BXH generation mới, kiểm tra trước khi trỏ registry sang đó.
5. Đánh dấu nhân vật generation cũ retired, vô hiệu run/claim/job cũ; khởi tạo nhân vật mới khi người chơi vào hoặc qua job có kiểm soát.
6. Chuyển generation registry và trạng thái trong transaction SQL phù hợp; server tiếp tục disabled để kiểm thử.
7. Integrity check và báo cáo diff trước/sau. Dọn generation cũ bằng cleanup job sau thời gian lưu giữ.
8. Enable là thao tác riêng, chỉ khi kiểm tra đạt.

Không xóa lịch sử giao dịch để biến giao dịch cũ thành giao dịch có thể nhận lại. Quyền lợi nào được phục hồi sau reset phải có policy và grant ID riêng; không tự cộng lại mọi purchase. Reset production có giao dịch thật bị chặn nếu policy tài chính chưa chốt.

### 15.5. Quy trình delete và cleanup

Delete đi qua `disabled → deleting → deleted`, giữ ID dưới dạng tombstone và không tái sử dụng. Gỡ server khỏi danh sách vào game trước khi dọn; không hard-delete registry rồi để dữ liệu con mất dấu chủ sở hữu.

| Nhóm dữ liệu | Cách xử lý |
|---|---|
| Profile, inventory, heroes, identity, event/checkin, claim, active run | Xóa bằng exact ownership server/generation/collection/key trong manifest |
| Điểm, mùa, award và BXH Nakama | Dọn records/board đúng server/generation; giữ bản lưu nếu policy yêu cầu |
| Job gameplay, notification, queue, outbox | Hủy/vô hiệu đúng scope; không hủy callback tài chính cần đối soát |
| Preference `last_server_id`, cache và index phục vụ danh sách | Gỡ tham chiếu đến server đã xóa; không xóa account |
| Config override theo server | Xóa khi không còn dependency; giữ config release/template dùng chung |
| Purchase, receipt, VIP credit, token dedupe, refund và audit | Giữ ledger/tombstone tối thiểu theo retention; không biến thành rác để xóa theo server |
| Account, Google/email, compliance, entitlement toàn tài khoản | Giữ nguyên |
| Snapshot, generation retired, log tạm | Cleanup khi đủ retention, không còn job/đối soát phụ thuộc |

Ownership registry phải khai báo collection/table, cách xác định server/generation, handler đếm/xóa/verify và retention. Không xóa Storage chỉ bằng `userId`, wildcard mơ hồ hoặc suy đoán prefix; cùng user còn dữ liệu ở server khác. SQL trực tiếp vào bảng nội bộ Nakama chỉ dùng nếu đã xác minh cache/index và cơ chế vô hiệu hóa; ưu tiên API runtime phù hợp cho Storage/BXH.

Cleanup chạy batch có giới hạn, checkpoint và lease job; crash ở bất kỳ batch nào đều resume được. Không gọi một transaction khổng lồ cho toàn server. Dữ liệu không xác định ownership đưa vào báo cáo để điều tra, không tự xóa.

Hoàn tất phải chứng minh dữ liệu gameplay thuộc phạm vi đã hết, tham chiếu hoạt động không còn trỏ tới server đã xóa, ledger được giữ đúng và dữ liệu S1/S3/tài khoản dùng chung không đổi. Job thất bại giữ trạng thái chưa sẵn sàng, không tự enable.

### 15.6. Auth, audit và mô hình job

Admin RPC kiểm tra danh tính và quyền phía backend theo action, target environment và server; HTTP key thông thường không tự cấp quyền reset/delete. Client gameplay không nhận credential quản trị.

Bổ sung `server_lifecycle_jobs`, `server_operation_plans`, `server_operation_audit` và ownership manifest/snapshot metadata. Audit ghi actor, reason, request ID, plan hash, scope, thời điểm và kết quả; không ghi secret. Lệnh retry có cùng request ID không tạo job thứ hai; request ID cũ với payload khác bị conflict.

Job có `queued`, `running`, `blocked`, `failed`, `succeeded`, kèm phase, cursor, lease, heartbeat, số lượng đã xử lý và lỗi. Một server chỉ có một lifecycle mutation hoạt động. Chỉ hủy job trước điểm phá hủy hoặc tại checkpoint được định nghĩa phục hồi an toàn; sau đó dùng resume/recovery.

### 15.7. Dễ test và bộ kịch bản bắt buộc

Tạo CLI/PowerShell wrapper gọi chính API trên, xuất JSON, hỗ trợ plan/execute/wait/report và exit code rõ ràng. Test fixture tạo S1/S2/S3 và một account có nhân vật cả ba server, dữ liệu sentinel ở server khác và entitlement dùng chung. Không dùng endpoint seed test mở trên production.

Một lệnh integration suite local phải dựng fixture, chạy kịch bản, so sánh manifest/checksum dữ liệu được giữ và dọn đúng tài nguyên test đã tạo. Đồng hồ test, fault injection và dữ liệu payment giả chỉ hoạt động trong môi trường test được xác minh phía backend.

| Kịch bản | Điều kiện đạt |
|---|---|
| Create retry và hai create đồng thời | Một registry/job hợp lệ; không clone dữ liệu người chơi |
| Disable khi có request đang ghi | Writer drain được; sau hoàn tất không có mutation mới lọt qua |
| Enable sau disable | Tiến trình giữ nguyên; integrity đạt |
| Dry-run reset/delete/cleanup | Không ghi hoặc xóa dữ liệu nghiệp vụ |
| Plan hết hạn, sai hash, sai server hoặc action | Bị từ chối, không tác động dữ liệu |
| Reset S2 | Generation tăng một lần, S1/S3 và account dùng chung giữ nguyên |
| Response/run/claim cũ sau reset | Bị từ chối, không ghi vào generation mới |
| Callback đến trước/trong/sau reset hoặc delete | Có bản ghi bền vững, không cấp nhầm/nhân đôi; đối soát được |
| Crash giữa batch, mất lease, retry nhiều lần | Resume đúng checkpoint, không có hai worker phá hủy song song |
| Delete S2 rồi cleanup lại | Kết quả idempotent, không orphan gameplay, ledger/dedupe còn đúng |
| Ownership lạ, pending tài chính, integrity lỗi | Block và báo dependency cụ thể |
| Link tài khoản hoặc scheduler chạy cùng lifecycle job | Không deadlock vô hạn, không tái tạo dữ liệu đã dọn |
| Sai quyền/môi trường, gameplay client gọi admin RPC | Bị từ chối trước mutation |

Những kiểm thử này là điều kiện phát hành multi-server, không chỉ tiện ích vận hành bổ sung sau này.

## 16. Implementation local và runbook vận hành

### 16.1. Thanh toán và Google

- Purchase order, SKU/platform và đích server/generation là snapshot bất biến. Pending order, first purchase, giới hạn mua, VIP, daily pack và quota ads tách theo nhân vật. No-ads vẫn dùng chung account.
- Claim sai đích trả `ORDER_TARGET_MISMATCH`. Restore tra order gốc, không tạo order tại server hiện tại. Reservation receipt tồn tại bền vững trước grant. Profile/inventory/heroes và marker `player_purchase_grants` ghi trong một batch CAS nguyên tử; retry sau crash không phụ thuộc danh sách marker 200 giao dịch gần nhất.
- Google verifier đối chiếu `obfuscatedExternalProfileId` với order qua Google API, không tin receipt JSON do client khai. Phải cấu hình `GOOGLE_PLAY_PACKAGE_NAME` trong verifier, `MONETIZATION_VERIFIER_SECRET` ở hai phía và `MONETIZATION_VERIFIER_URL` nếu không dùng endpoint nội bộ mặc định. Chưa kiểm thử giao dịch Google thật trong phiên triển khai này.
- SSV nhận scope từ ad session trong DB. Server disabled/retired hoặc delivery hết hạn: lưu `server_financial_inbox`, không cấp sang generation mới. `admin_server_financial_list` phân trang bằng `after`; `admin_server_financial_retry({event_id})` chỉ replay SSV còn phù hợp original scope. Event refund/đòi bồi hoàn không tự replay reward.
- RTDN ghi tombstone token và cập nhật ledger/no-ads/inbox trong một transaction SQL; retry không trừ quyền lợi lần hai. VIP loại giao dịch voided. Consumable đã dùng cần review trong inbox, không tự lấy tài nguyên từ server khác.
- Google link giữ nhân vật ở server không trùng. Server trùng giữ tiến trình account được chọn, không cộng tài nguyên. Giao dịch trả phí ở character trùng bị chặn `PAID_CHARACTER_CONFLICT_REQUIRES_SUPPORT`; không âm thầm mất đồ hoặc cấp lại. Archive giữ hai bản gốc; account và server được khóa thứ tự ổn định, snapshot được kiểm tra lại khi confirm. Bảng task sửa BXH lifetime sau commit; retry khi confirm/enter đúng scope. Nhân vật server disabled chờ mở lại để sửa BXH, không bypass admission.
- iOS có provider/platform/SKU boundary nhưng chưa có StoreKit verifier: trả unavailable, không gọi Google hoặc mock Android. Không quảng bá là đã hỗ trợ mua hàng iOS.

### 16.2. Lifecycle API và cách test

Tất cả RPC yêu cầu session của `CONFIG_ADMIN_USER_ID`, không chỉ HTTP key. Dùng `tools/server_lifecycle.cjs` với `C143_ADMIN_TOKEN`; tool chỉ chấp nhận localhost, không chứa token trong log.

```powershell
node tools/server_lifecycle.cjs --action inspect --payload '{"server_id":"s002"}'
node tools/server_lifecycle.cjs --action disable --payload '{"server_id":"s002","expected_revision":1,"reason":"local test"}'
node tools/server_lifecycle.cjs --action plan --payload '{"server_id":"s002","action":"reset","expected_generation":1,"expected_revision":2,"reason":"local reset"}'
```

Execute gửi lại `server_id`, `action`, `expected_generation`, `expected_revision`, `plan_id`, `manifest_hash`, `request_id` qua `--action execute`. Dùng giá trị thực từ plan, không copy revision ví dụ. `--action job` và `--action job_step` nhận `{job_id}`; mỗi step tối đa 100 Storage object. Gọi step đến `succeeded`, kiểm tra `error` nếu blocked. Không có background worker tự xóa dữ liệu khi startup.

Reset retire generation cũ và tăng generation một lần trong transaction; server vẫn disabled. Snapshot namespace cũ giữ tối thiểu 7 ngày. Delete dọn generation hiện tại bằng exact key/version, SQL weekly, board và preference; giữ tombstone server. Generation cũ dọn riêng bằng action cleanup sau retention. Ledger, token dedupe, identity, compliance, entitlement và config release không bị xóa.

Pending financial delivery chặn thực thi. `admin_server_expire_pending({server_id,expected_revision,reason})` chỉ đóng order chưa xác minh/không reservation và ad prepared đã hết hạn, trên server disabled/drained; tăng revision và audit. Không xóa hồ sơ giao dịch, không tự bỏ qua giao dịch đã xác minh. Reset có tiền thật bị chặn `PAID_RESET_POLICY_REQUIRED` đến khi chốt policy bồi hoàn.

Lease job không tự bị chiếm lại chỉ vì hết timeout: worker cũ có thể vẫn chạy. Sau process crash, **dừng toàn bộ runtime node** rồi dùng `--action recover-offline --job-id UUID --runtime-stopped --psql PATH --port PORT --database DB` để bỏ lease bị kẹt; khởi động lại và resume checkpoint. Không tự đặt active_requests về 0 trên runtime đang sống. Counter account/server bị kẹt sau crash phải được đối soát offline trước khi mở admission.

### 16.3. Migration S1

Tool: `tools/migrate_s1.cjs`. Từ v1.3.0 hỗ trợ local/staging/production với environment/target acknowledgement, backup manifest và guard riêng cho production; không tự tạo/mở S1 hay bật feature flag. Xem [runbook cập nhật](S1_MIGRATION_RUNBOOK.md) để dùng đúng CLI. Cần schema runtime mới, registry `s001` generation 1 disabled và config release hợp lệ.

```powershell
node tools/migrate_s1.cjs --environment local --mode plan --psql PATH --port PORT --database DB
# Sau backup và dừng TẤT CẢ Nakama node/scheduler/verifier writers:
node tools/migrate_s1.cjs --environment local --mode backup --confirm-target CLUSTER_ID/DB --backup ABSOLUTE_BACKUP_PATH --runtime-stopped --psql PATH --port PORT --database DB
node tools/migrate_s1.cjs --environment local --mode apply --confirm-target CLUSTER_ID/DB --backup ABSOLUTE_BACKUP_PATH --plan-hash HASH_FROM_PLAN --runtime-stopped --psql PATH --port PORT --database DB
node tools/migrate_s1.cjs --environment local --mode verify --psql PATH --port PORT --database DB
```

Apply khóa bảng, đối chiếu hash, từ chối S1 đã có dữ liệu hoặc pending delivery/run. Copy Storage sang S1 g1 giữ value/version/create time, character created_at theo account gốc, backfill scope tài chính/quota, copy weekly periods/scores/awards và native lifetime boards/records. Claim markers đi cùng Storage. Legacy vẫn nguyên; checkpoint chống apply trùng. Thay đổi bảng native chỉ diễn ra offline để Nakama nạp lại cache/index sau restart.

Verify so sánh Storage nguồn/đích khi runtime vẫn dừng. Không chạy verify như đối soát sau khi người chơi đã ghi tiến trình mới. Rollback trước khi bật admission có thể bỏ namespace đích và restore backup đã xác minh; **sau phát sinh ghi mới không được chỉ tắt flag rồi dùng legacy cũ** — cần đóng writer, backup và đối soát dữ liệu/giao dịch phát sinh. Chưa chạy migration trên dữ liệu thật.

### 16.4. Bằng chứng và gate còn lại

`npm run build`; `tests/run_static_tests.ps1` ở hai repo; Godot `TestServerSelection`, `TestBillingProviders`; `node tests/test_multiserver_runtime.cjs` đã chạy local. Native suite tự dựng PostgreSQL 16 + Nakama 3.24.2, diễn tập migration offline/replay/verify, Google merge/archive/replay, IAP/VIP/ad isolation, late SSV inbox, reset/recreate/delete/retention/cleanup và kiểm tra sentinel S1/legacy. Tài nguyên Docker test được dọn theo tên chính xác sau suite, không tác động stack local có sẵn.

Chưa đủ điều kiện production: chưa benchmark 200 server, chưa chạy Google Play sandbox thật, chưa fault-injection đa node đầy đủ, chưa rehearsal backup/restore trên bản sao dữ liệu thật; paid reset/conflicting paid characters và StoreKit vẫn cần chính sách/triển khai tương ứng. Contract giữ IN_PROGRESS cho nghiệm thu phát hành; cấu hình triển khai vẫn không bật `MULTI_SERVER_ENABLED`.
