// Persistent progression is server-owned. In-run XP remains entirely client/runtime state.

function trialTowerStatus(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
    const fail = (code: number, message: string) => JSON.stringify({success:false,code,message});
    if (!ctx.userId) return fail(401, "Authentication required");
    const config = readContentConfig(nk, "trial_tower");
    if (config.floor_count !== 30 || config.daily_tickets !== 5 || config.ticket_cap !== 20
        || config.base_stat_multiplier !== 0.7 || config.stat_increase_per_floor !== 0.1 || config.speed_increase_per_floor !== 0.05 || !Array.isArray(config.floors) || config.floors.length !== 30)
        return fail(503, "Tháp chưa được cấu hình.");
    const validRewards = (rewards: any) => Array.isArray(rewards) && rewards.every((r: any) =>
        r && typeof r.label === "string" && r.label.trim().length > 0);
    for (let i = 0; i < config.floors.length; i++) {
        const f = config.floors[i];
        if (!f || f.floor !== i + 1 || !validRewards(f.first_rewards) || !validRewards(f.repeat_rewards))
            return fail(503, "Cấu hình tầng không hợp lệ.");
    }
    const now = Date.now();
    const rewardProfileRow=nk.storageRead([{collection:'player_profiles',key:'main',userId:ctx.userId}])[0];
    const rewardProfile=rewardProfileRow?rewardProfileRow.value:{};
    const day = Math.floor((now + 7 * 3600000) / 86400000);
    const ref = {collection:"player_trial_tower",key:"main",userId:ctx.userId};
    for (let attempt = 0; attempt < 3; attempt++) {
        const rows = nk.storageRead([ref]);
        const previous = rows.length ? rows[0].value as any : null;
        const ticketCap = previous && previous.admin_test_ticket_cap === 100 ? 100 : 20;
        if (previous && (!Number.isInteger(previous.highest_cleared) || previous.highest_cleared < 0
            || previous.highest_cleared > 30 || !Number.isInteger(previous.tickets) || previous.tickets < 0
            || previous.tickets > ticketCap || !Number.isSafeInteger(previous.last_ticket_day) || previous.last_ticket_day < 0))
            return fail(503, "Tiến độ tháp không hợp lệ.");
        if (rows.length && !previous) return fail(503, "Tiến độ tháp không hợp lệ.");
        const state = previous ? Object.assign({}, previous) : {highest_cleared:0,tickets:5,last_ticket_day:day};
        if (previous && day > previous.last_ticket_day) {
            state.tickets = Math.max(previous.tickets, Math.min(20, previous.tickets + Math.min(4, day - previous.last_ticket_day) * 5));
            state.last_ticket_day = day;
        }
        if (!previous || state.last_ticket_day !== previous.last_ticket_day) {
            try {
                nk.storageWrite([Object.assign({},ref,{value:state,version:rows.length ? rows[0].version : "*",
                    permissionRead:0,permissionWrite:0})]);
            } catch (error) {
                if (attempt < 2) continue;
                logger.warn("Trial tower status write could not complete");
                return fail(409, "Tiến độ đang được cập nhật. Hãy thử lại.");
            }
        }
        return JSON.stringify({success:true,snapshot:{
            floors:config.floors.map((f:any)=>Object.assign({},f,{first_rewards:towerRewardEntries(nk,f.first_rewards,rewardProfile,f.floor),repeat_rewards:towerRewardEntries(nk,f.repeat_rewards,rewardProfile,f.floor),stat_multiplier:Math.round((config.base_stat_multiplier+(f.floor-1)*config.stat_increase_per_floor)*10000)/10000,
                speed_multiplier:Math.round((config.base_stat_multiplier+(f.floor-1)*config.speed_increase_per_floor)*10000)/10000})),
            highest_cleared:state.highest_cleared,tickets:state.tickets,daily_tickets:5,ticket_cap:ticketCap,
            server_time:Math.floor(now/1000),next_ticket_at:Math.floor(((Math.max(day,state.last_ticket_day)+1)*86400000-7*3600000)/1000)
        }});
    }
    return fail(409, "Hãy thử lại.");
}

function startTrialTower(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    const fail = (code:string,message:string,extra:any={})=>JSON.stringify(Object.assign({success:false,code,message},extra));
    if(!ctx.userId)return fail('AUTH_REQUIRED','Authentication required');
    let req:any;try{req=JSON.parse(payload||'{}');}catch(_e){return fail('INVALID_REQUEST','Invalid JSON');}
    if(!req||typeof req!=='object'||Array.isArray(req)||!Number.isInteger(req.floor)||req.floor<1||req.floor>30||typeof req.hero_id!=='string'
        ||typeof req.request_id!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(req.request_id))return fail('INVALID_REQUEST','Yêu cầu không hợp lệ.');
    const status=JSON.parse(trialTowerStatus(ctx,logger,nk,'{}'));
    if(!status.success)return JSON.stringify(status);
    if(req.floor>status.snapshot.highest_cleared+1)return fail('FLOOR_LOCKED','Chưa mở tầng này.');
    const config=readContentConfig(nk,'trial_tower'),rules=config.combat_rules,arena=config.arena;
    if(!arena||!Array.isArray(arena.world_size)||arena.world_size.length!==2
        ||arena.world_size.some((v:any)=>!Number.isFinite(v)||v>10000)
        ||arena.world_size[0]<720||arena.world_size[1]<1280||!Number.isFinite(arena.edge_margin)
        ||arena.edge_margin<=0||arena.edge_margin>=Math.min(...arena.world_size)/4
        ||!Number.isFinite(arena.spawn_gap)||arena.spawn_gap<=0||arena.spawn_gap>=arena.world_size[1]-2*arena.edge_margin)
        return fail('CONFIG_INVALID','Chưa cấu hình đấu trường tháp.');
    if(!rules||!Number.isFinite(rules.frenzy_after_sec)||rules.frenzy_after_sec<=0
        ||!(rules.frenzy_atk_per_sec>0)||!(rules.frenzy_resist_per_sec>0)
        ||!(rules.frenzy_resist_cap>=0&&rules.frenzy_resist_cap<100)||!(rules.frenzy_control_resist_per_sec>0))
        return fail('CONFIG_INVALID','Chưa cấu hình trận tháp.');
    const refs=[{collection:'player_profiles',key:'main',userId:ctx.userId},
        {collection:'player_heroes',key:'states',userId:ctx.userId},{collection:'player_stage_runs',key:'active',userId:ctx.userId},
        {collection:'player_inventory',key:'items',userId:ctx.userId},{collection:'player_trial_tower',key:'main',userId:ctx.userId}];
    const rows=nk.storageRead(refs),p=rows.find(r=>r.collection==='player_profiles'),h=rows.find(r=>r.collection==='player_heroes'),
        old=rows.find(r=>r.collection==='player_stage_runs'),inv=rows.find(r=>r.collection==='player_inventory');
    if(!p||!h)return fail('PROFILE_INCOMPLETE','Chưa tải đủ nhân vật.');
    const profile=cpObject(p.value),previous=old?cpObject(old.value):{};
    if(previous.request_id===req.request_id&&previous.stage_id==='stage_trial_tower') {
        if(previous.hero_id!==req.hero_id||previous.floor!==req.floor)return fail('REQUEST_CONFLICT','Yêu cầu đã dùng.');
        if(previous.status==='active'&&previous.expires_at_ms>Date.now())return JSON.stringify({success:true,run:previous});
        return fail('REQUEST_COMPLETED','Lượt thử này đã kết thúc.');
    }
    if(previous.status==='active'&&previous.expires_at_ms>Date.now())return fail(previous.stage_id==='stage_trial_tower'?'TOWER_RUN_ACTIVE':'COMBAT_ACTIVE',
        'Bạn đang có trận chưa kết thúc.',previous.stage_id==='stage_trial_tower'?{run_id:previous.run_id}:{});
    if((profile.breakthrough||{}).in_tribulation||sweepCombatError(profile))return fail('COMBAT_ACTIVE','Hãy kết thúc hoạt động hiện tại.');
    const towerRow=rows.find(r=>r.collection==='player_trial_tower');
    if(!towerRow||Number(towerRow.value.tickets||0)<1)return fail('NO_TOWER_ENTRIES','Không còn lượt vào tháp.');
    const catalog=readCombatPowerCatalog(nk),hero=catalog.heroes.find((v:any)=>v.id===req.hero_id),
        state=cpArray(h.value.heroes).find((v:any)=>v.hero_id===req.hero_id);
    if(!hero||!state||state.owned!==true)return fail('HERO_NOT_OWNED','Bạn chưa sở hữu nhân vật này.');
    const level=Math.max(1,Math.min(PROGRESSION_MAX_LEVEL,Number(state.level)||1));
    const storedAttributes=cpObject(state.current_attribute);
    const demonAttributes=Object.assign({},Object.keys(storedAttributes).length?storedAttributes:progressionHeroAttributes(nk,req.hero_id,level));
    const heroElementProfile={affinities:Object.assign({},cpObject(profile.element_affinities)),levels:Object.assign({},cpObject(profile.elements))};
    const zeroRoots:any={};
    for(const key of Object.keys(heroElementProfile.affinities).concat(Object.keys(heroElementProfile.levels)))zeroRoots[key]=0;
    const demonElementProfile={affinities:Object.assign({},heroElementProfile.affinities),levels:zeroRoots};
    const attrs=cpApplyEquipment(demonAttributes,cpEquipped(cpArray(inv&&inv.value.items),catalog.items),
        catalog.progression.combat_power,catalog.progression.element_combat);
    Object.assign(attrs,thanLuanStats(profile,thanLuanConfig(nk)));
    if(!(attrs.hp>0)||!(attrs.atk>0)||Object.keys(attrs).some(k=>!Number.isFinite(attrs[k])))return fail('CONFIG_INVALID','Chỉ số nhân vật không hợp lệ.');
    const prep=config.preparation;
    if(!prep||prep.combat_level!==20||prep.upgrade_count!==19||prep.countdown_sec!==5||!Array.isArray(prep.supports)||prep.supports.length<5||prep.supports.some((c:any)=>!towerSupportValid(c)))
        return fail('CONFIG_INVALID','Chưa cấu hình chuẩn bị tháp.');
    const skillRows=nk.sqlQuery('SELECT id,display_name,criteria_unlock,hero_level_unlock,levels FROM game_skills WHERE id IN (SELECT jsonb_array_elements_text(skill_pool) FROM game_heroes WHERE id=$1) ORDER BY id',[req.hero_id]);
    const draftCatalog:any[]=skillRows.filter((s:any)=>cpArray(s.levels).length>0&&Number(s.hero_level_unlock||1)<=level&&Number(cpObject(s.criteria_unlock).level||1)<=20).map((s:any)=>({
        id:s.id,skill_id:s.id,title:s.display_name,priority:0,max_level:cpArray(s.levels).length,
        required_skill:cpObject(s.criteria_unlock).required_skill||'',icon_id:s.id
    })).concat(prep.supports);
    const skills:any={};
    const starting=cpArray(hero.starting_skills).map((s:any)=>typeof s==='string'?s:s.skill_id||s.id).find((id:any)=>draftCatalog.some(c=>c.skill_id===id));
    if(starting)skills[starting]=1;
    if(!Object.keys(skills).length)return fail('CONFIG_INVALID','Chưa cấu hình kỹ năng.');
    const issued=talismanCreateStageRun(nk,ctx.userId,'stage_trial_tower','floor_'+req.floor);
    const run:any=Object.assign(issued.run,{request_id:req.request_id,floor:req.floor,hero_id:req.hero_id,skill_levels:skills,
        attributes:attrs,than_luan:Object.assign({},profile.than_luan),stat_multiplier:status.snapshot.floors[req.floor-1].stat_multiplier,speed_multiplier:status.snapshot.floors[req.floor-1].speed_multiplier,combat_rules:rules,
        demon_attributes:demonAttributes,hero_element_profile:heroElementProfile,demon_element_profile:demonElementProfile,
        phase:'preparing',combat_level:20,upgrade_count:19,countdown_sec:5,draft_catalog:draftCatalog,skill_unlock_version:5,arena});
    profile.activity={type:'combat',activity_id:run.run_id};
    try{nk.storageWrite([{...refs[0],value:profile,version:p.version,permissionRead:0,permissionWrite:0},
        {...refs[4],value:Object.assign({},towerRow.value,{tickets:towerRow.value.tickets-1}),version:towerRow.version,permissionRead:0,permissionWrite:0},
        {...refs[2],value:run,version:issued.version,permissionRead:0,permissionWrite:0}]);}
    catch(_e){return fail('CONFLICT','Có thao tác khác. Hãy thử lại.');}
    return JSON.stringify({success:true,run});
}

