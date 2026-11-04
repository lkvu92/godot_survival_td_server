# Tài Liệu Kỹ Thuật: Quản Trị Gói Vật Phẩm & Mô Hình Mua Hàng (Store Packages Admin)

## 1. Tổng quan
Hệ thống **Store Packages (Gói Sản Phẩm Trong Game)** chịu trách nhiệm quản lý authoritative danh mục hàng hóa nạp tiền (IAP), các gói ưu đãi, gói định kỳ và phần thưởng kèm theo trong Survival TD. 

Hệ thống được thiết kế xuyên suốt 3 tầng:
1. **Web Admin Dashboard (Next.js 16)**: Cung cấp giao diện trực quan cho quản trị viên tạo, sửa, đổi loại hình mua, thêm bớt vật phẩm catalog và xem thống kê.
2. **Authoritative Backend (Nakama Goja + PostgreSQL)**: Kiểm soát nghiệp vụ, ràng buộc giao dịch, tự động đếm hạn mức theo chu kỳ, chống gian lận và cấp phát phần thưởng.
3. **Game Client (Godot 4.x Engine)**: Đồng bộ danh mục hiển thị, huy hiệu giới hạn, trạng thái nút mua (Giá tiền, "ĐÃ SỞ HỮU", "HẾT LƯỢT").

---

## 2. Ba Mô Hình Mua Hàng (Purchase Models)

Hệ thống phân định rành mạch 3 loại hình mua hàng:

| Mô hình | Đặc điểm cấu hình | Cơ chế Backend (Nakama) | Hiển thị Game Client (Godot) | Ứng dụng thực tế |
| :--- | :--- | :--- | :--- | :--- |
| **1. Mua 1 lần duy nhất** *(Unique / Non-consumable)* | • `unique_purchase = TRUE`<br>• `fulfillment_type = 'non_consumable'`<br>• `purchase_limit = 0` hoặc `1`<br>• `purchase_limit_period = ''` | • Khi người chơi hoàn tất mua, `product_id` được lưu vĩnh viễn vào `owned_iap_products` trong profile và `monetization_purchase_orders`.<br>• RPC `create_purchase_order` kiểm tra lịch sử: Nếu đã có đơn `fulfilled`, lập tức trả về `already_fulfilled = true` và từ chối tạo đơn mới. | • Client kiểm tra `UserContext.current_user.owned_iap_products`.<br>• Nếu đã sở hữu: Đổi nút mua thành **"ĐÃ SỞ HỮU"** và `disabled = true`.<br>• Huy hiệu hiển thị: `★ 1 Lần Duy Nhất`. | • Gói Tân Thủ (`first_topup_pack`)<br>• Bỏ Quảng Cáo Trọn Đời (`remove_ads_permanent`)<br>• Thẻ Đặc Quyền Tu Tiên (`privilege_card`)<br>• Quỹ Trưởng Thành (`growth_fund`) |
| **2. Giới hạn số lượt mua** *(Rate-limited by period)* | • `unique_purchase = FALSE`<br>• `fulfillment_type = 'consumable'`<br>• `purchase_limit = N` (N >= 1)<br>• `purchase_limit_period = 'daily'` \| `'weekly'` \| `'monthly'` \| `''` | • RPC `create_purchase_order` đếm số đơn hàng `fulfilled` trong mốc thời gian chỉ định qua PostgreSQL:<br>  - `daily`: `DATE_TRUNC('day', NOW())`<br>  - `weekly`: `DATE_TRUNC('week', NOW())`<br>  - `monthly`: `DATE_TRUNC('month', NOW())`<br>  - `lifetime` (rỗng): Đếm toàn bộ lịch sử.<br>• Nếu `count >= N`, server ném mã lỗi `409: Đã đạt giới hạn lượt mua`. | • Card hiển thị nhãn giới hạn: `Giới hạn: N lần / ngày (hoặc tuần/tháng)`.<br>• Khi hết lượt mua, nút mua bị khóa và hiển thị trạng thái hết lượt. | • Lễ Bao Hằng Ngày (`daily_deal` - 1 lần/ngày)<br>• Gói Thể Lực Ngày (Tối đa 2 lần/ngày)<br>• Rương Đá Nâng Cấp Tuần (3 lần/tuần)<br>• Gói Đột Phá Sự Kiện (1 lần/sự kiện) |
| **3. Mua tự do không giới hạn** *(Unlimited / Consumable)* | • `unique_purchase = FALSE`<br>• `fulfillment_type = 'consumable'`<br>• `purchase_limit = 0`<br>• `purchase_limit_period = ''` | • Không áp dụng bất kỳ ràng buộc giới hạn nào.<br>• Mỗi lần thanh toán hợp lệ, hệ thống cộng tài nguyên trực tiếp vào túi đồ hoặc gửi quà qua hòm thư người chơi. | • Nút mua luôn hiển thị giá tiền bản địa hóa (hoặc fallback price).<br>• Luôn cho phép bấm mua tự do. | • Nạp Đá Quý (Túi, Rương Đá Quý)<br>• Mua Vàng (Rương Vàng, Kho Vàng)<br>• Vé càn quét, vật phẩm tiêu hao thông thường |

