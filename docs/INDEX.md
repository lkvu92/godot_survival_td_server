- [C196 v1.5 Skill 1 H4](contracts/C196_HERO4_SKILL_REBALANCE.md): phục hồi sát thương trực tiếp 40/55/70/85/100% ATK sau C238; giữ nguyên độc và hồi chiêu.
- [C238 Hero growth balance](contracts/C238_HERO_GROWTH_BALANCE.md) v1.0.0: [Lv1/50/70 simulation and exact curves](HERO_STATS_CURRENT.md), round-2 growth for all five heroes.
- [C237 Arc 7 Van Yeu Co Linh](contracts/C237_ARC7_VAN_YEU_CO_LINH.md) v1.4.0 ACTIVE: fixed Lv60 baseline, seven creeps, random elements, Bach Ho stage 5 and Chu Tuoc stage 10.
- [C234 Gift codes](contracts/C234_GIFT_CODES.md): server management, atomic mail redemption, welcome/opening/tester campaigns and Profile dialog. [Operations](GIFT_CODES.md) · [Validation](reports/C234_GIFT_CODES_VALIDATION.md).
- [C134 stamina storage cap](contracts/C134_RESULT_AD_SYSTEM_CONFIG.md) v1.0.2: storage 200, natural regeneration 30; daily-pack/current/legacy grants and regression expectations aligned.
- [C232 Verified account identity](contracts/C232_ACCOUNT_IDENTITY.md): Gmail SMTP confirmation links, verified email registration and account deletion; v1.1.0 jade/gold production mail templates. [Validation and SMTP status](reports/C232_ACCOUNT_IDENTITY_VALIDATION.md).
- [Arc 6 Ngũ Tố Quy Khư plan](ARC6_NGU_TO_QUY_KHU_PLAN.md) and [C221](contracts/C221_ARC6_NGU_TO_QUY_KHU.md) v1.1.1: mixed-element campaign, per-stage Lv51–60 shared creep-stat curves, and Arc 2 ice variants rendered at their source size.
- [C220 Tactical support cards](contracts/C220_TACTICAL_SUPPORT_CARDS.md): three-tier support, status accuracy and healing reduction.
- [C176 local readiness](reports/C176_LOCAL_READINESS.md): local config v4 and native Nakama/PostgreSQL smoke PASS.

- [Skill hero — thông số hiện hành 2026-10-24](HERO_SKILLS_CURRENT.md): đủ 5 hero, 20 skill; bảng level, cơ chế/asset và phần % HP Hero 5 đã chốt đủ 5 cấp.
- [C198 Current hero documentation](contracts/C198_HERO_SKILL_DOCS_CURRENT.md) v1.0.1: đối chiếu source và thay đường dẫn ưu tiên khỏi snapshot cũ.
- [Feature unlock operations](FEATURE_UNLOCKS.md): published settings, migration, system mail and tour ACK.
- [C176 Feature unlocks](contracts/C176_FEATURE_UNLOCKS.md): published level gates, atomic mail and generic tours.
# Server documentation

- [C181 Trial Tower 30 floors](contracts/C181_TRIAL_TOWER_30_FLOORS.md): three ten-floor fragment bands, 3.60× final scaling and server-authoritative 1–30 challenge/sweep.
- [C182 Reward boost-card shop](contracts/C182_REWARD_BOOST_CARD_SHOP.md): 1-hour 10%/25% EXP and Gold cards, Gem-to-Gold ratio 1:500, direct-shop whitelist and event-pack-only high cards.

- [C180 Hero 1 Ice Domain layers](contracts/C180_HERO_1_ICE_DOMAIN_LAYERS.md): slot 3 support field, level-scaled duration/cooldown/radius/debuffs and owner-specific replacement (C189).

- [C177 Tower test entries](contracts/C177_TOWER_TEST_ENTRIES.md): protected admin grant capacity, standard daily recovery unchanged.
- [C179 Campaign tank HP](contracts/C179_CAMPAIGN_TANK_HP.md): tank base HP is 1.5x its arc grunt, including a 1.75x effective cap after spawn buffs.

- C171 v1.0.1: Sa Thạch Toái Kích flight speed 420 → 630 for both earth bosses.

- C158 v1.1.2: Eight skulls at distinct positions; sequential launches at 0.15s intervals.

- C158 v1.1.1: U Hồn Phệ Cốt uses eight skulls, 35% direct ATK and flight speed 540.