function towerSupportValid(c:any):boolean {
    if(!c||typeof c.id!=='string'||!c.id||!c.effect||!Number.isFinite(c.effect.value)||c.effect.value<=0||!Number.isFinite(c.priority))return false;
    const e=c.effect;
    if(e.type==='tactical_stat') {
        const stats:any={deep_wound:'deep_wound_reduction',effect_accuracy:'effect_accuracy',effect_resistance:'harmful_effect_resistance',control_tenacity:'control_duration_reduction',healing_power:'healing_received_bonus'};
        if(!stats[c.support_family]||stats[c.support_family]!==e.stat||!['common','rare','legendary'].includes(c.tier)||e.value>1)return false;
        return c.support_family!=='deep_wound'||(Number.isFinite(e.duration)&&e.duration>0&&Number.isFinite(e.chance)&&e.chance>0&&e.chance<=1);
    }
    return e.type==='cooldown_reduction'?e.value<=1:e.type==='stat_percent'&&['atk','def','hp','attack_speed'].includes(e.stat);
}

function towerDraftLegal(c:any,levels:any):boolean {
    if(c.effect&&c.effect.type==='tactical_stat')return Number(c.effect.value)>Number(levels['support:'+c.effect.stat]||0);
    return !c.skill_id || ((levels[c.skill_id]||0)<c.max_level&&(!c.required_skill||levels[c.required_skill]>0));
}

function towerDraftApply(c:any,levels:any):void {
    if(c.skill_id)levels[c.skill_id]=(levels[c.skill_id]||0)+1;
    else if(c.effect&&c.effect.type==='tactical_stat')levels['support:'+c.effect.stat]=c.effect.value;
}

function prepareTrialTower(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    const fail=(code:string,message:string)=>JSON.stringify({success:false,code,message});
    if(!ctx.userId)return fail('AUTH_REQUIRED','Authentication required');
    let req:any;try{req=JSON.parse(payload||'{}');}catch(_e){return fail('INVALID_REQUEST','Invalid JSON');}
    if(!req||typeof req.run_id!=='string'||!Array.isArray(req.picks)||req.picks.length!==19||req.picks.some((p:any)=>typeof p!=='string'))
        return fail('INVALID_BUILD','Cần chọn đủ 19 nâng cấp.');
    const ref={collection:'player_stage_runs',key:'active',userId:ctx.userId},rows=nk.storageRead([ref]);
    const row=rows[0],run=row&&cpObject(row.value);
    if(!run||run.run_id!==req.run_id||run.stage_id!=='stage_trial_tower'||run.status!=='active')return fail('RUN_MISMATCH','Trận không hợp lệ.');
    if(Date.now()>run.expires_at_ms)return fail('RUN_EXPIRED','Trận đã hết hạn.');
    if(run.skill_unlock_version!==5)return fail('RUN_RULES_CHANGED','Luật kỹ năng đã thay đổi. Hãy về tháp để tạo trận mới.');
    if(run.phase==='countdown')return JSON.stringify(run.player_picks&&JSON.stringify(run.player_picks)===JSON.stringify(req.picks)?{success:true,run}:{success:false,code:'BUILD_LOCKED',message:'Build đã xác nhận.'});
    if(run.phase!=='preparing'||!Array.isArray(run.draft_catalog))return fail('RUN_MISMATCH','Hãy vào lại tháp.');
    const levels=Object.assign({},run.skill_levels);
    for(const id of req.picks){const c=run.draft_catalog.find((v:any)=>v.id===id);
        if(!c||!towerDraftLegal(c,levels))return fail('INVALID_BUILD','Nâng cấp không hợp lệ.');
        towerDraftApply(c,levels);
    }
    const aiLevels=Object.assign({},run.skill_levels),aiPicks:string[]=[];
    for(let i=0;i<19;i++){
        const pool=run.draft_catalog.filter((c:any)=>towerDraftLegal(c,aiLevels)),offer:any[]=[];
        while(pool.length&&offer.length<3)offer.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);
        if(!offer.length)return fail('CONFIG_INVALID','Không đủ nâng cấp cho Tâm Ma.');
        const priority=Math.min(...offer.map(c=>c.priority)),best=offer.filter(c=>c.priority===priority),chosen=best[Math.floor(Math.random()*best.length)];
        aiPicks.push(chosen.id);towerDraftApply(chosen,aiLevels);
    }
    run.player_picks=req.picks;run.demon_picks=aiPicks;run.phase='countdown';run.combat_started_at_ms=Date.now()+5000;
    try{nk.storageWrite([{...ref,value:run,version:row.version,permissionRead:0,permissionWrite:0}]);}
    catch(_e){return fail('CONFLICT','Chưa xác nhận được build. Hãy thử lại.');}
    return JSON.stringify({success:true,run});
}

function finishTrialTower(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    const fail=(code:string,message:string)=>JSON.stringify({success:false,code,message});
    if(!ctx.userId)return fail('AUTH_REQUIRED','Authentication required');
    let req:any;try{req=JSON.parse(payload||'{}');}catch(_e){return fail('INVALID_REQUEST','Invalid JSON');}
    if(!req||typeof req.run_id!=='string'||['win','loss','abandon'].indexOf(req.result)<0)return fail('INVALID_REQUEST','Kết quả không hợp lệ.');
    const refs=[{collection:'player_stage_runs',key:'active',userId:ctx.userId},
        {collection:'player_trial_tower',key:'main',userId:ctx.userId},{collection:'player_profiles',key:'main',userId:ctx.userId}];
    const rows=nk.storageRead(refs),r=rows.find(v=>v.collection==='player_stage_runs'),t=rows.find(v=>v.collection==='player_trial_tower'),p=rows.find(v=>v.collection==='player_profiles');
    if(!r||!t||!p)return fail('RUN_MISSING','Không tìm thấy trận.');
    const run=cpObject(r.value),tower=cpObject(t.value),profile=cpObject(p.value);
    if(run.run_id!==req.run_id||run.stage_id!=='stage_trial_tower')return fail('RUN_MISMATCH','Trận không hợp lệ.');
    if(run.status==='settled')return run.result===req.result?JSON.stringify({success:true,duplicate:true,result:run.result,highest_cleared:tower.highest_cleared,rewards:run.tower_rewards||[],rewards_granted:run.tower_rewards!==undefined}):fail('RESULT_CONFLICT','Trận đã kết thúc.');
    if(run.status!=='active')return fail('RUN_CLOSED','Trận đã kết thúc.');
    if(req.result!=='abandon') {
        if(run.phase!=='countdown'||!Number.isFinite(run.combat_started_at_ms)||Date.now()<run.combat_started_at_ms)return fail('NOT_STARTED','Trận chưa bắt đầu.');
        if(Date.now()>run.expires_at_ms)return fail('RUN_EXPIRED','Trận đã hết hạn.');
        if(!Number.isFinite(req.player_hp)||!Number.isFinite(req.demon_hp)||req.player_hp<0||req.demon_hp<0
            ||(req.result==='win'?(req.player_hp<=0||req.demon_hp!==0):(req.player_hp!==0)))return fail('INVALID_RESULT','Sinh lực kết thúc không hợp lệ.');
        if(req.result==='win'&&Date.now()-run.combat_started_at_ms<run.min_win_duration_ms)return fail('TOO_EARLY','Chưa thể xác nhận kết quả. Hãy thử lại.');
    }
    if(!Number.isInteger(tower.highest_cleared)||run.floor>tower.highest_cleared+1)return fail('PROGRESS_CONFLICT','Tiến độ không hợp lệ.');
    const rewardWrites:any[]=[],rewardState:any={};
    if(req.result==='win'){
        const rewardRows=nk.storageRead([{collection:'player_inventory',key:'items',userId:ctx.userId},{collection:'player_heroes',key:'states',userId:ctx.userId}]);
        const inv=rewardRows.find(r=>r.collection==='player_inventory'),heroRow=rewardRows.find(r=>r.collection==='player_heroes');
        if(!inv||!heroRow)return fail('PROFILE_INCOMPLETE','Thiếu dữ liệu phần thưởng.');
        const inventory=cpObject(inv.value),heroes=cpObject(heroRow.value),hero=cpArray(heroes.heroes).find((h:any)=>h.hero_id===run.hero_id&&h.owned===true);
        if(!hero)return fail('HERO_NOT_OWNED','Không tìm thấy tướng.');
        const floorDefinition=readContentConfig(nk,'trial_tower').floors[run.floor-1];
        let rewards:any[];
        try{rewards=towerRewardEntries(nk,run.floor>tower.highest_cleared?floorDefinition.first_rewards:floorDefinition.repeat_rewards,profile,run.floor);}
        catch(_e){return fail('REWARD_CONFIG_INVALID','Cấu hình thưởng không hợp lệ.');}
        let exp=0;inventory.items=cpArray(inventory.items);profile.resources=cpObject(profile.resources);
        for(const reward of rewards){
            if(reward.kind==='exp'){reward.amount=Math.floor(reward.amount*progressionGameplayBoostMultiplier(profile,'exp'));exp+=reward.amount;}
            else if(reward.kind==='item'){if(!serverGrantInventoryItem(nk,inventory.items,reward.item_id,reward.amount))return fail('REWARD_ITEM_INVALID','Vật phẩm thưởng không hợp lệ.');}
            else{if(reward.kind==='gold')reward.amount=Math.floor(reward.amount*progressionGameplayBoostMultiplier(profile,'gold'));const balance=Number(profile.resources[reward.kind]||0)+reward.amount;if(!Number.isSafeInteger(balance))return fail('RESOURCE_OVERFLOW','Số dư vượt giới hạn.');profile.resources[reward.kind]=balance;}
        }
        progressionApplyUser(nk,profile,exp);progressionReconcileLevelUnlocks(nk,profile);
        let level=Number(hero.level||1),xp=Number(hero.exp||0)+exp,next=progressionNextHeroExp(nk,level);
        while(level<Math.min(PROGRESSION_MAX_LEVEL,profile.level)&&next>0&&xp>=next){xp-=next;level++;next=progressionNextHeroExp(nk,level);}
        hero.level=level;hero.exp=level>=PROGRESSION_MAX_LEVEL?0:Math.min(xp,next);hero.next_level_exp=level>=PROGRESSION_MAX_LEVEL?0:next;hero.current_attribute=progressionHeroAttributes(nk,run.hero_id,level);
        run.tower_rewards=rewards;
        rewardState.inventory=inventory;rewardState.heroes=heroes.heroes;
        rewardWrites.push({collection:'player_inventory',key:'items',userId:ctx.userId,value:inventory,version:inv.version,permissionRead:1,permissionWrite:0},{collection:'player_heroes',key:'states',userId:ctx.userId,value:heroes,version:heroRow.version,permissionRead:1,permissionWrite:0});
        tower.highest_cleared=Math.max(tower.highest_cleared,run.floor);
    }
    run.status='settled';run.result=req.result;run.settled_at_ms=Date.now();
    if((profile.activity||{}).activity_id===run.run_id)delete profile.activity;
    try{nk.storageWrite([{...refs[0],value:run,version:r.version,permissionRead:0,permissionWrite:0},
        {...refs[1],value:tower,version:t.version,permissionRead:0,permissionWrite:0},
        {...refs[2],value:profile,version:p.version,permissionRead:0,permissionWrite:0}].concat(rewardWrites));}
    catch(_e){return fail('CONFLICT','Chưa lưu được kết quả. Hãy thử lại.');}
    return JSON.stringify(Object.assign({success:true,result:req.result,highest_cleared:tower.highest_cleared,rewards:run.tower_rewards||[],rewards_granted:run.tower_rewards!==undefined,profile},rewardState));
}

