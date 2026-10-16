function createLeaderboards(nk: nkruntime.Nakama, logger: nkruntime.Logger) {
    try {
        // Số wave cao nhất (giữ best score)
        nk.leaderboardCreate("best_wave", false, "desc" as nkruntime.SortOrder, "best" as nkruntime.Operator, "", {});

        // Tổng enemy killed cao nhất (giữ best)
        nk.leaderboardCreate("most_kills", false, "desc" as nkruntime.SortOrder, "best" as nkruntime.Operator, "", {});

        // Số lần thắng stage (tích lũy)
        nk.leaderboardCreate("total_wins", false, "desc" as nkruntime.SortOrder, "incr" as nkruntime.Operator, "", {});

        // Bảng Tu Vi (Cảnh giới / Cấp độ tu vi người chơi, vĩnh viễn)
        nk.leaderboardCreate("cultivation_realm", false, "desc" as nkruntime.SortOrder, "best" as nkruntime.Operator, "", {});

        // Bảng Lịch Duyệt (Số ải chiến dịch cao nhất vượt qua, vĩnh viễn)
        nk.leaderboardCreate("campaign_stage", false, "desc" as nkruntime.SortOrder, "best" as nkruntime.Operator, "", {});

        // Bảng Chiến Lực (Tổng điểm lực chiến, reset hàng tuần)
        nk.leaderboardCreate("combat_power_v2", true, "desc" as nkruntime.SortOrder, "set" as nkruntime.Operator, "0 0 * * 1", {power_version:2});

        // Tự động đồng bộ toàn bộ tài khoản người chơi thực tế trong DB vào Bảng Xếp Hạng
        if (typeof syncAllStoredProfilesToLeaderboards === "function") {
            syncAllStoredProfilesToLeaderboards(nk, logger);
        }

        logger.info("Leaderboards created and initialized with real database users.");
    } catch (e: any) {
        // Already exists — OK
        logger.info("Leaderboards already exist or failed: " + String(e.message || e));
    }
}