- [C162 Hero skill damage curves](contracts/C162_HERO_SKILL_DAMAGE_CURVES.md) v1.0.2: historical flattening recipe with explicit current overrides; use the five current hero pages.

- [C159 Inventory stack consolidation](contracts/C159_INVENTORY_STACK_CONSOLIDATION.md) v1.0.0: stack fungible items, consolidate scoped inventory and preserve instance equipment.

- [C158 Arc 3 wood creep skills](contracts/C158_CREEP_WOOD_SKILLS.md) v1.0.0: poison bolts, life-draining vines, poison swamp and homing skulls use server-authoritative skill data.

- [C157 Arc 2 ice creep skills](contracts/C157_CREEP_ICE_SKILLS.md) v1.0.0: ice claws, bolts, pillars, Cực Băng Tam Trọng Thiên and Băng Linh Lung use server-authoritative skill data.

- [C156 Campaign mode stat multipliers](contracts/C156_CAMPAIGN_MODE_STAT_MULTIPLIERS.md) v1.1.0: Normal/Epic/Legend apply `1.00× / 1.25× / 1.50×` to every enemy HP, ATK, and DEF.

- [C155 Arc 3–5 boss stat reduction](contracts/C155_ARC_3_5_BOSS_REDUCTION.md) v1.0.0: campaign boss HP, ATK, and DEF are reduced by 30%; timing, rewards, and EXP are unchanged.

- [C154 Unified defense curve](contracts/C154_UNIFIED_DEFENSE_CURVE.md) v1.0.0: live damage, tribulation, and combat power use `100 / (100 + DEF)`; talisman DEF is synchronized.

- [C143 Multi-server](contracts/C143_MULTI_SERVER.md): v1.5.3 IN_PROGRESS — realm naming catalog and authoritative selection names; scoped item-request dedupe included; operator-authorized VPS S1 cutover recorded in [migration runbook](S1_MIGRATION_RUNBOOK.md).

- [Kế hoạch triển khai nhiều server logic](MULTI_SERVER_IMPLEMENTATION_PLAN.md): DRAFT — định danh account/server, tích hợp backend/client, migration S1; mục 15 đặc tả API create/disable/reset/delete/cleanup, generation, dry-run và integration test.

- [C142 Admin skill test](contracts/C142_ADMIN_SKILL_TEST.md): read-only admin access RPC and no-reward Arc 0 test stage.

- [C121 Online-only configuration](contracts/C121_ONLINE_ONLY_CONFIG.md) v1.0.2: profile loading never grants Thanh Phong Kiếm to new or empty inventories.

- [C141 Hero skill 1 range](contracts/C141_HERO_SKILL1_RANGE.md) v1.1.0: every hero skill 1 is constrained to 60--70% of the design viewport height and at least 15% above basic attack range.

- [C138 Local deployment](contracts/C138_LOCAL_DEPLOYMENT.md) v1.0.0: isolated local Compose stack and `deploylocal.ps1`.

- [System Settings — quảng cáo nhận thưởng](SYSTEM_SETTINGS.md): trường cấu hình, mặc định, quota, ví dụ chỉnh và publish.

- [C134 Result ads and System config](contracts/C134_RESULT_AD_SYSTEM_CONFIG.md): v1.0.1, stamina ads +15 (three/day), victory x2 rewards (five/day) and centralized ad amounts/limits.

- [C109 Store catalog](contracts/C109_STORE_CATALOG_PURCHASE_ORDER.md) v1.1.2: Production verifier package and read-only Google credentials; resource rewards and 30 daily claim windows unchanged.

- [C133 Run lifecycle](contracts/C133_RUN_LIFECYCLE.md): explicit abandon and login recovery; refresh never ends combat.

- [C105 Progression](contracts/C105_PROGRESSION.md) v1.2.1: Diễn Võ Trường grants no permanent EXP; ordinary stages retain User EXP thresholds x5 and first-clear EXP x2.

- [C131 Single login](contracts/C131_SINGLE_LOGIN.md) v1.1.0: signed login generations and realtime login-change push without polling.

- [C131 Single login](contracts/C131_SINGLE_LOGIN.md) v1.1.0: signed login generations and realtime login-change push without polling.

- [C132 Docker runtime build](contracts/C132_DOCKER_RUNTIME_BUILD.md) v1.0.0: build and verify Nakama runtime in Docker before deploy/start/restart.

- C129 v1.2.0: store_purchase atomically settles 1â€“99 catalog bundles and binds replay to quantity; C130 v1.3.0: authoritative 24-hour EXP/Gold gameplay reward boosts with replacement confirmation.