---

## 3. Kiến Trúc Cơ Sở Dữ Liệu PostgreSQL

### Bảng `game_store_products`
```sql
CREATE TABLE IF NOT EXISTS game_store_products (
    product_id            TEXT PRIMARY KEY,
    pack_id               TEXT NOT NULL,
    tab_id                TEXT NOT NULL DEFAULT 'resources',
    display_name          TEXT NOT NULL,
    description           TEXT NOT NULL DEFAULT '',
    badge                 TEXT NOT NULL DEFAULT '',
    icon_type             TEXT NOT NULL DEFAULT 'pack',
    icon_key              TEXT NOT NULL DEFAULT '',
    fallback_price        TEXT NOT NULL DEFAULT '$0.99',
    google_product_type   TEXT NOT NULL DEFAULT 'inapp',
    fulfillment_type      TEXT NOT NULL DEFAULT 'consumable',
    active                BOOLEAN NOT NULL DEFAULT TRUE,
    unique_purchase       BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_limit        INT NOT NULL DEFAULT 0,
    purchase_limit_period TEXT NOT NULL DEFAULT '',
    ui                    JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Bảng `game_store_product_rewards`
```sql
CREATE TABLE IF NOT EXISTS game_store_product_rewards (
    product_id  TEXT NOT NULL REFERENCES game_store_products(product_id) ON DELETE CASCADE,
    line_no     INT NOT NULL,
    reward_type TEXT NOT NULL,
    reward_id   TEXT NOT NULL,
    quantity    INT NOT NULL DEFAULT 1,
    metadata    JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (product_id, line_no)
);
```

---

## 4. Authoritative RPCs (Nakama Backend)

### 4.1. `admin_pack_list`
* **Xác thực**: Yêu cầu quyền admin (`isConfigAdmin`).
* **Hỗ trợ Filter**:
  * `tab_id`: Lọc theo tab (`resources`, `daily`, `passes`, `privileges`, `first_topup`, `supplemental`, `all`).
  * `purchase_type`: Lọc theo mô hình mua (`unique`, `limited`, `unlimited`, `all`).
  * `search`: Tìm kiếm theo `product_id`, `display_name`, `description`.
  * `active`: Lọc trạng thái mở bán (`true`, `false`, `all`).
* **Thống kê trả về (`stats`)**:
  * `total_packs`, `active_packs`, `inactive_packs`.
  * `unique_packs`, `limited_packs`, `unlimited_packs`.
  * `tab_counts`: Số lượng gói theo từng tab.

### 4.2. `admin_pack_save`
* **Xác thực**: Yêu cầu quyền admin.
* **Quy chuẩn lưu trữ**:
  * Khi `unique_purchase = true`: Tự động chuẩn hóa `fulfillment_type = 'non_consumable'`, `purchase_limit = 0`, `purchase_limit_period = ''`.
  * Khi `purchase_limit > 0`: Chuẩn hóa `fulfillment_type = 'consumable'`, `purchase_limit_period = 'daily' | 'weekly' | 'monthly' | ''`.
  * Tự động sinh `presentation_rewards` đồng bộ 1:1 với vật phẩm catalog và tiền tệ (kèm `icon_key`, `quantity`, `rarity`).

### 4.3. `create_purchase_order`
* **Xác thực**: User Session.
* **Bảo vệ giới hạn mua**:
  * Kiểm tra `unique_purchase`: Chặn nếu đã có đơn `fulfilled`.
  * Kiểm tra `purchase_limit` theo chu kỳ: Đếm đơn hàng `fulfilled` bằng `DATE_TRUNC(period, NOW())`.

---

## 5. Hướng Dẫn Sử Dụng Web Admin

1. **Truy cập**: `/dashboard/packs`.
2. **Bộ Lọc**:
   * Chọn Tab Danh Mục trên thanh tab (Nạp Đầu, Tài Nguyên, Gói Ngày, v.v.).
   * Chọn Bộ Lọc Loại Mua: `1 Lần Duy Nhất`, `Giới Hạn Lượt Mua`, hoặc `Mua Không Giới Hạn`.
3. **Thêm / Chỉnh Sửa Gói**:
   * Nhấn nút **"Thêm Gói Mới"** hoặc biểu tượng cây bút tại gói cần sửa.
   * Chọn **1 trong 3 thẻ Radio Loại Hình Mua**:
     * 💎 **1 Lần Duy Nhất**: Phù hợp gói ưu đãi tân thủ, mở khóa tính năng vĩnh viễn.
     * ⏱️ **Giới Hạn Lượt Mua**: Nhập số lượt và chọn chu kỳ (Mỗi ngày, Mỗi tuần, Mỗi tháng, Trọn đời).
     * ♾️ **Mua Tự Do (Vô Hạn)**: Phù hợp nạp tiền tệ, rương tài nguyên.
   * Chọn phần thưởng từ kho **Item Catalog** với tính năng tìm kiếm debounced.
   * Bấm **"Lưu Gói Sản Phẩm"**.