const PROGRESSION_VERSION = 2;
const PROGRESSION_MAX_LEVEL = 70;
const PROGRESSION_HERO_BASE_EXP = 1000;
const PROGRESSION_USER_BASE_EXP = 5000;
const PROGRESSION_POWER_C = 750;
const PROGRESSION_POWER_P = 3.2;
const PROGRESSION_USER_RATIO = 5;

const CULTIVATION_MAX_ATTEMPTS = 3;
const CULTIVATION_ELEMENTS = ["metal", "wood", "water", "fire", "earth"];
const CULTIVATION_TIERS: any[] = [
    { id: "thai_co", weight: 1, score_min: 90, score_max: 100, main_min: 0.8, main_max: 0.95, base_waves: 7 },
    { id: "cuc_pham", weight: 5, score_min: 80, score_max: 90, main_min: 0.6, main_max: 0.8, base_waves: 6 },
    { id: "thien_linh_can", weight: 10, score_min: 70, score_max: 80, main_min: 0.5, main_max: 0.7, base_waves: 5 },
    { id: "thuong_pham", weight: 15, score_min: 60, score_max: 70, main_min: 0.4, main_max: 0.6, base_waves: 4 },
    { id: "trung_pham", weight: 20, score_min: 50, score_max: 60, main_min: 0.3, main_max: 0.5, base_waves: 3 },
    { id: "ha_pham", weight: 49, score_min: 10, score_max: 50, main_min: 0.2, main_max: 0.4, base_waves: 2 },
];

function cultivationConfig(): any {
    return {
        max_attempts: CULTIVATION_MAX_ATTEMPTS, penalty_exp_percent: 0.3,
        element_cap: 400, reward_base: 5, reward_main_bonus: 2.5,
        reward_secondary_variance: 0.5, reward_main_variance: 1.0, reward_multiplier_min: 0.8,
        reward_multiplier_max: 1.2, performance_weight: 0.2,
        failure_penalty: 0.05, luck_min: -0.1, luck_max: 0.1,
        elements: CULTIVATION_ELEMENTS, tiers: CULTIVATION_TIERS,
        wave_delta: [
            { delta: 0, weight: 70 }, { delta: -1, weight: 15 },
            { delta: 1, weight: 10 }, { delta: 2, weight: 5 },
        ],
    };
}

function cultivationRound1(value: number): number { return Math.round(value * 10) / 10; }

// Independent permanent sources: reroll may replace innate/growth, never earned bonuses.
function cultivationEnsureSources(profile: any): void {
    if (profile.element_sources && profile.element_sources.version === 1) return;
    const current = profile.element_affinities || {};
    const tribulation: any = {}, fruit: any = {}, base: any = {}, growth: any = {};
    const history = (profile.breakthrough || {}).history || [];
    const unclassifiedHistory = history.some((row: any) => !row.gains && !(row.reward || {}).gains);
    CULTIVATION_ELEMENTS.forEach(id => {
        tribulation[id] = cultivationRound1(history.reduce((sum: number, row: any) => sum + Math.max(0, Number((row.gains || (row.reward || {}).gains || {})[id] || 0)), 0));
        tribulation[id] = Math.min(Math.max(0, Number(current[id] || 0)), tribulation[id]);
    });
    const remaining = CULTIVATION_ELEMENTS.reduce((sum, id) => sum + Math.max(0, Number(current[id] || 0) - tribulation[id]), 0);
    // Old histories stored wave counts only. Their rewards cannot be recovered:
    // conservatively retain all unclassified points rather than erase an earned bonus.
    const ratio = unclassifiedHistory ? 0 : (remaining > 0 ? Math.min(1, Math.max(0, Number(profile.talent_score || remaining)) / remaining) : 1);
    CULTIVATION_ELEMENTS.forEach(id => {
        const value = Math.max(0, Number(current[id] || 0) - tribulation[id]);
        base[id] = cultivationRound1(value * ratio);
        fruit[id] = cultivationRound1(value - base[id]); // Preserve unclassified legacy permanent gains.
        growth[id] = 0;
    });
    profile.element_sources = {version: 1, base, growth_per_level: growth, growth_levels: Number(profile.level || 1), tribulation, fruit};
}

function cultivationRebuildSources(profile: any): void {
    const sources = profile.element_sources;
    const totals: any = {};
    CULTIVATION_ELEMENTS.forEach(id => {
        totals[id] = cultivationRound1(Math.max(0, Number(sources.base[id] || 0)
            + Number(sources.growth_per_level[id] || 0) * Number(sources.growth_levels || 0)
            + Number(sources.tribulation[id] || 0) + Number(sources.fruit[id] || 0)));
    });
    profile.element_affinities = totals;
}

function cultivationApplyReroll(profile: any, rolled: any, config: any): void {
    cultivationEnsureSources(profile);
    const sources = profile.element_sources;
    sources.base = rolled.element_affinities;
    sources.growth_levels = Number(profile.level || 1);
    CULTIVATION_ELEMENTS.forEach(id => {
        sources.growth_per_level[id] = Number(id === rolled.main_element ? config.main_growth : config.secondary_growth);
    });
    profile.talent_tier = rolled.talent_tier;
    profile.talent_score = rolled.talent_score;
    profile.main_element = rolled.main_element;
    cultivationRebuildSources(profile);
}
function isBreakthroughMilestone(level: number): boolean { return level < PROGRESSION_MAX_LEVEL && level % 10 === 9; }

function cultivationSplit(mainElement: string, mainPct: number): any {
    const result: any = {}; result[mainElement] = mainPct;
    let open = CULTIVATION_ELEMENTS.filter((id: string) => id !== mainElement);
    const cap = Math.min(0.25, mainPct);
    let remaining = 1 - mainPct;
    while (remaining > 0.00001 && open.length > 0) {
        const weights: any = {}; let totalWeight = 0;
        open.forEach((id: string) => { weights[id] = 0.01 + Math.random() * 0.99; totalWeight += weights[id]; });
        let distributed = 0; const nextOpen: string[] = [];
        open.forEach((id: string) => {
            const available = cap - Number(result[id] || 0);
            const applied = Math.min(available, remaining * weights[id] / totalWeight);
            result[id] = Number(result[id] || 0) + applied;
            distributed += applied;
            if (available - applied > 0.00001) nextOpen.push(id);
        });
        remaining -= distributed; open = nextOpen;
    }
    return result;
}

function cultivationRollProfile(): any {
    const roll = Math.floor(Math.random() * 100) + 1;
    let cursor = 0; let tier = CULTIVATION_TIERS[CULTIVATION_TIERS.length - 1];
    for (let i = 0; i < CULTIVATION_TIERS.length; i++) {
        cursor += CULTIVATION_TIERS[i].weight;
        if (roll <= cursor) { tier = CULTIVATION_TIERS[i]; break; }
    }
    const score = cultivationRound1(tier.score_min + Math.random() * (tier.score_max - tier.score_min));
    const mainElement = CULTIVATION_ELEMENTS[Math.floor(Math.random() * CULTIVATION_ELEMENTS.length)];
    const u = Math.random();
    const mainPct = tier.main_min + (tier.main_max - tier.main_min) * u * u;
    const percentages = cultivationSplit(mainElement, mainPct);
    const affinities: any = {}; let sum = 0;
    CULTIVATION_ELEMENTS.forEach((id: string) => { affinities[id] = cultivationRound1(score * Number(percentages[id] || 0)); sum += affinities[id]; });
    affinities[mainElement] = cultivationRound1(affinities[mainElement] + score - cultivationRound1(sum));
    CULTIVATION_ELEMENTS.forEach((id: string) => {
        if (id === mainElement || Number(affinities[id] || 0) <= Number(affinities[mainElement] || 0)) return;
        const transfer = cultivationRound1((Number(affinities[id]) - Number(affinities[mainElement]) + 0.1) * 0.5);
        affinities[id] = cultivationRound1(Number(affinities[id]) - transfer);
        affinities[mainElement] = cultivationRound1(Number(affinities[mainElement]) + transfer);
    });
    return { talent_tier: tier.id, talent_score: score, main_element: mainElement, element_affinities: affinities };
}

function cultivationDefaultBreakthrough(history?: any[]): any {
	return { milestone_level: 0, attempts_left: CULTIVATION_MAX_ATTEMPTS, tribulation_count: 0,
		count_rolled: false, in_tribulation: false, failures: 0,
		ruleset_version: 1, encounter_id: "", encounter_seed: 0, skill_set: [], started_at: 0,
		history: Array.isArray(history) ? history : [] };
}

function cultivationPhase2Encounter(state: any): void {
	const waveCount = Math.max(1, Math.min(9, Number(state.tribulation_count || 1)));
	const skills = ["loi_tru"];
	if (waveCount >= 2) skills.push("loi_vong");
	if (waveCount >= 3) skills.push("loi_vuc");
	if (waveCount >= 5) skills.push("thien_phat");
	state.ruleset_version = 2;
	state.encounter_id = `${Date.now()}-${Math.floor(Math.random() * 1000000000)}`;
	state.encounter_seed = Math.floor(Math.random() * 2147483647);
	state.skill_set = skills;
	state.started_at = Date.now();
	state.item_cooldowns = {};
	state.item_revives = 0;
}

// Returns true when migration or interrupted-run recovery changed the profile.
function cultivationEnsureProfile(nk: nkruntime.Nakama, profile: any, recoverInterrupted: boolean): boolean {
    let changed = thanLuanReconcile(profile, thanLuanConfig(nk));
    const required = ["talent_tier", "talent_score", "main_element", "element_affinities"];
    if (required.some((key: string) => profile[key] === undefined || profile[key] === null)) {
        const rolled = cultivationRollProfile();
        // A partial legacy object must not be rerolled on each load. Fill only
        // absent fields, then persist the completed authoritative snapshot.
        required.forEach((key: string) => { if (profile[key] === undefined || profile[key] === null) profile[key] = rolled[key]; });
        changed = true;
    }
    if (!Array.isArray(profile.affinity_flags)) { profile.affinity_flags = []; changed = true; }
    if (!Number.isFinite(Number(profile.comprehension_points))) { profile.comprehension_points = 0; changed = true; }
    if (!Array.isArray(profile.unlocked_laws)) { profile.unlocked_laws = []; changed = true; }
    if (!profile.breakthrough || typeof profile.breakthrough !== "object" || Array.isArray(profile.breakthrough)) {
        profile.breakthrough = cultivationDefaultBreakthrough(); changed = true;
    }
    const state = profile.breakthrough;
    const history = Array.isArray(state.history) ? state.history : [];
    const defaults = cultivationDefaultBreakthrough(history);
    Object.keys(defaults).forEach((key: string) => { if (state[key] === undefined) { state[key] = defaults[key]; changed = true; } });
    state.attempts_left = Math.max(0, Math.min(CULTIVATION_MAX_ATTEMPTS, Math.floor(Number(state.attempts_left))));
    state.tribulation_count = Math.max(0, Math.min(9, Math.floor(Number(state.tribulation_count))));
    state.failures = Math.max(0, Math.floor(Number(state.failures)));
    if (recoverInterrupted && state.in_tribulation === true) {
        state.in_tribulation = false;
        state.failures += 1;
        state.attempts_left = Math.max(0, state.attempts_left - 1);
        if (state.attempts_left <= 0) {
            const threshold = progressionNextUserExp(nk, Math.max(1, Number(profile.level || 1)));
            profile.exp = Math.max(0, Number(profile.exp || 0) - Math.round(threshold * 0.3));
            state.attempts_left = CULTIVATION_MAX_ATTEMPTS;
            state.penalty_applied = true;
        }
        changed = true;
    }
    return changed;
}