- [C130 Consumable use](contracts/C130_CONSUMABLE_USE.md) v1.3.0 — transactional use, permanent cultivation sources, reward boosts and left vertical item rail. [Item guide](items/CONSUMABLES.md).

- [C129 Consumable store](contracts/C129_CONSUMABLE_STORE.md): item rarity/prices, Gold/Gem alternatives, item-paid renames and talent reroll.

- [C124 Public proxy network](contracts/C124_PUBLIC_PROXY_NETWORK.md) v1.0.0: shared Nginx network and stable game service aliases.

- [C119 Config and seed integrity](contracts/C119_CONFIG_SEED_INTEGRITY.md) — v1.1.0.
- [Repository split](../REPOSITORY_SPLIT.md).
- [Seed, remote settings and publication commands](SEEDING.md).

- [C121 Online-only gameplay config](contracts/C121_ONLINE_ONLY_CONFIG.md) - version 1.0.1; supersedes offline fallback.
- [C121 Online-only gameplay config](contracts/C121_ONLINE_ONLY_CONFIG.md) - version 1.0.0; supersedes offline fallback.

- [C123 Runtime secret binding](contracts/C123_RUNTIME_SECRET_BINDING.md) v1.0.0: use existing .env keys without logging or committing values.

- [C123 Account password setup](contracts/C123_ACCOUNT_PASSWORD.md) v1.1.0 IN_PROGRESS - Google proof, same account email login and Login-style UI.

- [C125 Player names](contracts/C125_PLAYER_NAMES.md) v1.0.0 - persistent Google game names and one-time rename.

- [C135 Weekly leaderboard rewards](contracts/C135_WEEKLY_LEADERBOARD_REWARDS.md): weekly snapshots, 3 categories, top500 rewards and System configuration.

- [Weekly rewards operations and Settings](WEEKLY_LEADERBOARD_REWARDS.md): approved reward table, configuration, publication and scheduler installation.

- C135 v1.0.1: production users.display_name ambiguity regression and retryable weekly dialog errors.

- [C137 Layered talisman skills](contracts/C137_LAYERED_TALISMAN_SKILLS.md): skills 16, 26-30, phase damage, statuses and four-layer assets.

- [C144 Stage sweep](contracts/C144_STAGE_SWEEP.md): v1.0.1 ACTIVE; campaign grades, atomic combat exclusion, durable sweep and Home widget.

- [Stage sweep operations](STAGE_SWEEP.md): worker deployment, recovery, queue diagnostics and HP authority.

- C144 v1.0.2: daily ticket rewards 5/15, Huyen Thien Cac 20 gems per ticket; dedicated Tickets filter. Build, daily entitlement/store replay/CAS and static checks PASS.

- C144 v1.0.3: shared cards shop category and live ticket offer correction.

- [Campaign sweep operations](STAGE_SWEEP.md): worker, catalog deployment, configuration and diagnostics. [Player guide](../../client/docs/STAGE_SWEEP.md).

- [C147 Mailbox](contracts/C147_MAILBOX.md) v1.2.0 ? atomic claims, expiry, campaigns, shared WebSocket, immediate VIP rights and mail-claimed pack rewards (ACTIVE).

- [Mailbox operations](MAILBOX_OPERATIONS.md): rollout, worker, settings, admin delivery, campaigns and validation.

- C144 v1.0.4: server-derived completion loot preview includes ticket outcomes and actual fragment probabilities.

- C144 v1.4.0: double-click sweep minimap to confirm instant completion, 5 gems per unfinished timed round, atomic server settlement.

- C144 v1.4.1: request-scoped completion-loot query reuse fixes configuration sync timeouts.

- [C148 Creep fire skills](contracts/C148_CREEP_FIRE_SKILLS.md): authoritative attack_skill JSONB migration, enemy seed roundtrip and config normalization.

- C148 v1.1.0: Arc 1 fire skills in normal/epic/legend, current-server restore and thirty campaign combinations.

- C148 v1.1.1: crop legacy ranged fireball sheets and animate legacy-config pyromancer presentation.

- C148 v1.1.2: fireball size x2, claw size x0.5, lava brute stomp/rings grounded at feet.

- C110 v2.2.0: progressive server-configured Thi?n Ki?p boss defense, base100 and15% per additional wave.

