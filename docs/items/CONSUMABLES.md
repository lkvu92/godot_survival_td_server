# Vật phẩm tiêu hao — UI và tác dụng

Các con số dưới đây là **cân bằng mặc định ban đầu**, cấu hình từ server trong attributes.effect; không suy từ giá mua. Giá/độ hiếm giữ theo C129. Mỗi lượt dùng tiêu hao 1; ngoài trận có thể chọn nhiều đối với vật phẩm cấp tài nguyên.

| Vật phẩm | Nơi dùng | Tác dụng mặc định |
|---|---|---|
| Đổi Danh Phù | Túi đồ → Sử dụng | Mở đổi tên; miễn phí lần đầu, sau đó 1 thẻ/lần |
| Tẩy Linh Quả | Túi đồ → Sử dụng → Xác nhận | Roll thiên phú và tăng trưởng; giữ cấp, linh căn đã nâng, bonus Thiên Kiếp và Linh Quả |
| Kim/Mộc/Thủy/Hỏa/Thổ Linh Quả | Túi đồ | +5 điểm vĩnh viễn cho hệ tương ứng, giới hạn nhận thêm đến 400 |
| Phong/Lôi/Không Gian Linh Quả | Chưa hỗ trợ | Không mua/dùng |
| Tu Vi Phù | Túi đồ | +10.000 EXP tài khoản; tuân theo cổng Độ Kiếp |
| Kim Nguyên Phù | Túi đồ | +75.000 Vàng |
| Thể Lực Đan | Túi đồ | +15 thể lực, tối đa 30 |
| Công Kích Phù | Trong trận | +30% công kích, 30 giây |
| Hộ Thân Phù | Trong trận | +30% phòng thủ, 30 giây |
| Linh Chuyển Phù | Trong trận | Giảm 20% thời gian hồi chiêu mới, 30 giây |
| Ngũ Hành Hộ Phù | Trong trận | Giảm 20% sát thương ngũ hành nhận, 30 giây |
| Bạo Kích Phù | Trong trận | +10 điểm phần trăm chí mạng, 30 giây, trần 100% |
| Tật Công Phù | Trong trận | Giảm 25% chu kỳ đánh thường, 30 giây |
| Hồi Sinh Phù | Hộp xác nhận khi bị hạ | Hồi 50% HP, bất tử 3 giây, tối đa 1 lần/trận |
| Hồi Xuân Đan | Trong trận | Hồi 30% HP tối đa; đầy HP không tiêu hao |
| Hộ Thuẫn Đan | Trong trận | Khiên riêng bằng 30% HP tối đa, 15 giây |
| Hàn Băng Phù | Trong trận | Làm chậm 40% quái trong bán kính 400 đơn vị, 8 giây |

Vật phẩm trong trận có cooldown thực 15 giây mỗi loại; buff dùng lại làm mới thời gian, không cộng dồn. Thời gian hiệu lực theo thời gian mô phỏng: pause dừng timer, tăng tốc game làm timer chạy theo trận. Cooldown server theo đồng hồ thực và hiển thị theo đồng hồ thực. Khiên vật phẩm độc lập với khiên kỹ năng. Kháng chỉ áp dụng sát thương có hệ ngũ hành.

Thanh vật phẩm ở đáy HUD, cuộn ngang qua ScrollBarUI, dùng viền/rarity UiItemSlot của Inventory, số lượng góc dưới phải. Pause, đã chết, kết thúc trận hoặc mất mạng không dùng được. Hồi sinh dùng hộp riêng, không phải ngoại lệ click slot khi chết. Chưa mở vật phẩm chiến đấu trong Độ Kiếp.

Tẩy Linh Quả tính: nền mới + cấp hiện tại × tăng trưởng mới + bonus Thiên Kiếp + bonus Linh Quả. Không thay đổi profile.elements hoặc dữ liệu nâng cấp tướng. Hồ sơ cũ được tách nguồn một lần từ tổng hiện có và lịch sử Độ Kiếp; thiếu lịch sử không thể suy ra chính xác nguồn cũ, vì vậy lưu toàn bộ phần không thể phân loại như nguồn vĩnh viễn trước khi roll để không làm mất chỉ số.

Không tiêu hao khi lỗi/không đủ đồ/không đạt điều kiện. Mất phản hồi: thử lại cùng request ID, không trừ hai lần. Không cấp thưởng local khi offline.