function cultivationRollWaves(profile: any): number {
    const state = profile.breakthrough || cultivationDefaultBreakthrough();
    const history = Array.isArray(state.history) ? state.history : [];
    if (history.length === 0) {
        const tier = CULTIVATION_TIERS.filter((item: any) => item.id === String(profile.talent_tier || ""))[0];
        return Math.max(1, Math.min(9, Number(tier ? tier.base_waves : 2)));
    }
    const previous = Math.max(1, Math.min(9, Number(history[history.length - 1].waves || 1)));
    const roll = Math.floor(Math.random() * 100) + 1; let cursor = 0; let delta = 0;
    const options = cultivationConfig().wave_delta;
    for (let i = 0; i < options.length; i++) { cursor += options[i].weight; if (roll <= cursor) { delta = options[i].delta; break; } }
    return Math.max(1, Math.min(9, previous + delta));
}

function cultivationEnsurePreview(nk: nkruntime.Nakama, profile: any): boolean {
    const level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    const threshold = progressionNextUserExp(nk, level);
    if (!isBreakthroughMilestone(level) || threshold <= 0 || Number(profile.exp || 0) < threshold) return false;
    let state = profile.breakthrough || cultivationDefaultBreakthrough();
    let changed = false;
    if (Number(state.milestone_level || 0) !== level) {
        state = cultivationDefaultBreakthrough(state.history); state.milestone_level = level; changed = true;
    }
    if (state.count_rolled !== true) {
        profile.breakthrough = state;
        state.tribulation_count = cultivationRollWaves(profile); state.count_rolled = true; changed = true;
    }
    profile.breakthrough = state;
    return changed;
}

function cultivationReward(profile: any, waves: number, failures: number, hpRatio: number): any {
    cultivationEnsureSources(profile);
    const config = cultivationConfig();
    let multiplier = 1 + (Math.max(0, Math.min(1, hpRatio)) - 0.5) * config.performance_weight;
    multiplier -= failures * config.failure_penalty;
    multiplier += config.luck_min + Math.random() * (config.luck_max - config.luck_min);
    multiplier = Math.max(config.reward_multiplier_min, Math.min(config.reward_multiplier_max, multiplier));
    const gains: any = {}; const affinities = profile.element_affinities || {};
    CULTIVATION_ELEMENTS.forEach((id: string) => {
        let base = config.reward_base;
        if (id === profile.main_element) {
            base += config.reward_main_bonus + Math.max(0, waves - 5);
            base += -config.reward_main_variance + Math.random() * (config.reward_main_variance * 2);
        } else {
            base += -config.reward_secondary_variance + Math.random() * (config.reward_secondary_variance * 2);
        }
        const requested = cultivationRound1(base * multiplier);
        const before = Math.max(0, Number(affinities[id] || 0));
        const after = before + Math.max(0, Math.min(config.element_cap - before, requested));
        affinities[id] = cultivationRound1(after);
        gains[id] = cultivationRound1(after - before);
        profile.element_sources.tribulation[id] = cultivationRound1(Number(profile.element_sources.tribulation[id] || 0) + gains[id]);
    });
    profile.element_affinities = affinities;
    return { multiplier: Math.round(multiplier * 100) / 100, gains };
}

