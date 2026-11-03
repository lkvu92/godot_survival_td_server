# C243 Soft Gate, mock OTP và giới hạn thời gian
Version 1.1.0; Status IN_PROGRESS.

1.1.0: C247 adds protected profile lookup, verified CAS+audit updates and DOB review policy. B4 mock bounds now validate integer TTL/attempt/resend values, expire at the exact TTL boundary, and return structured busy reasons on challenge CAS conflicts. Fixed 123456 does not model real code randomness, SMS delivery or phone ownership. Real provider remains future scope.

Email/session và lobby không bị phone gate. RPC compliance_access(action=status/request/verify/heartbeat) theo tài khoản, current-login guard; hồ sơ DOB/name/phone/guardian gửi request, OTP thử 123456, challenge TTL/attempts và phone VN validation phía server. Mock chỉ khi policy provider=mock và env COMPLIANCE_ALLOW_MOCK=true; không phải xác thực SMS thật và không phải chứng minh tuân thủ pháp lý. Cờ is_phone_verified tách is_verified legacy, verification_method=mock. Policy system.compliance_policy từ published snapshot, thiếu/sai chặn gameplay nhưng cho lobby/KYC.

Server combat gate bao phủ start_stage/start_trial_tower/prepare_trial_tower/tribulation_action/start_sweep/award_stage_progression/finish_trial_tower. Client gate trước ArcSelect và mọi cảnh chiến đấu; đánh dấu khóa UI nhưng giữ nút click được để mở form. DOB nhóm tuổi do server; dưới guardian_below_age cần guardian_name và guardian_phone; OTP xác minh số người giám hộ. Không yêu cầu restart; refresh signal cập nhật UI.

Thời gian: ledger account+game+ngày UTC+7, lease hoạt động tối đa lease_seconds; server heartbeat thu thời gian và kiểm tra ngưỡng tuổi trong policy.age_bands. Admission gia hạn lease; heartbeat client khi đang chơi, lease hết không tiếp tục. Giới hạn tổng theo account qua game_id trong cùng DB; chưa giải quyết cùng người nhiều tài khoản hoặc nhiều backend không chia DB. Không dùng mock để khai đã OTP thật trong văn bản nộp.

Artifacts theo nhóm B3/B4/B5/C1/C2/C3/C5; system.md, dossier.md, evidence/manifest và ảnh hoặc response/test data. Trạng thái giữ IN_PROGRESS đến đủ UI/runtime và dữ liệu kiểm chứng.

Changelog 1.0.0: initial implementation contract.

