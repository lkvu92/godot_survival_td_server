# C181 — Mở rộng Tâm Ma Tháp: 30 tầng

Status: ACTIVE  
Version: 1.0.0  
Updated: 2026-10-23

## Phạm vi

Tâm Ma Tháp có 30 tầng. Tiến độ cũ 0–20 vẫn hợp lệ; không reset vé, tiến độ,
inventory hay reward receipt. Backend, challenge, settlement và càn quét đều
nhận tầng 1–30; client hiển thị 30 tầng theo snapshot server.

## Độ khó

Không thêm luật combat mới. Tâm Ma tiếp tục dùng công thức hiện hành:

```text
stat_multiplier(f)  = 0.70 + (f - 1) × 0.10
speed_multiplier(f) = 0.70 + (f - 1) × 0.05
```

Tầng 20 giữ 2.60× chỉ số và 1.65× tốc độ; tầng 30 đạt 3.60× chỉ số và
2.15× tốc độ. HP/ATK/DEF, attack speed và inverse cooldown tiếp tục dùng đúng
những hệ số này.

## Phần thưởng

Mỗi tầng đều có EXP động, vàng và mảnh Pháp tắc đúng phẩm ở cả first-clear và
repeat/sweep. EXP vẫn do server tính theo cấp người chơi và tầng.

| Tầng | Item lặp | Số lượng mỗi lượt |
|---:|---|---:|
| 1–10 | `law_fragment_low` — Hạ phẩm | 7 → 16 |
| 11–20 | `law_fragment_medium` — Trung phẩm | 3 → 12 |
| 21–30 | `law_fragment_high` — Thượng phẩm | 1 → 10 |

Vàng lặp là `4,000 + 2,000 × tầng` (6K → 64K). First-clear có vàng hoặc
Ngọc luân phiên, thẻ boost ở tầng 5/10/15/20/25/30, và thêm milestone fragment:
30 Hạ phẩm ở tầng 10, 15 Trung phẩm ở tầng 20, 8 Thượng phẩm ở tầng 30.

## An toàn và kiểm thử

- Validation chỉ nhận catalog 30 floor liên tiếp; persisted `highest_cleared`
  cho phép 0–30.
- Challenge và tower sweep lấy ceiling từ `floor_count`, không hard-code 20.
- Cần test status/RPC, reward settlement first/repeat, sweep tầng 30, UI 30
  buttons và các mốc hệ số 20/30 trước production.