- [C149: Campaign wave role unlocks](contracts/C149_CAMPAIGN_WAVE_ROLE_UNLOCKS.md): wave1?3 no rushers/tankers;4?6 no tankers; all existing per-wave counts preserved.

- [C150: Deploy seed/publish forwarding](contracts/C150_DEPLOY_SEED_PUBLISH.md): `publish` shortcut seeds and publishes without restarting; optional reviewed settings.

- [C151: Progressive spawn cadence](contracts/C151_PROGRESSIVE_SPAWN_CADENCE.md): slower early batches, unchanged creep counts and EXP.

- [C152: Halve opening waves](contracts/C152_HALVE_OPENING_WAVES.md): halve wave1?3 creep totals across all five arcs, per-creep EXP retained.

- [C153: Exact campaign wave EXP](contracts/C153_EXACT_CAMPAIGN_WAVE_EXP.md): maintain reduced counts while restoring one level per fully cleared wave.
- [C167 Tower sweep](contracts/C167_TOWER_SWEEP.md): campaign/tower mutual exclusion, dynamic EXP, entry reservations and boss ticket drops.
- [C160 Trial Tower Status](contracts/C160_TRIAL_TOWER_STATUS.md) v1.1.0: scoped progress, 20 floors, reward-display curve and server daily tickets.
- [C161 Trial Tower Challenge](contracts/C161_TRIAL_TOWER_CHALLENGE.md): authenticated tower runs and atomic progress settlement.
- C161 v1.1.0: validated 19-pick builds, independent priority AI, five-second pre-combat countdown.
- C161 v1.2.0: validated large-world arena geometry included in issued tower runs.
- C161 v1.3.0: both tower builds use only the selected owned hero's persistent skill unlocks.
- [C163 Additive combat bonuses](contracts/C163_ADDITIVE_COMBAT_BONUSES.md): server-owned sources, shared base-relative client combat modifiers.
- [C164 Tower mirror and manual controls](contracts/C164_TOWER_MIRROR_AND_MANUAL_CONTROLS.md): authoritative mirror attributes/root snapshots, run rules v2.
- [C165 Tower floor balance](contracts/C165_TOWER_FLOOR_BALANCE.md) v1.1.0: separate10% stats/5% speed steps, first-floor70%, rules v4.
- [C166 — Contract tổng thể Tháp Thí Luyện](contracts/C166_TRIAL_TOWER_FEATURE.md): nguồn chuẩn liên client/server cho luật hiện hành và phần còn thiếu.

- [C168 Arc 4 Kim hệ](contracts/C168_CREEP_METAL_SKILLS.md)

- [C169 Arc 5 earth creep skills](contracts/C169_CREEP_EARTH_SKILLS.md)

- [C171 Arc 5 boss skills](contracts/C171_ARC5_BOSS_SKILLS.md)

- [C172 Primordial Wraith skills](contracts/C172_PRIMORDIAL_WRAITH_SKILLS.md)

- [C173 Currency pricing](contracts/C173_CURRENCY_PRICING.md)

- [C158 wood skills v1.1.0](contracts/C158_CREEP_WOOD_SKILLS.md): compact target-centered thorn ellipse and authoritative presentation dimensions.

- [C178 — Pháp Tắc](contracts/C178_THAN_LUAN.md): shared survival progression, five-tier aura, shared combat HUD and dedicated Pháp Tắc Phù; legacy internal key remains `than_luan`.
- [C183 Hero 3 falling seal](contracts/C183_HERO_3_FALLING_SEAL.md) v1.0.2: same three-wave mechanics, current skill2 cooldown8/7.5/7/6.5/6s under C195.
- C183 v1.0.1: halve Hero 3 Skill 2 sword-burst duration at all five levels.
- [C184 Hero 4 Venom Vortex](contracts/C184_HERO_4_VENOM_VORTEX.md) v1.0.1: C196 vortex2.5s/five ticks,20% stun and additive ATK poison capped5000 DPS.

- [C185 Hero 1 skill unlocks](contracts/C185_HERO_1_SKILL_UNLOCKS.md) v1.0.1: historical gate change; superseded by C189: persistent levels 1/10/20/30, combat levels 1/5/10/15.

- C158 v1.1.3: both boss swamps start at 3s/range 500; Hydra souls start at 3s/range 600 with 15% explosions; Hydra regeneration 0.5% max HP/s.

- [C186 Hero EXP cap and test](contracts/C186_HERO_EXP_CAP_TEST.md) v1.0.0: cap stored EXP; restricted two-account hero level test.

