# C182 — Thẻ tăng thưởng: Shop 1 giờ và gói sự kiện

## Trạng thái

ACTIVE — 2026-10-23.

## Danh mục shop authoritative

Huyền Thiên Các đọc các offer từ `progression.talisman_system.store.materials`, category `boost_cards`. Mỗi thẻ dưới đây có hai offer, một Gem và một Vàng. Tỷ giá chuẩn là **1 Gem = 500 Vàng**.

| Item ID | Hiệu lực | Gem | Vàng |
|---|---:|---:|---:|
| `exp_boost_card_10_1h` | EXP +10%, 1 giờ | 100 | 50.000 |
| `exp_boost_card_25_1h` | EXP +25%, 1 giờ | 250 | 125.000 |
| `gold_boost_card_10_1h` | Gold +10%, 1 giờ | 100 | 50.000 |
| `gold_boost_card_25_1h` | Gold +25%, 1 giờ | 250 | 125.000 |

`buy_material` là server-authoritative: item, currency, price, quantity, số dư và request replay đều được xác thực theo danh sách offer này. Không có offer là không thể mua bằng request tự tạo.

## Phân loại UI

`HuyenThienCacDialog` có filter `boost_cards` riêng. Filter chỉ nhận offer cùng category; filter Gold/Gem vẫn bao gồm các offer phù hợp theo tiền tệ. Thẻ shop dùng icon cùng cấp phần trăm để người chơi nhận biết tức thì.

## Thẻ cao cấp

Các thẻ +50%, x2 và x5 (cả EXP lẫn Gold) không có offer trực tiếp trong `materials` và không còn là thưởng Tháp. Chúng chỉ được cấp qua reward `event_pack: "boost"` của gói sự kiện `flash_sale` trong `packs.json`.

Thẻ 24 giờ cũ được giữ nguyên ID/tác dụng để không làm thay đổi inventory hoặc các phần thưởng đã cấp trước đó. SKU shop hậu tố `_1h` dùng effect server-authoritative `duration: 3600`; card cũ tiếp tục dùng 86.400 giây.

## Kiểm thử tối thiểu

- `test_consumable_store.cjs`: catalog 1 giờ, 8 offer giá/tỷ giá, direct-shop rejection với thẻ cao.
- `test_consumable_use.cjs`: kích hoạt thẻ 1 giờ tạo expiry server khoảng 3.600 giây.
- Seed/remote config phải được publish trước khi client thấy offer mới.
