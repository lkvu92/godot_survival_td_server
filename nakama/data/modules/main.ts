// Survival TD — Nakama Server Modules
// Phase 2: Config Tables + Seed + Config RPC
// Build: npx esbuild data/modules/main.ts --bundle --platform=node --target=es5 --outfile=data/build/index.js

function linkedRpc_rename_player(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("rename_player", renamePlayer)(ctx, logger, nk, payload);
}
function linkedRpc_admin_test_access(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("admin_test_access", adminTestAccess)(ctx, logger, nk, payload);
}
function linkedRpc_account_password_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("account_password_status", accountPasswordStatus)(ctx, logger, nk, payload);
}
function linkedRpc_setup_account_password(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("setup_account_password", setupAccountPassword)(ctx, logger, nk, payload);
}
function linkedRpc_google_link_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("google_link_status", googleLinkStatus)(ctx, logger, nk, payload);
}
function linkedRpc_prepare_google_link(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("prepare_google_link", prepareGoogleLink)(ctx, logger, nk, payload);
}
function linkedRpc_confirm_google_link(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("confirm_google_link", confirmGoogleLink)(ctx, logger, nk, payload);
}
function linkedRpc_seed_game_data(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("seed_game_data", seedGameData)(ctx, logger, nk, payload);
}
function linkedRpc_get_game_config(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_game_config", gatedGetGameConfig)(ctx, logger, nk, payload);
}
function linkedRpc_get_config_bootstrap(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_config_bootstrap", getConfigBootstrap)(ctx, logger, nk, payload);
}
function linkedRpc_publish_config_release(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("publish_config_release", gatedPublishConfigRelease)(ctx, logger, nk, payload);
}
function linkedRpc_save_player_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("save_player_profile", gatedSavePlayerProfile)(ctx, logger, nk, payload);
}
function linkedRpc_load_player_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("load_player_profile", gatedLoadPlayerProfile)(ctx, logger, nk, payload);
}
function linkedRpc_abandon_run(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("abandon_run", gatedAbandonRun)(ctx, logger, nk, payload);
}
function linkedRpc_set_player_avatar(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("set_player_avatar", setPlayerAvatar)(ctx, logger, nk, payload);
}
function linkedRpc_get_player_avatars(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_player_avatars", getPlayerAvatars)(ctx, logger, nk, payload);
}
function linkedRpc_save_compliance_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("save_compliance_profile", gatedSaveComplianceProfile)(ctx, logger, nk, payload);
}
function linkedRpc_get_compliance_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_compliance_profile", gatedGetComplianceProfile)(ctx, logger, nk, payload);
}
function linkedRpc_update_inventory(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("update_inventory", gatedUpdateInventory)(ctx, logger, nk, payload);
}
function linkedRpc_talisman_action(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("talisman_action", gatedTalismanAction)(ctx, logger, nk, payload);
}
function linkedRpc_store_purchase(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("store_purchase", gatedStorePurchase)(ctx, logger, nk, payload);
}
function linkedRpc_use_consumable(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("use_consumable", gatedUseConsumable)(ctx, logger, nk, payload);
}
function linkedRpc_talisman_cast(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("talisman_cast", gatedTalismanCast)(ctx, logger, nk, payload);
}
function linkedRpc_spend_resource(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("spend_resource", gatedSpendResource)(ctx, logger, nk, payload);
}
function linkedRpc_purchase_stamina(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("purchase_stamina", gatedPurchaseStamina)(ctx, logger, nk, payload);
}
function linkedRpc_purchase_hero(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("purchase_hero", gatedPurchaseHero)(ctx, logger, nk, payload);
}
function linkedRpc_daily_checkin_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("daily_checkin_status", gatedDailyCheckinStatus)(ctx, logger, nk, payload);
}
function linkedRpc_daily_checkin_claim(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("daily_checkin_claim", gatedDailyCheckinClaim)(ctx, logger, nk, payload);
}
function linkedRpc_event_list(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("event_list", gatedEventList)(ctx, logger, nk, payload);
}
function linkedRpc_event_claim(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("event_claim", gatedEventClaim)(ctx, logger, nk, payload);
}
function linkedRpc_start_stage(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("start_stage", gatedStartStage)(ctx, logger, nk, payload);
}
function linkedRpc_upgrade_element(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("upgrade_element", gatedUpgradeElement)(ctx, logger, nk, payload);
}
function linkedRpc_award_stage_progression(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("award_stage_progression", (c,l,n,p)=>gatedAwardStageProgression(c,l,mailCombatRuntime(n,c.userId),p))(ctx, logger, nk, payload);
}
function linkedRpc_tribulation_action(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("tribulation_action", (c,l,n,p)=>gatedTribulationAction(c,l,mailCombatRuntime(n,c.userId),p))(ctx, logger, nk, payload);
}
function linkedRpc_get_trial_tower_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_trial_tower_status", (c,l,n,p) => invokeWithVersionGate(c,l,n,p,trialTowerStatus))(ctx,logger,nk,payload);
}
function linkedRpc_start_trial_tower(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('start_trial_tower',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,startTrialTower))(c,l,n,p);
}
function linkedRpc_finish_trial_tower(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('finish_trial_tower',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,finishTrialTower))(c,l,n,p);
}
function linkedRpc_prepare_trial_tower(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('prepare_trial_tower',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,prepareTrialTower))(c,l,n,p);
}
function linkedRpc_get_monetization_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_monetization_status", gatedGetMonetizationStatus)(ctx, logger, nk, payload);
}
function linkedRpc_get_daily_pack_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_daily_pack_status", gatedGetDailyPackStatus)(ctx, logger, nk, payload);
}
function linkedRpc_claim_daily_pack(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("claim_daily_pack", gatedClaimDailyPack)(ctx, logger, nk, payload);
}
function linkedRpc_create_purchase_order(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("create_purchase_order", gatedCreatePurchaseOrder)(ctx, logger, nk, payload);
}
function linkedRpc_sync_play_purchase(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("sync_play_purchase", gatedSyncPlayPurchase)(ctx, logger, nk, payload);
}
function linkedRpc_iap_google_claim(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("iap_google_claim", gatedIapGoogleClaim)(ctx, logger, nk, payload);
}
function linkedRpc_prepare_rewarded_ad(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("prepare_rewarded_ad", gatedPrepareRewardedAd)(ctx, logger, nk, payload);
}
function linkedRpc_confirm_rewarded_ad(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("confirm_rewarded_ad", gatedConfirmRewardedAd)(ctx, logger, nk, payload);
}
function linkedRpc_consume_ad_gameplay_reward(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("consume_ad_gameplay_reward", gatedConsumeAdGameplayReward)(ctx, logger, nk, payload);
}
function linkedRpc_admob_ssv_confirm(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("admob_ssv_confirm", admobSsvConfirm)(ctx, logger, nk, payload);
}
function linkedRpc_google_play_rtdn_confirm(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("google_play_rtdn_confirm", googlePlayRtdnConfirm)(ctx, logger, nk, payload);
}
function linkedRpc_weekly_leaderboard_tick(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return weeklyLeaderboardTickRpc(ctx,logger,nk,payload);
}
function linkedRpc_get_weekly_leaderboard_rewards(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_weekly_leaderboard_rewards", (c,l,n,p) => invokeWithVersionGate(c,l,n,p,getWeeklyLeaderboardRewards))(ctx,logger,nk,payload);
}
function linkedRpc_claim_weekly_leaderboard_reward(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("claim_weekly_leaderboard_reward", (c,l,n,p) => invokeWithVersionGate(c,l,n,p,(cc,ll,nn,pp)=>{
        const result=claimWeeklyLeaderboardReward(cc,ll,nn,pp);
        if(JSON.parse(result).success)mailSyncWeeklyClaim(nn,cc.userId,pp);
        return result;
    }))(ctx,logger,nk,payload);
}
function linkedRpc_sync_player_leaderboards(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("sync_player_leaderboards", gatedSyncPlayerLeaderboards)(ctx, logger, nk, payload);
}
function linkedRpc_get_leaderboard_records(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_leaderboard_records", gatedGetLeaderboardRecords)(ctx, logger, nk, payload);
}
function linkedRpc_sync_all_leaderboards(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("sync_all_leaderboards", rpcSyncAllLeaderboards)(ctx, logger, nk, payload);
}