- [C187 Hero 2 skill 1 spread](contracts/C187_HERO_2_SKILL1_SPREAD.md) v1.0.0: adjacent rays 10 degrees; full three-ray cone 20 degrees.

- [C188 Hero 2 Phoenix](contracts/C188_HERO_2_PHOENIX_RANGE.md): radius 100/115/130/145/160; cast range 700, travel 1024.

- [C189 Hero 1 skill order](contracts/C189_HERO_1_SKILL_ORDER.md): domain slot 3 at hero 20/combat 10; mastery slot 4 at hero 30/combat 15. Supersedes C185 skill 3/4 levels.

- [C192 Arc difficulty unlocks](contracts/C192_ARC_DIFFICULTY_UNLOCKS.md): clear all Normal in an arc for Epic; all Epic for Legend.

- [C193 Feature milestones/tours](contracts/C193_FEATURE_MILESTONES_TOURS.md): revised levels, matching tours and local/VPS seed/publication repair (1.0.2).

C193 1.0.3: sweep tour stage focus takes precedence over latest-unlocked scroll.



C180 v1.0.1: support-only ice domain level curves and owner-specific recast cleanup.

C189 v1.0.1: Hero 1 projectile mastery rebalance, probabilistic freeze and lotus damage.

- [C194 Arc 5 creep roster](contracts/C194_ARC5_CREEP_ROSTER.md): four authored creeps, Amber replaces campaign wraith.

- [C195 Hero 3 skill rebalance](contracts/C195_HERO3_SKILL_REBALANCE.md): fixed-speed fan, new cooldown/damage curves and formation movement.

- [C196 Hero 4 rebalance](contracts/C196_HERO4_SKILL_REBALANCE.md): skill curves, capped traps and additive-ATK poison vortex.

- [C197 Hero 5 rebalance](contracts/C197_HERO5_SKILL_REBALANCE.md): finger explosion, delayed runes, palm/crack/propagating waves.

C197 v1.1.0: fixed golden phantom, 0.5s protection, actual-hit repeat damage and consecutive target marks.

- C197 v1.1.1 ACTIVE: Hero5 rune HP per pulse is 0.2/0.3/0.6/0.8/1 percent; all five levels confirmed.

- [C199 Hero5 asset grid](contracts/C199_HERO5_ASSET_GRID.md): canonical impact artwork, 3x3/400px frames and scoped normalization cache.

- [C200 Hero4 asset grid](contracts/C200_HERO4_ASSET_GRID.md): v1.1.0: six animation sheets at3x3/400px including the updated needle; UI icons stay whole-image.

- [C201 Hero5 finger display size](contracts/C201_HERO5_FINGER_DISPLAY_SIZE.md): compensate tiny legacy scale after400px frame normalization.

- [C202 Hero5 palm/mark size](contracts/C202_HERO5_PALM_MARK_SIZE.md): stage1 palm2x; initial target mark0.7x, all levels.

- [C203 Hero5 Skill3 double size/range](contracts/C203_HERO5_PALM_DOUBLE.md).

- C142 v1.0.2: Test 2 account allowlist includes lkvu921@gmail.com.

- C199 v1.1.0: Skill4 punches use skill4_effect1, play once and hold last frame.

- C203 v1.1.0: Skill3 visual scales reduced20%; combat ranges retained.

- C195 v1.1.0: Hero3 Skill1+30% speed; ordinary Skill3 swords-30%.

- C196 v1.1.0: Hero4 Skill3 artwork40% smaller.

- [C204 Law battle entry](contracts/C204_LAW_BATTLE_ENTRY.md): preserve run aura; remove CharacterSelect aura.

- C204 v1.1.0: tower, admin-test loadout and breakthrough Law coverage.

- C204 v1.2.0: visible world aura above map; remove Law HUD text.

- C204 v1.3.0: no Law effects on Home/Profile/Tower/hero-select avatars.
- [C218 Campaign wave pressure](contracts/C218_CAMPAIGN_WAVE_PRESSURE.md) v2.4.0 IN_PROGRESS: Arc 2 targets Normal Lv10–19 with runtime-corrected stage factors 0.45–0.85; benchmark v4 recommendations must be regenerated. [Kế hoạch triển khai](C218_CAMPAIGN_PRESSURE_IMPLEMENTATION_PLAN.md).

- [C130 v1.4.0](contracts/C130_CONSUMABLE_USE.md): Đột phá dùng vật phẩm chiến đấu và một Hồi Sinh Phù mỗi lượt; server kiểm tra encounter, cooldown, thời hạn và giao dịch chống trừ lặp.