function progressionObject(value: any): any {
    const parsed = parseJsonb(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function progressionCumulativeUserExp(level: number): number {
    if (level <= 0) return 0;
    if (level === 1) return PROGRESSION_USER_BASE_EXP;
    return PROGRESSION_USER_BASE_EXP + Math.floor(PROGRESSION_POWER_C * Math.pow(level, PROGRESSION_POWER_P) - PROGRESSION_POWER_C);
}

function progressionNextHeroExp(nk: nkruntime.Nakama, level: number): number {
    if (level >= PROGRESSION_MAX_LEVEL) return 0;
    // Remote config is a cumulative EXP table: [level 0 total, level 1 total,
    // ...]. Convert it to the amount required for the current level. Keeping
    // the power curve as a fallback makes old/invalid releases safe.
    const configured: any = getRemoteConfigValue(nk, "game_play", "exp_to_level", []);
    if (Array.isArray(configured) && configured.length > level) {
        const currentTotal = Number(configured[level - 1]);
        const nextTotal = Number(configured[level]);
        if (Number.isFinite(currentTotal) && Number.isFinite(nextTotal) && nextTotal > currentTotal) {
            return Math.max(1, Math.floor(nextTotal - currentTotal));
        }
    }
    const userReq = progressionNextUserExp(nk, level);
    return Math.max(1, Math.floor(userReq / PROGRESSION_USER_RATIO));
}

function progressionNextUserExp(nk: nkruntime.Nakama, level: number): number {
    if (level >= PROGRESSION_MAX_LEVEL) return 0;
    if (level === 1) return PROGRESSION_USER_BASE_EXP;
    const current = progressionCumulativeUserExp(level);
    const prev = progressionCumulativeUserExp(level - 1);
    return Math.max(1, current - prev);
}

// Timed reward cards are profile-owned and evaluated only by the server at
// settlement. Expired entries are inert; inventory use replaces or extends
// them atomically before this point.
function progressionGameplayBoostMultiplier(profile: any, resource: string, now: number = Date.now()): number {
    const boosts = progressionObject(profile && profile.gameplay_boosts);
    const boost = progressionObject(boosts[resource]);
    const expiry = Number(boost.expires_at_ms || 0);
    const multiplier = Number(boost.multiplier || 1);
    if (expiry <= now || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5) return 1;
    return multiplier;
}

function progressionApplyUser(nk: nkruntime.Nakama, profile: any, awarded: number): any {
    cultivationEnsureSources(profile);
    let level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    let exp = Math.max(0, Number(profile.exp || 0)) + awarded;
    let next = progressionNextUserExp(nk, level);
    let gained = 0;
    while (level < PROGRESSION_MAX_LEVEL && next > 0 && exp >= next) {
        if (isBreakthroughMilestone(level)) { exp = next; break; }
        exp -= next;
        level++;
        gained++;
        next = progressionNextUserExp(nk, level);
    }
    if (level >= PROGRESSION_MAX_LEVEL) { exp = 0; next = 0; }
    profile.level = level;
    profile.element_sources.growth_levels = level;
    cultivationRebuildSources(profile);
    profile.exp = exp;
    profile.next_level_exp = next;
    profile.progression_version = PROGRESSION_VERSION;
    // Sweeps and every other EXP source must return a usable milestone preview.
    // Existing previews are retained; this does not reroll attempts or encounters.
    cultivationEnsurePreview(nk, profile);
    // Every actual account-level gain restores the active stamina bar, while
    // preserving the configured storage ceiling as the authoritative bound.
    if (gained > 0) {
        profile.stamina = staminaClamp(nk, Math.max(Number(profile.stamina || 0), staminaMax(nk)));
        profile.last_stamina_update = Math.floor(Date.now() / 1000);
    }
    return { level, exp, next_level_exp: next, levels_gained: gained };
}

function progressionReconcileLevelUnlocks(nk: nkruntime.Nakama, profile: any): void {
    thanLuanReconcile(profile, thanLuanConfig(nk));
    const level = Number(profile.level || 1);
    const arcs = nk.sqlQuery("SELECT id FROM game_arcs WHERE level_min <= $1 ORDER BY sort_order", [level]);
    const unlockedArcs: string[] = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
    const unlockedStages: any[] = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
    for (let i = 0; i < arcs.length; i++) {
        const arcId = String(arcs[i].id || "");
        if (arcId && unlockedArcs.indexOf(arcId) === -1) unlockedArcs.push(arcId);
        const stages = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [arcId]);
        const stageId = stages.length > 0 ? String(stages[0].id || "") : "";
        if (stageId && !unlockedStages.some((entry: any) => entry && String(entry.stage_id || entry) === stageId)) {
            unlockedStages.push({ stage_id: stageId, unlocked_levels: ["normal"] });
        }
    }
    profile.unlocked_arcs = unlockedArcs;
    profile.unlocked_stages = unlockedStages;
}

// C178: permanent character progression; profile/inventory/request receipt share one CAS batch.
function thanLuanConfig(nk: nkruntime.Nakama): any {
    const rows = nk.sqlQuery("SELECT value FROM game_config WHERE key='progression'", []);
    const config = rows.length ? cpObject(rows[0].value).than_luan : null;
    if (!config || config.schema_version !== 2 || config.unlock_level !== 30 || config.max_level !== 50
        ||config.charm_item_id!=='than_luan_boost_charm'||config.charm_multiplier!==1.5
        || !Array.isArray(config.levels) || config.levels.length !== 50) throw Error('THAN_LUAN_CONFIG_INVALID');
    for (let i=0;i<50;i++) {
        const row=config.levels[i], cost=row && row.cost, stats=row && row.stats;
        if (!row || row.level!==i+1 || row.aura_id!=='tl_'+(Math.floor(i/10)+1) || !cost || !stats
            || !Number.isSafeInteger(cost.quantity) || cost.quantity<0
            || !Number.isSafeInteger(cost.gold)||cost.gold<0||!Number.isInteger(row.success_rate)||row.success_rate<1||row.success_rate>100
            || (i===0 ? cost.quantity!==0 || cost.item_id!=='' : cost.quantity===0 || ['law_fragment_low','law_fragment_medium','law_fragment_high'].indexOf(cost.item_id)<0)
            || ['persistent_damage_reduction','dot_damage_reduction','control_duration_reduction'].some(k=>!Number.isFinite(stats[k])||stats[k]<0||stats[k]>.95)) throw Error('THAN_LUAN_CONFIG_INVALID');
    }
    return config;
}

function thanLuanReconcile(profile:any, config:any):boolean {
    if (profile.than_luan===undefined) {
        profile.than_luan={level:Number(profile.level||1)>=config.unlock_level?1:0,revision:0};return true;
    }
    const state=profile.than_luan;
    if (!state || !Number.isSafeInteger(state.level)||state.level<0||state.level>config.max_level
        || !Number.isSafeInteger(state.revision)||state.revision<0) throw Error('THAN_LUAN_STATE_INVALID');
    if (!state.level && Number(profile.level||1)>=config.unlock_level) {state.level=1;state.revision++;return true;}
    return false;
}

function thanLuanBattleSnapshot(profile:any, config:any):any {
    const level=Number(profile.level||1)>=config.unlock_level?Number(cpObject(profile.than_luan).level||0):0;
    return level>0&&Number.isInteger(level)&&level<=config.max_level?JSON.parse(JSON.stringify(config.levels[level-1])):{};
}

function thanLuanStats(profile:any, config:any):any {
    const level=Number(profile.level||1)>=config.unlock_level?Number(cpObject(profile.than_luan).level||0):0;
    return level>0&&Number.isInteger(level)&&level<=config.max_level?Object.assign({},config.levels[level-1].stats):{};
}

function thanLuanResponse(profile:any, inventory:any, config:any):any {
    const level=profile.than_luan.level, materials:any={};
    for(const item of cpArray(inventory.items))if(item&&['law_fragment_low','law_fragment_medium','law_fragment_high',config.charm_item_id].indexOf(item.item_id)>=0){
        if(!Number.isSafeInteger(item.quantity)||item.quantity<0)throw Error('THAN_LUAN_INVENTORY_INVALID');
        materials[item.item_id]=(materials[item.item_id]||0)+item.quantity;
        if(!Number.isSafeInteger(materials[item.item_id]))throw Error('THAN_LUAN_INVENTORY_INVALID');
    }
    return {success:true,state:{level,revision:profile.than_luan.revision,stats:thanLuanStats(profile,config),
        aura_id:level?config.levels[level-1].aura_id:'',next:level<config.max_level?config.levels[level]:null,materials,
        gold_owned:Number(cpObject(profile.resources).gold||0),charm_item_id:config.charm_item_id,charm_multiplier:config.charm_multiplier},
        profile,inventory:cpArray(inventory.items)};
}

function getThanLuanState(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,_payload:string):string {
    if(!ctx.userId)return JSON.stringify({success:false,code:'AUTH_REQUIRED',message:'Cần đăng nhập.'});
    try {
        const config=thanLuanConfig(nk), rows=nk.storageRead([{collection:'player_profiles',key:'main',userId:ctx.userId},{collection:'player_inventory',key:'items',userId:ctx.userId}]);
        const p=rows.find(r=>r.collection==='player_profiles'), inv=rows.find(r=>r.collection==='player_inventory');
        if(!p||!inv)return JSON.stringify({success:false,code:'PROFILE_INCOMPLETE',message:'Chưa tải đủ nhân vật.'});
        const profile=cpObject(p.value);
        if(thanLuanReconcile(profile,config))nk.storageWrite([{collection:'player_profiles',key:'main',userId:ctx.userId,value:profile,version:p.version,permissionRead:1,permissionWrite:0}]);
        return JSON.stringify(thanLuanResponse(profile,cpObject(inv.value),config));
    }catch(_e){return JSON.stringify({success:false,code:'STATE_UNAVAILABLE',message:'Chưa tải được Pháp Tắc. Hãy thử lại.'});}
}

function upgradeThanLuan(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    const fail=(code:string,message:string)=>JSON.stringify({success:false,code,message});
    if(!ctx.userId)return fail('AUTH_REQUIRED','Cần đăng nhập.');
    let req:any;try{req=JSON.parse(payload||'{}');}catch(_e){return fail('INVALID_REQUEST','Yêu cầu không hợp lệ.');}
    if(!req||typeof req.request_id!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(req.request_id)
        ||!Number.isSafeInteger(req.expected_level)||req.expected_level<1||req.expected_level>50
        ||!Number.isSafeInteger(req.expected_revision)||req.expected_revision<0||typeof req.use_charm!=='boolean')return fail('INVALID_REQUEST','Yêu cầu không hợp lệ.');
    let config:any;try{config=thanLuanConfig(nk);}catch(_e){return fail('CONFIG_INVALID','Cấu hình Pháp Tắc chưa sẵn sàng.');}
    const receiptRef={collection:'player_item_requests',key:'than_luan_'+req.request_id,userId:ctx.userId};
    const rows=nk.storageRead([{collection:'player_profiles',key:'main',userId:ctx.userId},{collection:'player_inventory',key:'items',userId:ctx.userId},receiptRef]);
    const p=rows.find(r=>r.collection==='player_profiles'), inv=rows.find(r=>r.collection==='player_inventory'), receipt=rows.find(r=>r.collection==='player_item_requests');
    if(!p||!inv)return fail('PROFILE_INCOMPLETE','Chưa tải đủ nhân vật.');
    const profile=cpObject(p.value), inventory=cpObject(inv.value);
    try{thanLuanReconcile(profile,config);}catch(_e){return fail('STATE_INVALID','Tiến độ Pháp Tắc không hợp lệ.');}
    if(Number(profile.level||1)<config.unlock_level)return fail('FEATURE_LOCKED','Pháp Tắc mở ở Lv.30.');
    if(receipt){
        if(receipt.value.expected_level!==req.expected_level||receipt.value.expected_revision!==req.expected_revision||receipt.value.use_charm!==req.use_charm)return fail('REQUEST_CONFLICT','Mã yêu cầu đã được dùng.');
        return JSON.stringify(Object.assign(thanLuanResponse(profile,inventory,config),receipt.value.outcome,{duplicate:true}));
    }
    if(profile.than_luan.level!==req.expected_level)return fail('LEVEL_CONFLICT','Tiến độ đã thay đổi. Hãy tải lại.');
    if(profile.than_luan.revision!==req.expected_revision)return fail('REVISION_CONFLICT','Lần nâng cấp đã thay đổi. Hãy tải lại.');
    if(profile.than_luan.level>=config.max_level)return fail('MAX_LEVEL','Đã đạt cấp tối đa.');
    const cost=config.levels[profile.than_luan.level].cost;
    let response:any;try{response=thanLuanResponse(profile,inventory,config);}catch(_e){return fail('INVENTORY_INVALID','Nguyên liệu không hợp lệ.');}
    if((response.state.materials[cost.item_id]||0)<cost.quantity)return fail('INSUFFICIENT_MATERIALS','Không đủ Mảnh pháp tắc.');
    const resources=cpObject(profile.resources),gold=Number(resources.gold||0);
    if(!Number.isSafeInteger(gold)||gold<cost.gold)return fail('INSUFFICIENT_GOLD','Không đủ vàng.');
    if(req.use_charm&&(response.state.materials[config.charm_item_id]||0)<1)return fail('INSUFFICIENT_CHARM','Không đủ Pháp Tắc Phù.');
    let remaining=cost.quantity;
    for(const item of inventory.items)if(item.item_id===cost.item_id){const spend=Math.min(item.quantity,remaining);item.quantity-=spend;remaining-=spend;}
    inventory.items=inventory.items.filter((i:any)=>i.item_id!==cost.item_id||i.quantity>0);
    if(req.use_charm){
        const charm=inventory.items.find((i:any)=>i.item_id===config.charm_item_id&&i.quantity>0);
        charm.quantity--;inventory.items=inventory.items.filter((i:any)=>i.item_id!==config.charm_item_id||i.quantity>0);
    }
    resources.gold=gold-cost.gold;profile.resources=resources;
    const successRate=Math.min(100,Math.round(config.levels[profile.than_luan.level].success_rate*(req.use_charm?config.charm_multiplier:1)));
    const upgraded=Math.random()<successRate/100;
    const outcome={attempted:true,consumed:true,upgraded,charm_consumed:req.use_charm,success_rate:successRate,
        previous_level:profile.than_luan.level,new_level:profile.than_luan.level+(upgraded?1:0)};
    profile.than_luan={level:profile.than_luan.level+(upgraded?1:0),revision:profile.than_luan.revision+1};
    try{nk.storageWrite([
        {collection:'player_profiles',key:'main',userId:ctx.userId,value:profile,version:p.version,permissionRead:1,permissionWrite:0},
        {collection:'player_inventory',key:'items',userId:ctx.userId,value:inventory,version:inv.version,permissionRead:1,permissionWrite:0},
        {...receiptRef,value:{expected_level:req.expected_level,expected_revision:req.expected_revision,use_charm:req.use_charm,outcome},version:'*',permissionRead:0,permissionWrite:0}
    ]);}catch(_e){return fail('CONFLICT','Có thao tác khác. Hãy tải lại và thử lại.');}
    if(typeof writePlayerLeaderboardRecords==='function') {
        try{writePlayerLeaderboardRecords(nk,ctx.userId,profile,profile.display_name);}
        catch(_e){_logger.warn('Phap Tac committed; leaderboard refresh deferred until profile sync.');}
    }
    return JSON.stringify(Object.assign(thanLuanResponse(profile,inventory,config),outcome));
}

function progressionCompleteStage(nk: nkruntime.Nakama, profile: any, stageId: string, levelId: string): void {
    const completed: any[] = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
    if (!completed.some((entry: any) => entry && String(entry.stage_id) === stageId && String(entry.level_id) === levelId)) {
        completed.push({ stage_id: stageId, level_id: levelId });
    }
    profile.completed_stage_levels = completed;
    const unlockedStages: any[] = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
    let current = unlockedStages.find((entry: any) => entry && String(entry.stage_id || entry) === stageId);
    if (!current || typeof current !== "object") {
        current = { stage_id: stageId, unlocked_levels: ["normal"] }; unlockedStages.push(current);
    }
    if (!Array.isArray(current.unlocked_levels)) current.unlocked_levels = ["normal"];
    // Campaign normal clear unlocks the next stage in the same arc.
    if (levelId === "normal") {
        const stageRows = nk.sqlQuery("SELECT arc_id, sort_order FROM game_stages WHERE id = $1", [stageId]);
        if (stageRows.length > 0) {
            const nextRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 AND sort_order > $2 ORDER BY sort_order LIMIT 1",
                [stageRows[0].arc_id, stageRows[0].sort_order]);
            if (nextRows.length > 0) {
                const nextStage = String(nextRows[0].id || "");
                if (nextStage && !unlockedStages.some((entry: any) => entry && String(entry.stage_id || entry) === nextStage)) {
                    unlockedStages.push({ stage_id: nextStage, unlocked_levels: ["normal"] });
                }
            } else {
                // The final normal clear in an arc unlocks the following arc
                // and its first stage. Previously this branch did nothing,
                // leaving the client UI ahead of the server-authoritative
                // profile and causing `Stage level is locked` on start.
                const arcRows = nk.sqlQuery("SELECT sort_order FROM game_arcs WHERE id = $1", [stageRows[0].arc_id]);
                if (arcRows.length > 0) {
                    const nextArcRows = nk.sqlQuery("SELECT id FROM game_arcs WHERE sort_order > $1 ORDER BY sort_order LIMIT 1", [arcRows[0].sort_order]);
                    if (nextArcRows.length > 0) {
                        const nextArcId = String(nextArcRows[0].id || "");
                        const unlockedArcs: string[] = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
                        if (nextArcId && unlockedArcs.indexOf(nextArcId) === -1) unlockedArcs.push(nextArcId);
                        profile.unlocked_arcs = unlockedArcs;
                        const firstStageRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [nextArcId]);
                        const firstStageId = firstStageRows.length > 0 ? String(firstStageRows[0].id || "") : "";
                        if (firstStageId && !unlockedStages.some((entry: any) => entry && String(entry.stage_id || entry) === firstStageId)) {
                            unlockedStages.push({ stage_id: firstStageId, unlocked_levels: ["normal"] });
                        }
                    }
                }
            }
        }
    }
    profile.unlocked_stages = unlockedStages;
    progressionReconcileArcModes(nk, profile);
}