function linkedRpc_session_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("session_status", sessionStatus)(ctx, logger, nk, payload);
}

function linkedRpc_list_servers(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('list_servers',listGameServers)(c,l,n,p);}
function linkedRpc_list_my_characters(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('list_my_characters',listMyCharacters)(c,l,n,p);}
function linkedRpc_enter_server(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('enter_server',enterGameServer)(c,l,n,p);}
function linkedRpc_create_character(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('create_character',createServerCharacter)(c,l,n,p);}
function linkedRpc_iap_claim(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('iap_claim',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,iapClaim))(c,l,n,p);}
function linkedRpc_resolve_purchase_order(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('resolve_purchase_order',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,resolvePurchaseOrder))(c,l,n,p);}

function InitModule(
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    initializer: nkruntime.Initializer
): void {
    // Phase 2: Create tables on startup
    createServerRegistryTables(nk);
    createMailboxTables(nk);
    initializer.registerRpc('mail_summary',linkedRpc_mail_summary);
    initializer.registerRpc('mail_list',linkedRpc_mail_list);
    initializer.registerRpc('mail_open',linkedRpc_mail_open);
    initializer.registerRpc('mail_claim',linkedRpc_mail_claim);
    initializer.registerRpc('mail_claim_all',linkedRpc_mail_claim_all);
    initializer.registerRpc('mail_delete',linkedRpc_mail_delete);
    initializer.registerRpc('mail_delete_read',linkedRpc_mail_delete_read);
    initializer.registerRpc('mail_admin_send',linkedRpc_mail_admin_send);
    initializer.registerRpc('mail_admin_campaign',linkedRpc_mail_admin_campaign);
    initializer.registerRpc('mail_tick',rpcMailTick);
    sweepCreateWorkerIndex(nk);
    initializer.registerRpc('get_sweep_options',linkedRpc_get_sweep_options);
    initializer.registerRpc('preview_sweep',linkedRpc_preview_sweep);
    initializer.registerRpc('start_sweep',linkedRpc_start_sweep);
    initializer.registerRpc('get_sweep_status',linkedRpc_get_sweep_status);
    initializer.registerRpc('cancel_sweep',linkedRpc_cancel_sweep);
    initializer.registerRpc('finish_sweep',linkedRpc_finish_sweep);
    initializer.registerRpc('sweep_tick',rpcSweepTick);
    initializer.registerRpc('admin_server_list',rpcAdminServerList);
    initializer.registerRpc('admin_server_inspect',rpcAdminServerInspect);
    initializer.registerRpc('admin_server_create',rpcAdminServerCreate);
    initializer.registerRpc('admin_server_disable',rpcAdminServerDisable);
    initializer.registerRpc('admin_server_enable',rpcAdminServerEnable);
    initializer.registerRpc('admin_server_update',rpcAdminServerUpdate);
    initializer.registerRpc('admin_server_expire_pending',rpcAdminServerExpirePending);
    initializer.registerRpc('admin_server_plan',rpcAdminServerPlan);
    initializer.registerRpc('admin_server_execute',rpcAdminServerExecute);
    initializer.registerRpc('admin_server_job',rpcAdminServerJob);
    initializer.registerRpc('admin_server_job_step',rpcAdminServerJobStep);
    initializer.registerRpc('admin_server_financial_list',rpcAdminServerFinancialList);
    initializer.registerRpc('admin_server_financial_retry',rpcAdminServerFinancialRetry);
    initializer.registerRpc("list_servers", linkedRpc_list_servers);
    initializer.registerRpc("list_my_characters", linkedRpc_list_my_characters);
    initializer.registerRpc("enter_server", linkedRpc_enter_server);
    initializer.registerRpc("create_character", linkedRpc_create_character);
    createGameConfigTables(nk, logger);
    sweepMigratePublishedConfig(nk,logger);
    createMonetizationTables(nk, logger);
    initializer.registerRpc("iap_claim", linkedRpc_iap_claim);
    initializer.registerRpc("resolve_purchase_order", linkedRpc_resolve_purchase_order);
    createAccountLinkTables(nk);
    createSingleLoginTable(nk);
    initializer.registerBeforeAuthenticateEmail(beforeSingleLoginEmail);
    initializer.registerAfterAuthenticateEmail(afterSingleLogin);
    initializer.registerBeforeAuthenticateGoogle(beforeSingleLogin);
    initializer.registerAfterAuthenticateGoogle(afterSingleLogin);
    initializer.registerBeforeAuthenticateDevice(beforeSingleLogin);
    initializer.registerAfterAuthenticateDevice(afterSingleLogin);
    initializer.registerBeforeAuthenticateCustom(beforeSingleLogin);
    initializer.registerAfterAuthenticateCustom(afterSingleLogin);
    initializer.registerRpc("session_status", linkedRpc_session_status);
    initializer.registerRpc("admin_test_access", linkedRpc_admin_test_access);
    initializer.registerRpc("rename_player", linkedRpc_rename_player);
    initializer.registerRpc("account_password_status", linkedRpc_account_password_status);
    initializer.registerRpc("setup_account_password", linkedRpc_setup_account_password);
    initializer.registerRpc("google_link_status", linkedRpc_google_link_status);
    initializer.registerRpc("prepare_google_link", linkedRpc_prepare_google_link);
    initializer.registerRpc("confirm_google_link", linkedRpc_confirm_google_link);
    vipRuntimeMode = monetizationMode(ctx);

    // Phase 2: Seed RPC (call once from console/curl)
    initializer.registerRpc("seed_game_data", linkedRpc_seed_game_data);

    // Phase 2: Config query RPC
    initializer.registerRpc("get_game_config", linkedRpc_get_game_config);
    initializer.registerRpc("get_config_bootstrap", linkedRpc_get_config_bootstrap);
    initializer.registerRpc("publish_config_release", linkedRpc_publish_config_release);
    initializer.registerRpc("operator_config_release", operatorConfigRelease);

    // Phase 4: Player RPCs
    initializer.registerRpc("save_player_profile", linkedRpc_save_player_profile);
    initializer.registerRpc("load_player_profile", linkedRpc_load_player_profile);
    initializer.registerRpc("abandon_run", linkedRpc_abandon_run);
    initializer.registerRpc("set_player_avatar", linkedRpc_set_player_avatar);
    initializer.registerRpc("get_player_avatars", linkedRpc_get_player_avatars);
    initializer.registerRpc("save_compliance_profile", linkedRpc_save_compliance_profile);
    initializer.registerRpc("get_compliance_profile", linkedRpc_get_compliance_profile);
    initializer.registerRpc("update_inventory", linkedRpc_update_inventory);
    initializer.registerRpc("talisman_action", linkedRpc_talisman_action);
    initializer.registerRpc("store_purchase", linkedRpc_store_purchase);
    logger.info("Store purchase protocol v2 loaded: store_purchase requires explicit gold/gems");
    initializer.registerRpc("use_consumable", linkedRpc_use_consumable);
    initializer.registerRpc("talisman_cast", linkedRpc_talisman_cast);
    initializer.registerRpc("spend_resource", linkedRpc_spend_resource);
    initializer.registerRpc("purchase_stamina", linkedRpc_purchase_stamina);
    initializer.registerRpc("purchase_hero", linkedRpc_purchase_hero);
    initializer.registerRpc("daily_checkin_status", linkedRpc_daily_checkin_status);
    initializer.registerRpc("daily_checkin_claim", linkedRpc_daily_checkin_claim);
    initializer.registerRpc("event_list", linkedRpc_event_list);
    initializer.registerRpc("event_claim", linkedRpc_event_claim);
    initializer.registerRpc("start_stage", linkedRpc_start_stage);
    initializer.registerRpc("upgrade_element", linkedRpc_upgrade_element);
    initializer.registerRpc("complete_feature_tour", linkedRpc_complete_feature_tour);
    initializer.registerRpc("award_stage_progression", linkedRpc_award_stage_progression);
    initializer.registerRpc("tribulation_action", linkedRpc_tribulation_action);
    initializer.registerRpc("get_trial_tower_status", linkedRpc_get_trial_tower_status);
    initializer.registerRpc("start_trial_tower", linkedRpc_start_trial_tower);
    initializer.registerRpc("prepare_trial_tower", linkedRpc_prepare_trial_tower);
    initializer.registerRpc("finish_trial_tower", linkedRpc_finish_trial_tower);
    initializer.registerRpc("get_monetization_status", linkedRpc_get_monetization_status);
    initializer.registerRpc("get_daily_pack_status", linkedRpc_get_daily_pack_status);
    initializer.registerRpc("claim_daily_pack", linkedRpc_claim_daily_pack);
    initializer.registerRpc("create_purchase_order", linkedRpc_create_purchase_order);
    initializer.registerRpc("sync_play_purchase", linkedRpc_sync_play_purchase);
    initializer.registerRpc("iap_google_claim", linkedRpc_iap_google_claim);
    initializer.registerRpc("prepare_rewarded_ad", linkedRpc_prepare_rewarded_ad);
    initializer.registerRpc("confirm_rewarded_ad", linkedRpc_confirm_rewarded_ad);
    initializer.registerRpc("consume_ad_gameplay_reward", linkedRpc_consume_ad_gameplay_reward);
    // These two callbacks are called by the verifier service, not game clients.
    initializer.registerRpc("admob_ssv_confirm", linkedRpc_admob_ssv_confirm);
    initializer.registerRpc("google_play_rtdn_confirm", linkedRpc_google_play_rtdn_confirm);

    // Phase 5: Leaderboards
    createWeeklyLeaderboardTables(nk);
    createServerWeeklyTables(nk);
    createMultiAccountLinkFunctions(nk);
    if(!ctx.env || ctx.env.MULTI_SERVER_ENABLED!=='true') {
        tickWeeklyLeaderboards(nk);
        createLeaderboards(nk, logger);
    }
    initializer.registerRpc("get_weekly_leaderboard_rewards", linkedRpc_get_weekly_leaderboard_rewards);
    initializer.registerRpc("claim_weekly_leaderboard_reward", linkedRpc_claim_weekly_leaderboard_reward);
    initializer.registerRpc("weekly_leaderboard_tick", linkedRpc_weekly_leaderboard_tick);
    initializer.registerRpc("sync_player_leaderboards", linkedRpc_sync_player_leaderboards);
    initializer.registerRpc("get_leaderboard_records", linkedRpc_get_leaderboard_records);
    initializer.registerRpc("sync_all_leaderboards", linkedRpc_sync_all_leaderboards);

    logger.info("Survival TD — Server modules initialized.");
}