- [C130 v1.5.0](contracts/C130_CONSUMABLE_USE.md): dialog bổ sung thể lực ưu tiên dùng nhanh Thể Lực Đan trong kho, mặc định tối đa 2 viên, chọn số lượng và xem trước thể lực nhận.

- C110 v2.2.1: shared EXP settlement initializes milestone breakthrough previews immediately, including sweep rewards.

- [C222 Boss skill ranges](contracts/C222_BOSS_SKILL_RANGE.md): skill 1 range 700, skill 2 range 550.

- C144 v1.4.4: result summaries preserve campaign/tower sweep ticket rewards separately from ad-multiplied loot.

- C196 v1.2.0: Hero4 Skill2 piercing and linear distance damage 100%?30%.

- [C223 VIP card Auto/Manual](contracts/C223_AUTO_CARD_PICK.md): VIP4 local preference and offered-card priority.

- C157 v1.0.1: ghost_medium (Arc2 final boss) receives both Water boss skills.

- C223 v1.1.0: horizontal utility actions, clean skill levels and centered cooldown labels.

- [C224 VIP benefits and milestone mail](contracts/C224_VIP_BENEFITS_MILESTONES.md): +10% per VIP, one-time gifts1–9 and Home preview.

- C224 v1.1.1: Home VIP handles paired mouse/touch release without closing its new dialog.

- C223 v1.1.1: gameplay actions use one aligned vertical column with equal spacing.
- C223 v1.1.2: card selection follows Settings without showing a redundant Auto/Manual control.

- [C225 Level 70](contracts/C225_LEVEL_70.md): persistent caps 70, Độ Kiếp 51–60 / Bán Tiên 61–70 and seven-tier frames.

- C196 v1.3.0: halve Skill1 poison, Skill2 art +30%, Skill4 combat unlock15 and ground vortex below hero.

- [C227 Ordered wave spawning](contracts/C227_ORDERED_WAVE_SPAWNING.md) v1.0.0 IN_PROGRESS: four-wave batches and overlapping tanker/ranger/fast/boss queues.


- [C015 v1.16.0 — Cân bằng Hạ phẩm ID 2–15](contracts/C015_TALISMAN_EQUIPMENT_SYSTEM.md): baseline mới, tích hợp và nghiệm thu lần lượt bốn nhóm; IN_PROGRESS.
- [C130 Consumable effects](contracts/C130_CONSUMABLE_USE.md) v1.6.0: 5s healing cooldown and shared hero buff icons with actual remaining lifetime.

- C015 v1.16.1: xác nhận 15 asset pháp bảo 1200×1200, 9 frame 400×400; atlas và region đã đồng bộ.

- C015 v1.16.2: Hấp Huyết Thứ Hạ phẩm dùng dây gai 400px/frame, hit/heal một lần ở 0.21s.

- Trung phẩm ID 16–25: [kế hoạch/data đề xuất 31 tầng theo asset thực tế](plans/MID_TIER_TALISMAN_SKILLS.proposed.json); giữ hệ catalog, DRAFT_NOT_SEEDED.
- [C218 runtime recommendations](contracts/C218_CAMPAIGN_WAVE_PRESSURE.md) v2.4.1: explicit Arc 6 calibration; default catalog write remains Arc 1–5 with fingerprint checks.

- [C230 — Trung phẩm 31 tầng và effect gameplay](contracts/C230_MID_TIER_TALISMAN_SKILLS.md), v1.0.0 IN_PROGRESS.
- [C218 historical recommendation DB update](contracts/C218_CAMPAIGN_WAVE_PRESSURE.md) v2.4.2: selective local Arc 1–5 power update with backups and unchanged active settings.
- [C196 Hero4 damage redistribution](contracts/C196_HERO4_SKILL_REBALANCE.md) v1.4.0: halve Skill1 direct hit; move half Skill2/3 direct damage into poison while preserving isolated raw budgets and Skill2 range falloff.

- C232 v1.2.1: validate email links before showing credentials; report registered email conflicts.

- C232 v1.2.2: login account-deletion/support buttons share the login action asset.

- C232 v1.2.3: VPS identity deploy command and explicit disabled-service diagnostics.

C164 v1.1.0: Tower elemental combat training cycle (water/fire/earth/wood/metal).

C015 v1.18.0: talisman and element enhancement gold x1000.