// Repair profiles earned before cross-arc unlocks were persisted. This is
// called by start_stage so a player never has to replay the previous boss.
function progressionReconcileCampaignUnlocks(nk: nkruntime.Nakama, profile: any): boolean {
    const completed: any[] = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
    const unlockedStages: any[] = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
    const unlockedArcs: string[] = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
    let changed = false;
    for (const entry of completed) {
        if (!entry || String(entry.level_id || "") !== "normal") continue;
        const stageId = String(entry.stage_id || "");
        const stageRows = nk.sqlQuery("SELECT arc_id, sort_order FROM game_stages WHERE id = $1", [stageId]);
        if (stageRows.length === 0) continue;
        const nextRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 AND sort_order > $2 ORDER BY sort_order LIMIT 1", [stageRows[0].arc_id, stageRows[0].sort_order]);
        if (nextRows.length > 0) continue;
        const arcRows = nk.sqlQuery("SELECT sort_order FROM game_arcs WHERE id = $1", [stageRows[0].arc_id]);
        if (arcRows.length === 0) continue;
        const nextArcRows = nk.sqlQuery("SELECT id FROM game_arcs WHERE sort_order > $1 ORDER BY sort_order LIMIT 1", [arcRows[0].sort_order]);
        if (nextArcRows.length === 0) continue;
        const nextArcId = String(nextArcRows[0].id || "");
        if (nextArcId && unlockedArcs.indexOf(nextArcId) === -1) {
            unlockedArcs.push(nextArcId);
            changed = true;
        }
        const firstStageRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [nextArcId]);
        const firstStageId = firstStageRows.length > 0 ? String(firstStageRows[0].id || "") : "";
        if (firstStageId && !unlockedStages.some((value: any) => value && String(value.stage_id || value) === firstStageId)) {
            unlockedStages.push({ stage_id: firstStageId, unlocked_levels: ["normal"] });
            changed = true;
        }
    }
    profile.unlocked_arcs = unlockedArcs;
    profile.unlocked_stages = unlockedStages;
    return changed;
}

function progressionMigrate(nk: nkruntime.Nakama, profile: any, heroes: any[]): void {
    if (Number(profile.progression_version || 1) >= PROGRESSION_VERSION) return;
    let highest = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    for (let i = 0; i < heroes.length; i++) {
        const hero = heroes[i] || {};
        hero.level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
        hero.exp = Math.max(0, Number(hero.exp || 0)) * 10;
        hero.next_level_exp = progressionNextHeroExp(nk, hero.level);
        highest = Math.max(highest, hero.level);
    }
    // Legacy accounts had no account XP. Preserve earned hero levels rather than downgrading them.
    profile.level = highest;
    profile.exp = 0;
    profile.next_level_exp = progressionNextUserExp(nk, highest);
    profile.progression_version = PROGRESSION_VERSION;
}

function progressionMaxStageBaseExp(nk: nkruntime.Nakama, stageId: string): number {
    const waves = nk.sqlQuery("SELECT entries FROM game_stage_waves WHERE stage_id = $1", [stageId]);
    let total = 0;
    for (let i = 0; i < waves.length; i++) {
        const entries = parseJsonb(waves[i].entries);
        if (!Array.isArray(entries)) continue;
        for (let j = 0; j < entries.length; j++) {
            const entry = entries[j] || {};
            const enemyId = String(entry.enemy_id || "");
            const enemyRows = nk.sqlQuery("SELECT exp FROM game_enemies WHERE id = $1", [enemyId]);
            if (enemyRows.length === 0) continue;
            const modifiers = progressionObject(entry.modifiers);
            const exp = Math.max(0, Number(modifiers.exp !== undefined ? modifiers.exp : enemyRows[0].exp || 0));
            total += Math.max(0, Number(entry.count || 0)) * exp;
        }
    }
    return Math.floor(total);
}

function progressionHeroAttributes(nk: nkruntime.Nakama, heroId: string, level: number): any {
    const rows = nk.sqlQuery("SELECT attributes, level_up_stats FROM game_heroes WHERE id = $1", [heroId]);
    if (rows.length === 0) return {};
    const attributes = progressionObject(rows[0].attributes);
    const levelUp = progressionObject(rows[0].level_up_stats);
    const multiplicative: any = { hp: true, atk: true, def: true, move_speed: true, attack_speed: true, attack_range: true };
    for (let i = 1; i < level; i++) {
        Object.keys(levelUp).forEach((key: string) => {
            const value = Number(levelUp[key] || 0);
            attributes[key] = multiplicative[key] ? Number(attributes[key] || 0) * value : Number(attributes[key] || 0) + value;
        });
        attributes.crit_rate = Math.max(0, Math.min(1, Number(attributes.crit_rate || 0)));
        attributes.crit_damage = Math.max(1, Math.min(10, Number(attributes.crit_damage || 1)));
        attributes.regen_percent_per_10s = Math.max(0, Math.min(0.1, Number(attributes.regen_percent_per_10s || 0)));
        attributes.def = Math.max(0, Number(attributes.def || 0));
    }
    return attributes;
}

