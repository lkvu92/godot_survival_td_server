// Survival TD — Leaderboard RPCs (Server-Authoritative from Real Database Profiles)
// C018 v1.4.0 / C118 v1.0.0: permanent-loadout combat power.

function getLeaderboardRealmTitle(level: number): string {
    const safeLvl = Math.max(1, Math.min(50, Math.floor(level)));
    const tier = Math.max(1, Math.min(10, ((safeLvl - 1) % 10) + 1));
    if (safeLvl >= 41) return `Hóa Thần Tầng ${tier}`;
    if (safeLvl >= 31) return `Nguyên Anh Tầng ${tier}`;
    if (safeLvl >= 21) return `Kết Đan Tầng ${tier}`;
    if (safeLvl >= 11) return `Trúc Cơ Tầng ${tier}`;
    return `Luyện Khí Tầng ${tier}`;
}

function formatThousandsNumber(num: number): string {
    return Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatLeaderboardScore(boardId: string, score: number, meta: any): string {
    if (boardId === "cultivation_realm") {
        return (meta && meta.realm) ? String(meta.realm) : getLeaderboardRealmTitle(score);
    } else if (boardId === "campaign_stage") {
        return `Ải ${score}`;
    } else {
        return formatThousandsNumber(score);
    }
}

function combatPowerBoard(id: string): string {
    return id === "combat_power" ? "combat_power_v2" : id;
}

// Đồng bộ toàn bộ tài khoản người chơi thực tế trong DB vào Bảng Xếp Hạng
function syncAllStoredProfilesToLeaderboards(nk: nkruntime.Nakama, logger: nkruntime.Logger): number {
    if((nk as any).__characterContext)throw new Error('Use a server-scoped rebuild job instead of scanning every profile');
    try {
        const rows = nk.sqlQuery(
            "SELECT s.user_id, COALESCE(NULLIF(u.display_name, ''), u.username, 'Đạo Hữu') as username " +
            "FROM storage s " +
            "LEFT JOIN users u ON s.user_id = u.id " +
            "WHERE s.collection = 'player_profiles' AND s.key = 'main' AND NOT EXISTS (SELECT 1 FROM account_link_state als WHERE als.user_id=s.user_id AND als.status='archived')",
            []
        );

        if (!rows || rows.length === 0) return 0;

        const reads: nkruntime.StorageReadRequest[] = [];
        const usernameMap: any = {};
        for (const r of rows) {
            const uid = String(r.user_id || "");
            if (!uid || uid.startsWith("00000000")) continue;
            reads.push({ collection: "player_profiles", key: "main", userId: uid });
            usernameMap[uid] = String(r.username || "Đạo Hữu");
        }

        const objects = nk.storageRead(reads);
        let count = 0;
        for (const obj of objects) {
            const userId = obj.userId;
            const profile = obj.value || {};
            const displayName = String(profile.display_name || usernameMap[userId] || "Đạo Hữu");
            writePlayerLeaderboardRecords(nk, userId, profile, displayName, false);
            count++;
        }
        logger.info(`Synced ${count} real player profiles from DB to leaderboards.`);
        return count;
    } catch (err: any) {
        logger.warn("syncAllStoredProfilesToLeaderboards error: " + String(err.message || err));
        return -1;
    }
}

function writePlayerLeaderboardRecords(nk: nkruntime.Nakama, userId: string, profile: any, displayName?: string, weeklyActive: boolean = true): any {
    const level = Math.max(1, Math.min(50, Number(profile.level || 1)));
    const vip = Number(profile.vip || (profile.vip_progress ? profile.vip_progress.level : 0) || 0);
    const heroId = String(profile.avatar_url || "hero_1");
    let name = String(displayName || profile.display_name || "").trim();
    if (!name) {
        try {
            const acc = nk.accountGetId(userId);
            name = (acc && acc.user && (acc.user.displayName || acc.user.username)) ? (acc.user.displayName || acc.user.username) : "Đạo Hữu";
        } catch (_e) {
            name = "Đạo Hữu";
        }
    }

    let highestStage = 1;
    if (Array.isArray(profile.unlocked_stages)) {
        highestStage = Math.max(1, profile.unlocked_stages.length);
    }
    let power: any = { score: 0, version: 2, hero_id: heroId };
    const catalog = readCombatPowerCatalog(nk);
    power = readPlayerCombatPower(nk, userId, profile, catalog);
    if (!power || power.configured !== true || !Number.isSafeInteger(power.score) || power.score < 0) {
        throw new Error("Combat power configuration unavailable");
    }
    const combatPower = Number(power.score || 0);
    const realmTitle = getLeaderboardRealmTitle(level);

    const metadata = {
        display_name: name,
        avatar_url: heroId,
        hero_id: heroId,
        vip: vip,
        level: level,
        realm: realmTitle,
        stage: highestStage,
        combat_power: combatPower,
        power_version: power.version,
        power_hero_id: power.hero_id
    };

    nk.leaderboardRecordWrite("cultivation_realm", userId, name, level, 0, metadata);
    nk.leaderboardRecordWrite("campaign_stage", userId, name, highestStage, 0, metadata);
    nk.leaderboardRecordWrite("combat_power_v2", userId, name, combatPower, 0, metadata);

    if (weeklyActive && typeof recordWeeklyLeaderboardScores === "function") {
        recordWeeklyLeaderboardScores(nk, userId, name, {cultivation_realm:level,campaign_stage:highestStage,combat_power:combatPower});
    }
    return { metadata, power, level, highestStage, combatPower, name };
}

const syncPlayerLeaderboards: nkruntime.RpcFunction = (ctx, logger, nk, _payload) => {
    if (!ctx.userId) return JSON.stringify({ success: false, code: 401, message: "Unauthorized" });
    const stored = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
    if (!stored || stored.length === 0) {
        return JSON.stringify({ success: false, code: 404, message: "Profile not found" });
    }
    const profile = stored[0].value || {};
    const displayName = String(profile.display_name || ctx.username || "Đạo Hữu");

    let result: any;
    try {
        result = writePlayerLeaderboardRecords(nk, ctx.userId, profile, displayName);
    } catch (e: any) {
        if (logger && logger.error) logger.error("Failed to write leaderboard records: " + String(e.message || e));
        return JSON.stringify({ success: false, code: 503, message: "Leaderboard sync unavailable; please retry" });
    }

    return JSON.stringify({
        success: true,
        scores: {
            cultivation_realm: result.level,
            campaign_stage: result.highestStage,
            combat_power: result.combatPower
        },
        metadata: result.metadata,
        combat_power_detail: result.power
    });
};

const getLeaderboardRecords: nkruntime.RpcFunction = (ctx, logger, nk, payload) => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); } catch (_e) { }
    const boardId = String(req.board_id || "cultivation_realm");
    const limit = Math.min(50, Math.max(1, Number(req.limit || 20)));

    let topList: any;
    try {
        topList = nk.leaderboardRecordsList(combatPowerBoard(boardId), [], limit, "", 0);
    } catch (e: any) {
        logger.warn(`Failed to list leaderboard ${boardId}: ` + String(e.message || e));
        return JSON.stringify({ success: false, code: 500, message: "Cannot load leaderboard" });
    }

    const records: any[] = [];
    if (topList && Array.isArray(topList.records)) {
        for (const r of topList.records) {
            const meta = r.metadata || {};
            const displayName = (meta && meta.display_name) ? String(meta.display_name) : (r.username || "Đạo Hữu");
            records.push({
                rank: r.rank,
                user_id: r.ownerId,
                username: displayName,
                hero_id: meta.hero_id || meta.avatar_url || "hero_1",
                avatar_url: meta.avatar_url || meta.hero_id || "hero_1",
                vip: Number(meta.vip || 0),
                level: Number(meta.level || r.score),
                score: r.score,
                display_score: formatLeaderboardScore(boardId, r.score, meta)
            });
        }
    }

    let myRecord: any = null;
    if (ctx.userId) {
        try {
            // Check if current user is already present in loaded top records
            const topMatch = records.find(r => r.user_id === ctx.userId);
            if (topMatch && Number(topMatch.rank || 0) > 0) {
                myRecord = { ...topMatch };
            } else {
                // If not in top list or rank is 0, query owner's haystack or records list
                let rawRec: any = null;
                try {
                    const haystack = (nk as any).leaderboardRecordsHaystack ? (nk as any).leaderboardRecordsHaystack(combatPowerBoard(boardId), ctx.userId, 1, 0) : null;
                    if (haystack && haystack.length > 0) {
                        rawRec = haystack.find((h: any) => h.ownerId === ctx.userId) || null;
                    }
                } catch (_hErr) { }

                if (!rawRec) {
                    const userList = nk.leaderboardRecordsList(combatPowerBoard(boardId), [ctx.userId], 1, "", 0);
                    rawRec = cpArray(userList.ownerRecords).concat(cpArray(userList.records)).find((r:any)=>r.ownerId===ctx.userId) || null;
                }

                if (rawRec) {
                    const meta = rawRec.metadata || {};
                    const myDisplayName = (meta && meta.display_name) ? String(meta.display_name) : (rawRec.username || "Đạo Hữu");
                    let computedRank = Number(rawRec.rank || 0);
                    if (computedRank <= 0) {
                        const nameMatch = records.find(r => r.user_id === ctx.userId);
                        if (nameMatch && Number(nameMatch.rank || 0) > 0) {
                            computedRank = nameMatch.rank;
                        }
                    }
                    myRecord = {
                        rank: computedRank,
                        user_id: rawRec.ownerId,
                        username: myDisplayName,
                        hero_id: meta.hero_id || meta.avatar_url || "hero_1",
                        avatar_url: meta.avatar_url || meta.hero_id || "hero_1",
                        vip: Number(meta.vip || 0),
                        level: Number(meta.level || rawRec.score),
                        score: rawRec.score,
                        display_score: formatLeaderboardScore(boardId, rawRec.score, meta)
                    };
                }
            }
        } catch (_err) { }
    }

    return JSON.stringify({
        success: true,
        board_id: boardId,
        power_version: combatPowerBoard(boardId)==="combat_power_v2" ? 2 : undefined,
        records: records,
        my_record: myRecord
    });
};

const gatedSyncPlayerLeaderboards: nkruntime.RpcFunction = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, syncPlayerLeaderboards);
const gatedGetLeaderboardRecords: nkruntime.RpcFunction = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getLeaderboardRecords);
const rpcSyncAllLeaderboards: nkruntime.RpcFunction = (_ctx, logger, nk, _payload) => {
    const count = syncAllStoredProfilesToLeaderboards(nk, logger);
    return count < 0 ? JSON.stringify({success:false,code:503,message:"Leaderboard backfill incomplete; inspect server config/logs"})
        : JSON.stringify({ success: true, synced:count, message: "All profiles synced to leaderboards" });
};