function linkedRpc_get_sweep_options(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("get_sweep_options",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,getSweepOptions))(c,l,n,p);}

function linkedRpc_preview_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("preview_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,previewSweep))(c,l,n,p);}

function linkedRpc_start_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("start_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,startSweep))(c,l,n,p);}

function linkedRpc_get_sweep_status(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("get_sweep_status",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,getSweepStatus))(c,l,n,p);}

function linkedRpc_cancel_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("cancel_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,cancelSweep))(c,l,n,p);}

function linkedRpc_mail_summary(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_summary",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("summary")))(c,l,n,p);}

function linkedRpc_mail_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_list",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("list")))(c,l,n,p);}

function linkedRpc_mail_open(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_open",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("open")))(c,l,n,p);}

function linkedRpc_mail_claim(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_claim",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("claim")))(c,l,n,p);}

function linkedRpc_mail_claim_all(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_claim_all",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("claim_all")))(c,l,n,p);}

function linkedRpc_mail_delete(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_delete",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("delete")))(c,l,n,p);}

function linkedRpc_mail_delete_read(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_delete_read",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("delete_read")))(c,l,n,p);}

function linkedRpc_mail_admin_send(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("mail_admin_send",rpcMailAdminSend)(c,l,n,p);}

function linkedRpc_mail_admin_campaign(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("mail_admin_campaign",rpcMailAdminCampaign)(c,l,n,p);}

function linkedRpc_finish_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("finish_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,mailCombatRuntime(nn,cc.userId),pp,finishSweep))(c,l,n,p);}

function linkedRpc_complete_feature_tour(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("complete_feature_tour",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,completeFeatureTour))(c,l,n,p);}