const awardStageProgression: nkruntime.RpcFunction = (
    ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string
): string => {
    let req: any = {};
    try { req = JSON.parse(payload || "{}"); } catch (_) { return JSON.stringify({ success: false, message: "Invalid JSON" }); }
    const stageId = String(req.stage_id || "");
    const difficultyId = String(req.difficulty_id || "");
    const heroId = String(req.hero_id || "");
    const runId = String(req.run_id || "").slice(0, 128);
    const won = req.won === true;
    if(won&&(!Number.isFinite(req.objective_hp_ratio)||req.objective_hp_ratio<0||req.objective_hp_ratio>1))return JSON.stringify({success:false,code:'INVALID_OBJECTIVE_HP',message:'Invalid objective HP report'});
    const killedEnemies = Math.max(0, Math.floor(Number(req.killed_enemies || 0)));
    const requestedBaseExp = Number(req.base_exp || 0);
    if (!stageId || !difficultyId || !heroId || !runId || !Number.isSafeInteger(requestedBaseExp) || requestedBaseExp < 0
        || !Number.isSafeInteger(killedEnemies) || killedEnemies > 10000) {
        return JSON.stringify({ success: false, message: "Invalid stage progression request" });
    }

    const stored = nk.storageRead([
        { collection: "player_profiles", key: "main", userId: ctx.userId },
		{ collection: "player_heroes", key: "states", userId: ctx.userId },
		{ collection: "player_inventory", key: "items", userId: ctx.userId },
		{ collection: "player_stage_runs", key: "active", userId: ctx.userId }
    ]);
    let profileObject: nkruntime.StorageObject | null = null;
    let heroesObject: nkruntime.StorageObject | null = null;
	let inventoryObject: nkruntime.StorageObject | null = null;
	let runObject: nkruntime.StorageObject | null = null;
    for (let i = 0; i < stored.length; i++) {
        if (stored[i].collection === "player_profiles") profileObject = stored[i];
        if (stored[i].collection === "player_heroes") heroesObject = stored[i];
		if (stored[i].collection === "player_inventory") inventoryObject = stored[i];
		if (stored[i].collection === "player_stage_runs") runObject = stored[i];
    }
	if (!profileObject || !heroesObject || !inventoryObject || !runObject) {
		return JSON.stringify({ success: false, message: "Player run state is incomplete" });
	}
	const run = progressionObject(runObject.value);
	if (String(run.run_id || "") !== runId || String(run.status || "") !== "active"
		|| String(run.stage_id || "") !== stageId || String(run.difficulty_id || "") !== difficultyId
		|| Date.now() > Number(run.expires_at_ms || 0)) {
		return JSON.stringify({ success: false, message: "Run validation failed" });
	}
	if (won && Date.now() - Number(run.started_at_ms || 0) < Math.max(0, Number(run.min_win_duration_ms || 0))) {
		return JSON.stringify({ success: false, message: "Victory reported before the server minimum run duration" });
	}

    const stageRows = nk.sqlQuery("SELECT exp_weight, is_boss, arc_id FROM game_stages WHERE id = $1", [stageId]);
	const difficultyRows = nk.sqlQuery("SELECT exp_multiplier, gold_reward, loot_table, boss_loot_table FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2", [stageId, difficultyId]);
    if (stageRows.length === 0 || difficultyRows.length === 0) return JSON.stringify({ success: false, message: "Unknown stage or difficulty" });
    const maxBaseExp = progressionMaxStageBaseExp(nk, stageId);
    if (requestedBaseExp > maxBaseExp) return JSON.stringify({ success: false, message: "Invalid stage EXP" });

    const profile = progressionObject(profileObject.value);
    const grade = sweepGrade(nk, Number(req.objective_hp_ratio), won);
    if(won) sweepSetBest(profile,stageId,difficultyId,grade);
    delete profile.activity;
    const heroesData = progressionObject(heroesObject.value);
    const heroes: any[] = Array.isArray(heroesData.heroes) ? heroesData.heroes : [];
	const inventoryValue = progressionObject(inventoryObject.value);
	const inventoryItems: any[] = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
    progressionMigrate(nk, profile, heroes);
    cultivationEnsureProfile(nk, profile, false);
    const awardedRuns: string[] = Array.isArray(profile._progression_run_ids) ? profile._progression_run_ids : [];
    if (awardedRuns.indexOf(runId) !== -1) return JSON.stringify({ success: false, message: "Run already rewarded" });
    let hero: any = null;
    for (let i = 0; i < heroes.length; i++) if (heroes[i] && String(heroes[i].hero_id || "") === heroId) hero = heroes[i];
    if (!hero || hero.owned !== true) return JSON.stringify({ success: false, message: "Hero is not owned" });

    const multiplier = Math.max(0, Number(stageRows[0].exp_weight || 1)) * Math.max(0, Number(difficultyRows[0].exp_multiplier || 1));
    const completed: any[] = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
    const firstClear = won && !completed.some((entry: any) => entry
        && String(entry.stage_id) === stageId && String(entry.level_id) === difficultyId);
    // The skill-testing arena may grant temporary run levels, never persistent EXP.
    const isTrainingStage = stageId === "stage_0_1" || String(stageRows[0].arc_id || "") === "arc_0";
    const ordinaryExp = isTrainingStage ? 0 : Math.max(0, Math.round(requestedBaseExp * multiplier));
    const firstClearBonusExp = firstClear ? ordinaryExp : 0;
    const expBoostMultiplier = progressionGameplayBoostMultiplier(profile, "exp");
    const awardedExp = Math.max(0, Math.round((ordinaryExp + firstClearBonusExp) * expBoostMultiplier));
    const boostedFirstClearBonusExp = Math.max(0, Math.round(firstClearBonusExp * expBoostMultiplier));
    const userResult = progressionApplyUser(nk, profile, awardedExp);
	cultivationEnsurePreview(nk, profile);
	["talent_tier", "talent_score", "main_element", "element_affinities", "affinity_flags",
	 "comprehension_points", "unlocked_laws", "breakthrough"].forEach((key: string) => { userResult[key] = profile[key]; });
	progressionReconcileLevelUnlocks(nk, profile);
	if (won) progressionCompleteStage(nk, profile, stageId, difficultyId);
    let heroLevel = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
    let heroExp = Math.max(0, Number(hero.exp || 0)) + awardedExp;
    let heroNext = progressionNextHeroExp(nk, heroLevel);
    let heroLevelsGained = 0;
    const heroCap = Math.min(PROGRESSION_MAX_LEVEL, userResult.level);
    while (heroLevel < heroCap && heroNext > 0 && heroExp >= heroNext) {
        heroExp -= heroNext;
        heroLevel++;
        heroLevelsGained++;
        heroNext = progressionNextHeroExp(nk, heroLevel);
    }
    if (heroLevel >= PROGRESSION_MAX_LEVEL) { heroExp = 0; heroNext = 0; }
    else heroExp = Math.min(heroExp, heroNext);
    hero.level = heroLevel;
    hero.exp = heroExp;
    hero.next_level_exp = heroNext;
	if (heroLevelsGained > 0) hero.current_attribute = progressionHeroAttributes(nk, heroId, heroLevel);
    awardedRuns.push(runId);
    profile._progression_run_ids = awardedRuns.slice(-100);

	// Durability settlement is derived from the server-issued run snapshot. The
	// client cannot choose the equipped item or the amount to subtract.
	let talismanDurability = 0;
	const snapshot = run.talisman && typeof run.talisman === "object" ? run.talisman : null;
	if (snapshot) {
		const equipped = inventoryItems.find((entry: any) => entry
			&& String(entry.instance_id || "") === String(snapshot.instance_id || "")
			&& String(entry.item_id || "") === String(snapshot.item_id || ""));
		if (equipped) {
			const config = talismanConfig(nk);
			const custom = Math.max(0, Math.floor(Number(snapshot.durability_cost_per_battle || 0)));
			const fallback = won ? Number(config.default_durability_loss_win || 3) : Number(config.default_durability_loss_loss || 6);
			const durabilityLoss = custom > 0 ? (won ? custom : custom * 2) : Math.max(0, Math.floor(fallback));
			equipped.durability = Math.max(0, Number(equipped.durability === undefined ? 100 : equipped.durability) - durabilityLoss);
			talismanDurability = Number(equipped.durability || 0);
		}
	}

	const loot: any[] = [];
    const goldBoostMultiplier = progressionGameplayBoostMultiplier(profile, "gold");
    if(won){
        const rewards=sweepRoll(sweepRewardTable(nk,stageId,difficultyId,stageRows[0],difficultyRows[0],grade));
        for(const reward of rewards){
			if (reward.resource_id === "gold") reward.quantity = Math.max(0, Math.round(Number(reward.quantity || 0) * goldBoostMultiplier));
            if(reward.item_id){
                if(!serverGrantInventoryItem(nk,inventoryItems,reward.item_id,reward.quantity))throw new Error('REWARD_ITEM_INVALID');
            }else if(reward.resource_id){
                profile.resources=progressionObject(profile.resources);
                profile.resources[reward.resource_id]=Number(profile.resources[reward.resource_id]||0)+reward.quantity;
            }
            loot.push({item_id:reward.item_id,resource_id:reward.resource_id,quantity:reward.quantity});
        }
    }
	inventoryValue.items = inventoryItems;
	run.status = "settled";
	run.settled_at_ms = Date.now();
	run.won = won;
	run.stage_reward = { eligible: won && !isTrainingStage && (awardedExp > 0 || loot.length > 0),
        hero_id: heroId, base_exp: awardedExp, first_clear_bonus_exp: boostedFirstClearBonusExp,
        base_loot: loot.slice(), claimed: false };
    if(won&&!isTrainingStage){
        const ticketLootStart = loot.length;
        const quantity=stageTicketQuantity(nk);
        if(quantity>0){if(!serverGrantInventoryItem(nk,inventoryItems,SWEEP_TICKET,quantity))throw new Error('SWEEP_TICKET_CONFIG_MISSING');loot.push({item_id:SWEEP_TICKET,quantity});}
        if(campaignFinalBossStage(stageId,stageRows[0].is_boss)&&Math.random()<Number(towerSweepConfig(nk).boss_ticket_rates[difficultyId]||0)){
            if(!serverGrantInventoryItem(nk,inventoryItems,TOWER_SWEEP_TICKET,1))throw Error('TOWER_TICKET_CONFIG_MISSING');
            loot.push({item_id:TOWER_SWEEP_TICKET,quantity:1});
        }
        // Result HUD uses stage_reward.total_loot after the initial loot event.
        // Persist ticket lines separately so summaries retain them without ads
        // multiplying or granting them a second time.
        run.stage_reward.fixed_loot = loot.slice(ticketLootStart);
    }

    nk.storageWrite([
        { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
		{ collection: "player_heroes", key: "states", userId: ctx.userId, value: { heroes }, permissionRead: 1, permissionWrite: 0, version: heroesObject.version },
		{ collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
		{ collection: "player_stage_runs", key: "active", userId: ctx.userId, value: run, permissionRead: 1, permissionWrite: 0, version: runObject.version }
    ]);
    if (won) {
        eventRecord(nk, ctx.userId, "stage_clear", 1, { stage_id: stageId, difficulty_id: difficultyId }, runId);
        eventRecord(nk, ctx.userId, "specific_stage_clear", 1, { stage_id: stageId, difficulty_id: difficultyId }, runId);
    }
    if (killedEnemies > 0) eventRecord(nk, ctx.userId, "enemy_kill", killedEnemies, { stage_id: stageId }, runId);
    eventRecord(nk, ctx.userId, "user_level_reached", Math.max(1, Number(profile.level || 1)), {}, runId);
    for (const reward of loot) {
        if (reward.item_id && Number(reward.quantity || 0) > 0) {
            eventRecord(nk, ctx.userId, "item_earned", Number(reward.quantity), { item_id: String(reward.item_id) }, `${runId}:${reward.item_id}`);
        }
    }
    if (typeof writePlayerLeaderboardRecords === "function") {
        try {
            writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
        } catch (_lbErr) { }
    }
    userResult.than_luan = profile.than_luan;
    userResult.unlocked_arcs = profile.unlocked_arcs;
    userResult.unlocked_stages = profile.unlocked_stages;
    userResult.completed_stage_levels = profile.completed_stage_levels;
    userResult.stage_grades=profile.stage_grades;
	return JSON.stringify({ success: true, grade, best_grade:(profile.stage_grades||{})[stageId+':'+difficultyId]||'', stage_reward: stageRewardSummary(run), exp_awarded: awardedExp, first_clear: firstClear,
		first_clear_bonus_exp: boostedFirstClearBonusExp, gameplay_boosts: {exp:expBoostMultiplier,gold:goldBoostMultiplier}, profile: userResult,
		inventory: inventoryValue, resources: profile.resources, loot, talisman_durability: talismanDurability, hero: {

        hero_id: heroId, level: heroLevel, exp: heroExp, next_level_exp: heroNext, levels_gained: heroLevelsGained,
        current_attribute: hero.current_attribute || {}
    }});
};

function stageRewardSummary(run: any): any {
    const snapshot = run.stage_reward || {};
    const factor = snapshot.claimed === true ? Number(snapshot.multiplier || 1) : 1;
    return { run_id: String(run.run_id || ""), eligible: snapshot.eligible === true, claimed: snapshot.claimed === true,
        multiplier: factor, total_exp: Math.max(0, Number(snapshot.base_exp || 0)) * factor,
        first_clear_bonus_exp: Math.max(0, Number(snapshot.first_clear_bonus_exp || 0)) * factor,
        total_loot: (Array.isArray(snapshot.base_loot) ? snapshot.base_loot : []).map((r: any) => Object.assign({}, r, { quantity: Number(r.quantity) * factor }))
            .concat((Array.isArray(snapshot.fixed_loot) ? snapshot.fixed_loot : []).map((r:any)=>Object.assign({},r))) };
}

function readSettledRewardRun(nk: nkruntime.Nakama, userId: string, runId: string): any {
    const rows = nk.storageRead([{collection: "player_stage_runs", key: "active", userId}]);
    if (!rows.length) return null;
    const run = rows[0].value;
    if (String(run.run_id || "") !== runId || run.status !== "settled" || run.won !== true
        || !run.stage_reward || run.stage_reward.eligible !== true) return null;
    return {object: rows[0], run};
}

function grantStageRewardMultiplier(nk: nkruntime.Nakama, userId: string, adSessionId: string, multiplier: number, limit: number): any {
    const sessions = nk.sqlQuery("SELECT context FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
    const context = sessions.length ? objectValue(parseJsonb(sessions[0].context)) : {};
    const stored = readSettledRewardRun(nk, userId, String(context.run_id || ""));
    if (!stored) return {granted: false, message: "Winning result is no longer available"};
    const run = stored.run, snapshot = run.stage_reward;
    if (snapshot.claimed) {
        if (snapshot.ad_session_id === adSessionId) return {granted: true, reward_type: "stage_reward_x2", stage_reward: stageRewardSummary(run)};
        // A different verified session lost the storage CAS race. It did not
        // grant rewards, so its reservation must not spend another daily use.
        nk.sqlExec("DELETE FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
        nk.sqlExec("UPDATE monetization_ad_rewards SET status='rejected' WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
        return {granted: false, message: "This victory already received its multiplier"};
    }
    if (!Number.isSafeInteger(multiplier) || multiplier < 2 || multiplier > 10 || limit <= 0) return {granted: false, message: "Reward multiplier config is disabled"};
    const rows = nk.storageRead([
        {collection: "player_profiles", key: "main", userId},
        {collection: "player_heroes", key: "states", userId},
        {collection: "player_inventory", key: "items", userId}
    ]);
    const p = rows.find((r: any) => r.collection === "player_profiles"), h = rows.find((r: any) => r.collection === "player_heroes"),
        inv = rows.find((r: any) => r.collection === "player_inventory");
    if (!p || !h || !inv) return {granted: false, message: "Player reward state missing"};
    const hero = (h.value.heroes || []).find((r: any) => String(r.hero_id) === snapshot.hero_id && r.owned === true);
    if (!hero) return {granted: false, message: "Reward hero is not owned"};
    const claim = reserveDailyRewardClaim(nk, userId, "stage_reward_x2_ad", adSessionId, limit);
    if (!claim) return {granted: false, message: "Daily victory reward quota reached"};
    const extraExp = Number(snapshot.base_exp) * (multiplier - 1);
    const profile = p.value;
    const userResult = progressionApplyUser(nk, profile, extraExp);
    cultivationEnsurePreview(nk, profile);
    progressionReconcileLevelUnlocks(nk, profile);
    let level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
    let exp = Math.max(0, Number(hero.exp || 0)) + extraExp;
    let next = progressionNextHeroExp(nk, level);
    const beforeLevel = level;
    while (level < Math.min(PROGRESSION_MAX_LEVEL, userResult.level) && next > 0 && exp >= next) {
        exp -= next; level++; next = progressionNextHeroExp(nk, level);
    }
    if (level >= PROGRESSION_MAX_LEVEL) { exp = 0; next = 0; }
    else exp = Math.min(exp, next);
    hero.level = level; hero.exp = exp; hero.next_level_exp = next;
    if (level > beforeLevel) hero.current_attribute = progressionHeroAttributes(nk, snapshot.hero_id, level);
    inv.value.items = Array.isArray(inv.value.items) ? inv.value.items : [];
    profile.resources = profile.resources || {};
    for (const reward of snapshot.base_loot) {
        const quantity = Number(reward.quantity) * (multiplier - 1);
        if (!Number.isSafeInteger(quantity) || quantity <= 0) throw Error("Invalid settled reward quantity");
        if (reward.item_id) addStoreInventoryItem(nk, inv.value.items, String(reward.item_id), quantity);
        else if (["gold", "gems"].indexOf(String(reward.resource_id)) >= 0) profile.resources[reward.resource_id] = Math.max(0, Number(profile.resources[reward.resource_id] || 0)) + quantity;
        else throw Error("Unknown settled reward");
    }
    snapshot.claimed = true; snapshot.multiplier = multiplier; snapshot.ad_session_id = adSessionId;
    nk.storageWrite([
        {collection: "player_profiles", key: "main", userId, value: profile, version: p.version, permissionRead: 1, permissionWrite: 0},
        {collection: "player_heroes", key: "states", userId, value: h.value, version: h.version, permissionRead: 1, permissionWrite: 0},
        {collection: "player_inventory", key: "items", userId, value: inv.value, version: inv.version, permissionRead: 1, permissionWrite: 0},
        {collection: "player_stage_runs", key: "active", userId, value: run, version: stored.object.version, permissionRead: 1, permissionWrite: 0}
    ]);
    return {granted: true, reward_type: "stage_reward_x2", reward_amount: multiplier, stage_reward: stageRewardSummary(run)};
}

const tribulationAction: nkruntime.RpcFunction = (
    ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string
): string => {
    let request: any = {};
    try { request = JSON.parse(payload || "{}"); } catch (_) { return JSON.stringify({ ok: false, message: "Invalid JSON" }); }
    const action = String(request.action || "");
    if (["start", "success", "fail"].indexOf(action) === -1) return JSON.stringify({ ok: false, message: "Invalid action" });
    const hpRatio = Number(request.hp_ratio || 0);
    if (!Number.isFinite(hpRatio) || hpRatio < 0 || hpRatio > 1) return JSON.stringify({ ok: false, message: "Invalid hp_ratio" });
	const encounterId = String(request.encounter_id || "");
	const durationMs = Math.floor(Number(request.duration_ms || 0));
	const wavesCleared = Math.floor(Number(request.waves_cleared || 0));
    const objects = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
    if (objects.length === 0) return JSON.stringify({ ok: false, message: "Player profile is missing" });
    const object = objects[0]; const profile = progressionObject(object.value);
    cultivationEnsureProfile(nk, profile, false);
    const level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
    const threshold = progressionNextUserExp(nk, level);
    const ready = isBreakthroughMilestone(level) && threshold > 0 && Number(profile.exp || 0) >= threshold;
    let state = profile.breakthrough;

    if (action === "start") {
        const block=sweepCombatError(profile);if(block)return JSON.stringify(block);
        const runs=nk.storageRead([{collection:'player_stage_runs',key:'active',userId:ctx.userId}]);
        if(runs.length&&runs[0].value.status==='active'&&Number(runs[0].value.expires_at_ms)>Date.now())return JSON.stringify({ok:false,success:false,code:'COMBAT_ACTIVE',message:'Combat is active'});
        if (!ready) return JSON.stringify({ ok: false, message: "Breakthrough is not ready" });
        if (state.in_tribulation === true) return JSON.stringify({ ok: false, message: "Tribulation is already in progress" });
        if (Number(state.milestone_level || 0) !== level) state = cultivationDefaultBreakthrough(state.history);
        state.milestone_level = level;
        if (state.count_rolled !== true) { state.tribulation_count = cultivationRollWaves(profile); state.count_rolled = true; }
        if (Number(state.attempts_left || 0) <= 0) return JSON.stringify({ ok: false, message: "No attempts remaining" });
		cultivationPhase2Encounter(state);
        const auraConfig=thanLuanConfig(nk);
        state.than_luan_snapshot=thanLuanBattleSnapshot(profile,auraConfig);
        state.in_tribulation = true; state.penalty_applied = false; profile.breakthrough = state;
        profile.activity={type:'combat',activity_id:state.encounter_id};
        nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: object.version }]);
        return JSON.stringify({ ok: true, outcome_success: false, attempts_left: state.attempts_left,
			tribulation_count: state.tribulation_count, than_luan_snapshot: state.than_luan_snapshot, encounter: { id: state.encounter_id, seed: state.encounter_seed, ruleset_version: state.ruleset_version, skill_set: state.skill_set, server_started_at: state.started_at }, profile });
    }

    if (state.in_tribulation !== true || Number(state.milestone_level || 0) !== level || !ready) {
        return JSON.stringify({ ok: false, message: "No active tribulation" });
    }
	if (encounterId === "" || encounterId !== String(state.encounter_id || "")) return JSON.stringify({ ok: false, message: "Invalid encounter" });
	if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 3600000) return JSON.stringify({ ok: false, message: "Invalid encounter duration" });
	if (action === "success" && (wavesCleared < Number(state.tribulation_count || 1) || wavesCleared > Number(state.tribulation_count || 1))) return JSON.stringify({ ok: false, message: "Invalid waves cleared" });
    state.in_tribulation = false;
    delete profile.activity;
    if (action === "fail") {
        state.failures = Math.max(0, Number(state.failures || 0)) + 1;
        state.attempts_left = Math.max(0, Number(state.attempts_left || CULTIVATION_MAX_ATTEMPTS) - 1);
        let penaltyApplied = false;
        if (state.attempts_left <= 0) {
            profile.exp = Math.max(0, Number(profile.exp || 0) - Math.round(threshold * 0.3));
            state.attempts_left = CULTIVATION_MAX_ATTEMPTS; state.penalty_applied = true; penaltyApplied = true;
        }
        nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
            permissionRead: 1, permissionWrite: 0, version: object.version }]);
        return JSON.stringify({ ok: true, outcome_success: false, old_level: level, new_level: level,
            attempts_left: state.attempts_left, penalty_applied: penaltyApplied, profile });
    }

    const waves = Math.max(1, Math.min(9, Number(state.tribulation_count || 1)));
    const failures = Math.max(0, Number(state.failures || 0));
    cultivationEnsureSources(profile);
    profile.level = Math.min(PROGRESSION_MAX_LEVEL, level + 1);
    profile.element_sources.growth_levels = profile.level;
    cultivationRebuildSources(profile);
    profile.exp = Math.max(0, Number(profile.exp || 0) - threshold);
    profile.next_level_exp = progressionNextUserExp(nk, profile.level);
    profile.progression_version = PROGRESSION_VERSION;
    const reward = cultivationReward(profile, waves, failures, hpRatio);
    const history = Array.isArray(state.history) ? state.history : [];
    history.push({ level: profile.level, waves, failures, gains: reward.gains });
    profile.breakthrough = cultivationDefaultBreakthrough(history);
    progressionReconcileLevelUnlocks(nk, profile);
    nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile,
        permissionRead: 1, permissionWrite: 0, version: object.version }]);
    if (typeof writePlayerLeaderboardRecords === "function") {
        try {
            writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
        } catch (_lbErr) { }
    }
    return JSON.stringify({ ok: true, outcome_success: true, old_level: level, new_level: profile.level,
        attempts_left: CULTIVATION_MAX_ATTEMPTS, penalty_applied: false, reward, profile });
};

// C186: separate from the disposable combat sandbox's identity gate.
function adminExpTestAllowed(ctx: nkruntime.Context, nk: nkruntime.Nakama): boolean {
    return !!ctx.userId && nk.sqlQuery("SELECT 1 FROM users WHERE id=$1::UUID AND LOWER(email) IN ($2,$3) AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 LIMIT 1",
        [ctx.userId,"lkvu92@gmail.com","lkvu921@gmail.com"]).length > 0;
}
const adminExpTestAccess: nkruntime.RpcFunction = (ctx,_logger,nk) =>
    JSON.stringify({success:true,allowed:adminExpTestAllowed(ctx,nk)});
const adminExpTest: nkruntime.RpcFunction = (ctx,_logger,nk,payload) => {
    const fail=(code:string)=>JSON.stringify({success:false,code});
    if(!adminExpTestAllowed(ctx,nk))return fail("FORBIDDEN");
    let req:any;try{req=JSON.parse(payload||"{}");}catch(_){return fail("INVALID_REQUEST");}
    if(!req||typeof req.hero_id!=="string")return fail("INVALID_REQUEST");
    const rows=nk.storageRead([{collection:"player_profiles",key:"main",userId:ctx.userId},
        {collection:"player_heroes",key:"states",userId:ctx.userId},
        {collection:"player_stage_runs",key:"active",userId:ctx.userId}]);
    const p=rows.find(r=>r.collection==="player_profiles"),h=rows.find(r=>r.collection==="player_heroes"),run=rows.find(r=>r.collection==="player_stage_runs");
    if(!p||!h)return fail("STATE_MISSING");
    if(p.value.activity || sweepActive(p.value) || (p.value.breakthrough||{}).in_tribulation===true || (run && run.value.status==="active"))return fail("ACTIVITY_ACTIVE");
    const hero=(h.value.heroes||[]).find((r:any)=>r.hero_id===req.hero_id&&r.owned===true);
    if(!hero)return fail("HERO_NOT_OWNED");
    const userLevel=Number(p.value.level),heroLevel=Number(hero.level);
    if(!Number.isSafeInteger(userLevel)||userLevel<1||userLevel>PROGRESSION_MAX_LEVEL||!Number.isSafeInteger(heroLevel)||heroLevel<1||heroLevel>PROGRESSION_MAX_LEVEL)return fail("STATE_INVALID");
    const level=Math.max(heroLevel,userLevel);
    const expTable:any=getRemoteConfigValue(nk,"game_play","exp_to_level",[]);
    if(!Array.isArray(expTable)||expTable.length<=level||!Number.isFinite(Number(expTable[level]))||Number(expTable[level])<=Number(expTable[level-1]))return fail("CONFIG_INVALID");
    const next=level>=PROGRESSION_MAX_LEVEL?0:progressionNextHeroExp(nk,level);
    const attrs=progressionHeroAttributes(nk,req.hero_id,level);
    if((level<PROGRESSION_MAX_LEVEL&&!(next>0))||!attrs||!Object.keys(attrs).length)return fail("CONFIG_INVALID");
    hero.level=level;hero.exp=0;hero.next_level_exp=next;hero.current_attribute=attrs;
    try{nk.storageWrite([
        {collection:"player_profiles",key:"main",userId:ctx.userId,value:p.value,version:p.version,permissionRead:1,permissionWrite:0},
        {collection:"player_heroes",key:"states",userId:ctx.userId,value:h.value,version:h.version,permissionRead:1,permissionWrite:0}]);}
    catch(_){return fail("STATE_CONFLICT");}
    return JSON.stringify({success:true,hero});
};

// C192: derive advanced modes from complete, authoritative arc catalogs.
function progressionArcModeRows(nk:nkruntime.Nakama):any[] {
    return nk.sqlQuery("SELECT s.id AS stage_id,s.arc_id,l.level_id FROM game_stages s JOIN game_stage_levels l ON l.stage_id=s.id ORDER BY s.arc_id,s.sort_order,l.sort_order",[]);
}
function progressionArcModeFromRows(profile:any,stageId:string,mode:string,rows:any[]):boolean {
    if(mode==='normal')return true;
    if(mode!=='epic'&&mode!=='legend')return false;
    const target=rows.find(r=>r.stage_id===stageId&&r.level_id===mode);
    if(!target)return false;
    if(target.arc_id==='arc_0')return true;
    if(!target.arc_id)return false;
    const arc=rows.filter(r=>r.arc_id===target.arc_id),normal=arc.filter(r=>r.level_id==='normal');
    if(!normal.length)return false;
    const completed=Array.isArray(profile.completed_stage_levels)?profile.completed_stage_levels:[];
    const all=(required:string)=>normal.every(stage=>arc.some(r=>r.stage_id===stage.stage_id&&r.level_id===required)&&completed.some((c:any)=>c.stage_id===stage.stage_id&&c.level_id===required));
    return all('normal')&&(mode==='epic'||all('epic'));
}
function progressionArcModeAllowed(nk:nkruntime.Nakama,profile:any,stageId:string,mode:string):boolean {
    return mode==='normal'||progressionArcModeFromRows(profile,stageId,mode,progressionArcModeRows(nk));
}
function progressionReconcileArcModes(nk:nkruntime.Nakama,profile:any):boolean {
    const rows=progressionArcModeRows(nk),stages=Array.isArray(profile.unlocked_stages)?profile.unlocked_stages:[];
    const before=JSON.stringify(stages);
    for(const row of rows.filter(r=>r.level_id==='normal'&&r.arc_id&&r.arc_id!=='arc_0')) {
        let entry=stages.find((s:any)=>String(s.stage_id||s)===row.stage_id);
        if(!entry&&progressionArcModeFromRows(profile,row.stage_id,'epic',rows)){
            entry={stage_id:row.stage_id,unlocked_levels:['normal']};stages.push(entry);
        }
        if(typeof entry==='string'){const index=stages.indexOf(entry);entry={stage_id:row.stage_id,unlocked_levels:['normal']};stages[index]=entry;}
        if(!entry||typeof entry!=='object')continue;
        entry.unlocked_levels=['normal',...['epic','legend'].filter(mode=>progressionArcModeFromRows(profile,row.stage_id,mode,rows))];
    }
    if(JSON.stringify(stages)===before)return false;
    profile.unlocked_stages=stages;return true;
}
