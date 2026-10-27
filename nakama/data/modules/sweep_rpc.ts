// C144. Durable sweep state lives in the same profile transaction as grants.
const SWEEP_TICKET = 'campaign_sweep_ticket';
const TOWER_SWEEP_TICKET = 'tower_sweep_ticket';
const TOWER_SWEEP_DEFAULTS:any={version:1,enabled:true,round_duration_ms:90000,max_rounds:100,stamina_cost:2,entry_cost:1,ticket_cost:1,boss_ticket_rates:{normal:0.05,epic:0.075,legend:0.1}};
function towerSweepConfig(nk:nkruntime.Nakama):any {
    const c=getRemoteConfigValue(nk,'system','tower_sweep',null);
    return towerSweepValidateConfig(c);
}
function towerSweepValidateConfig(c:any):any {
    if(!c||c.version!==1||typeof c.enabled!=='boolean'||!Number.isSafeInteger(c.round_duration_ms)||c.round_duration_ms<1000||!Number.isSafeInteger(c.max_rounds)||c.max_rounds<1||c.max_rounds>100||c.stamina_cost!==2||c.entry_cost!==1||c.ticket_cost!==1
        ||!c.boss_ticket_rates||['normal','epic','legend'].some(k=>!Number.isFinite(c.boss_ticket_rates[k])||c.boss_ticket_rates[k]<0||c.boss_ticket_rates[k]>1))throw Error('TOWER_SWEEP_CONFIG_INVALID');
    return c;
}
function towerRewardEntries(nk:nkruntime.Nakama,rewards:any[],profile:any,floor:number):any[] {
    if(!Array.isArray(rewards))throw Error('TOWER_REWARD_INVALID');
    return rewards.map(r=>{
        if(!r||['exp','gold','gems','item'].indexOf(r.kind)<0)throw Error('TOWER_REWARD_INVALID');
        if(r.kind==='exp'&&(!Number.isInteger(profile.level)||profile.level<1||profile.level>PROGRESSION_MAX_LEVEL))throw Error('TOWER_PROFILE_LEVEL_INVALID');
        const amount=r.kind==='exp'?Math.ceil(progressionNextUserExp(nk,Number(profile.level||1))*0.005*Number(profile.level||1)*floor/100/5000)*5000:Number(r.amount);
        if(!Number.isSafeInteger(amount)||amount<0||(r.kind==='item'&&!r.item_id))throw Error('TOWER_REWARD_INVALID');
        return Object.assign({},r,{amount,label:r.kind==='exp'?amount+' EXP':r.label});
    });
}
function towerSweepPreview(nk:nkruntime.Nakama,s:any,req:any):any {
    const c=towerSweepConfig(nk),floor=Number(req.floor);
    if(!c.enabled)throw Error('SWEEP_DISABLED');
    const tower=readContentConfig(nk,'trial_tower');
    if(!Number.isInteger(floor)||floor<1||floor>Number(tower.floor_count)||!s.t||floor>Number(s.tower.highest_cleared))throw Error('FLOOR_NOT_CLEARED');
    if(!(s.heroes.heroes||[]).some((h:any)=>h.hero_id===req.hero_id&&h.owned===true))throw Error('HERO_NOT_OWNED');
    const definition=tower.floors[floor-1];
    const entries=towerRewardEntries(nk,definition.repeat_rewards,s.profile,floor);
    const items=entries.filter(r=>r.kind!=='exp').map(r=>({item_id:r.kind==='item'?r.item_id:undefined,resource_id:r.kind==='item'?undefined:r.kind,quantity:r.amount,drop_rate:1}));
    const held=sweepActive(s.profile)?s.profile.sweep:null;
    return {sweep_type:'tower',floor,ticket_item_id:TOWER_SWEEP_TICKET,stamina_cost:2,entry_cost:1,items,exp:entries.filter(r=>r.kind==='exp').reduce((n,r)=>n+r.amount,0),modifiers:{exp:progressionGameplayBoostMultiplier(s.profile,'exp'),gold:progressionGameplayBoostMultiplier(s.profile,'gold')},round_duration_ms:c.round_duration_ms,
        max_rounds:Math.max(0,Math.min(c.max_rounds,sweepCount(s.inventory.items||[],TOWER_SWEEP_TICKET)-(held&&held.sweep_type==='tower'?held.reserved_tickets:0),Math.floor((Number(s.profile.stamina||0)-(held?held.reserved_stamina:0))/2),Number(s.tower.tickets||0)-(held?Number(held.reserved_entries||0):0))),arc_id:'tower',config:c};
}
const SWEEP_DEFAULTS: any = {version:1,enabled:true,round_duration_ms:90000,max_rounds:100,ticket_cost:1,stamina_cost:1,
    grades:[{grade:'S',above:0.9,multiplier:1},{grade:'A',above:0.8,multiplier:0.9},{grade:'B',above:0.7,multiplier:0.8},{grade:'C',above:0.6,multiplier:0.7},{grade:'D',above:-1,multiplier:0.6}],ticket_probabilities:[0.25,0.6,0.15]};
function sweepConfig(nk:nkruntime.Nakama):any {
    const c=getRemoteConfigValue(nk,'system','stage_sweep',null);
    return sweepValidateConfig(c);
}
function sweepValidateConfig(c:any):any {
    if(!c||!Array.isArray(c.grades)||c.grades.length!==5||!Number.isSafeInteger(c.round_duration_ms)||c.round_duration_ms<1000||!Number.isSafeInteger(c.max_rounds)||c.max_rounds<1||c.max_rounds>100||c.ticket_cost!==1||c.stamina_cost!==1)throw new Error('SWEEP_CONFIG_INVALID');
    if(c.version!==1||typeof c.enabled!=='boolean'||c.grades.some((r:any)=>!r||typeof r!=='object')||c.grades.map((r:any)=>r.grade).join(',')!=='S,A,B,C,D'||c.grades.some((r:any,index:number)=>!Number.isFinite(r.above)||!Number.isFinite(r.multiplier)||r.multiplier<=0||r.multiplier>1||(index<4&&(r.above<0||r.above>=1))||(index>0&&(r.above>=c.grades[index-1].above||r.multiplier>c.grades[index-1].multiplier)))||c.grades[4].above>=0||!Array.isArray(c.ticket_probabilities)||c.ticket_probabilities.length!==3||c.ticket_probabilities.some((p:any)=>!Number.isFinite(p)||p<0||p>1)||Math.abs(c.ticket_probabilities.reduce((a:number,b:number)=>a+b,0)-1)>0.000001)throw new Error('SWEEP_CONFIG_INVALID');
    return c;
}
function sweepGrade(nk:nkruntime.Nakama,ratio:number,won:boolean=true):string {
    if(!won)return '';
    if(!Number.isFinite(ratio)||ratio<0||ratio>1)throw new Error('INVALID_OBJECTIVE_HP');
    return sweepConfig(nk).grades.find((r:any)=>ratio>r.above).grade;
}
function sweepQuantity(nk:nkruntime.Nakama,row:any,grade:string,rules:any=null):number {
    const base=Math.max(0,Math.floor(Number(row.base_quantity===undefined?(row.max_qty===undefined?(row.quantity===undefined?row.min_qty:row.quantity):row.max_qty):row.base_quantity)||0));
    const rule=(rules||sweepConfig(nk)).grades.find((r:any)=>r.grade===grade);
    return base>0&&rule?Math.max(1,Math.floor(base*rule.multiplier)):0;
}
function sweepActive(profile:any):boolean {return !!profile.sweep&&['running','cancelling','blocked'].indexOf(profile.sweep.status)>=0;}
// Fence inventory-only actions on the profile so reservations cannot race a start.
function sweepResourceRuntime(base:nkruntime.Nakama,userId:string):nkruntime.Nakama {
    if(!userId)return base;
    if(typeof featureRuntime === "function")base=featureRuntime(base,userId);
    const runtime:any=Object.create(base);
    const observed:any={};
    const identity=(r:any)=>(r.userId||userId)+'/'+r.collection+'/'+r.key;
    runtime.storageRead=(refs:any[])=>{
        const rows=base.storageRead(refs);
        for(const ref of refs)observed[identity(ref)]='*';
        for(const row of rows)observed[identity(row)]=row.version;
        return rows;
    };
    runtime.storageWrite=(input:any[])=>{
        let writes=input.map((w:any)=>{
            if((w.collection==='player_profiles'||w.collection==='player_inventory')&&w.userId===userId&&!w.version){
                const version=observed[identity(w)];if(!version)throw new Error('RESOURCE_WRITE_REQUIRES_READ');
                return Object.assign({},w,{version});
            }
            return w;
        });
        const profileWrite=writes.find((w:any)=>w.collection==='player_profiles'&&w.key==='main'&&w.userId===userId);
        const inventoryWrite=writes.find((w:any)=>w.collection==='player_inventory'&&w.key==='items'&&w.userId===userId);
        if(profileWrite||inventoryWrite){
            const rows=base.storageRead([{collection:'player_profiles',key:'main',userId}]);
            if(rows.length){
                const old=parseJsonObject(rows[0].value),next=profileWrite?parseJsonObject(profileWrite.value):old;
                if(sweepActive(old)||sweepActive(next)){
                    if(profileWrite&&!profileWrite.version)profileWrite.version=rows[0].version;
                    if(!profileWrite)writes.push({collection:'player_profiles',key:'main',userId,value:old,version:rows[0].version,permissionRead:1,permissionWrite:0});
                    const held=sweepActive(next)?next.sweep:null;
                    if(held&&Number(next.stamina||0)<Number(held.reserved_stamina||0))throw new Error('STAMINA_RESERVED');
                    if(held&&inventoryWrite&&sweepCount(parseJsonObject(inventoryWrite.value).items||[],held.sweep_type==='tower'?TOWER_SWEEP_TICKET:SWEEP_TICKET)<Number(held.reserved_tickets||0))throw new Error('TICKETS_RESERVED');
                }else if(inventoryWrite&&!profileWrite){
                    // Even before the first sweep, serialize a consumption with start.
                    writes.push({collection:'player_profiles',key:'main',userId,value:old,version:rows[0].version,permissionRead:1,permissionWrite:0});
                }
            }
        }
        const acks=base.storageWrite(writes);
        for(const ack of acks)observed[identity(ack)]=ack.version;
        return acks;
    };
    return runtime;
}
function sweepCombatError(profile:any):any {return sweepActive(profile)?{success:false,ok:false,code:'SWEEP_ACTIVE',message:'Đang càn quét. Hãy kết thúc hoặc hủy càn quét để tham chiến.'}:null;}
function sweepSetBest(profile:any,stage:string,mode:string,grade:string):void {
    if(!grade)return;const order=['D','C','B','A','S'];profile.stage_grades=profile.stage_grades||{};
    const key=stage+':'+mode;if(order.indexOf(grade)>order.indexOf(profile.stage_grades[key]))profile.stage_grades[key]=grade;
}
function sweepCount(items:any[],ticket:string=SWEEP_TICKET):number {return items.reduce((n:number,r:any)=>n+(r.item_id===ticket?Math.max(0,Number(r.quantity)||0):0),0);}
function sweepStaminaTime(p:any,nowMs:number):number {
    const session=p.sweep;
    if(!session||['running','cancelling'].indexOf(session.status)<0)return nowMs;
    return Math.min(nowMs,Number(session.next_due_at_ms),session.cancel_at_ms===undefined?nowMs:Number(session.cancel_at_ms));
}
function sweepRefreshStamina(nk:nkruntime.Nakama,p:any,now:number):void {
    const sec=Math.max(Number(p.last_stamina_update||0),Math.floor(sweepStaminaTime(p,now)/1000)),interval=Number(getRemoteConfigValue(nk,'system','stamina_regen_interval_sec',300)),amount=Number(getRemoteConfigValue(nk,'system','stamina_regen_amount',1));
    if(!Number.isFinite(interval)||interval<=0||!Number.isFinite(amount)||amount<0)throw new Error('STAMINA_CONFIG_INVALID');
    const last=Number(p.last_stamina_update||sec),current=staminaClamp(nk,p.stamina),ticks=Math.max(0,Math.floor((sec-last)/interval));
    const max=staminaMax(nk);if(current<max&&ticks>0){p.stamina=Math.min(max,current+ticks*amount);p.last_stamina_update=p.stamina>=max?sec:last+ticks*interval;}else if(current>=max||!p.last_stamina_update)p.last_stamina_update=sec;
}
function sweepRead(nk:nkruntime.Nakama,userId:string,nowMs:number=Date.now()):any {
    const rows=nk.storageRead(['player_profiles','player_inventory','player_heroes','player_stage_runs','player_trial_tower'].map(collection=>({collection,key:collection==='player_profiles'||collection==='player_trial_tower'?'main':collection==='player_inventory'?'items':collection==='player_heroes'?'states':'active',userId})));
    const get=(c:string)=>rows.find(r=>r.collection===c);
    const p=get('player_profiles'),i=get('player_inventory'),h=get('player_heroes'),r=get('player_stage_runs');
    if(!p||!i||!h)throw new Error('PLAYER_INCOMPLETE');
    const profile=parseJsonObject(p.value);sweepRefreshStamina(nk,profile,nowMs);
    const t=get('player_trial_tower');
    return {p,i,h,r,t,tower:t?parseJsonObject(t.value):{},profile,inventory:parseJsonObject(i.value),heroes:parseJsonObject(h.value)};
}
function sweepWrite(nk:nkruntime.Nakama,userId:string,s:any,full:boolean):void {
    const writes:any[]=[{collection:'player_profiles',key:'main',userId,value:s.profile,version:s.p.version,permissionRead:1,permissionWrite:0}];
    if(full)writes.push({collection:'player_inventory',key:'items',userId,value:s.inventory,version:s.i.version,permissionRead:1,permissionWrite:0},{collection:'player_heroes',key:'states',userId,value:s.heroes,version:s.h.version,permissionRead:1,permissionWrite:0});
    if(s.extraWrites)writes.push.apply(writes,s.extraWrites);
    if(s.towerDirty&&s.t)writes.push({collection:'player_trial_tower',key:'main',userId,value:s.tower,version:s.t.version,permissionRead:0,permissionWrite:0});
    nk.storageWrite(writes);
}
// C221: display levels 51–60 do not change the account/hero level cap.
// The sixth campaign final shares the existing final-boss reward rules.
function campaignFinalBossStage(stage:string,isBoss:boolean):boolean {
    return isBoss===true&&/^stage_[1-6]_10$/.test(stage);
}
function sweepRewardTable(nk:nkruntime.Nakama,stage:string,mode:string,stageRow:any,level:any,grade:string,rules:any=null):any[] {
    const boss=parseJsonb(level.boss_loot_table)||[],normal=parseJsonb(level.loot_table)||[];
    const table=(stageRow.is_boss&&boss.length?boss:normal).filter((r:any)=>r.item_id!==SWEEP_TICKET&&r.item_id!==TOWER_SWEEP_TICKET&&r.resource_id!=='gold');
    const items=table.map((r:any)=>Object.assign({},r,{quantity:sweepQuantity(nk,r,grade,rules)})).filter((r:any)=>r.quantity>0);
    if(mode==='legend'&&campaignFinalBossStage(stage,stageRow.is_boss)){
        const arcs=nk.sqlQuery('SELECT element FROM game_arcs WHERE id = $1',[stageRow.arc_id]);
        const element=arcs.length?String(arcs[0].element||''):'';
        const mixed=stageRow.arc_id==='arc_ngu_to_quy_khu';
        for(const tier of [{name:'Hạ phẩm',weight:0.85},{name:'Trung phẩm',weight:0.15}]){
            const candidates=nk.sqlQuery('SELECT id, element FROM game_talismans WHERE tier = $1 ORDER BY id',[tier.name]);
            const match=candidates.filter((r:any)=>String(r.element||'')===element),other=candidates.filter((r:any)=>String(r.element||'')!==element);
            const elementCounts:any={};
            if(mixed)for(const row of candidates){const key=String(row.element||'');elementCounts[key]=(elementCounts[key]||0)+1;}
            for(const row of candidates){
                const same=String(row.element||'')===element;
                const weight=mixed?tier.weight/Object.keys(elementCounts).length/elementCounts[String(row.element||'')]
                    :tier.weight*(same?(other.length?0.75:1):(match.length?0.25:1))/(same?match.length:other.length);
                items.push({item_id:'talisman_fragment_'+Number(row.id),quantity:sweepQuantity(nk,{base_quantity:3},grade,rules),group:'fragment',group_drop_rate:0.7,weight,drop_rate:weight});
            }
        }
    }
    const gold=sweepQuantity(nk,{base_quantity:Number(level.gold_reward||0)},grade,rules);if(gold)items.push({resource_id:'gold',quantity:gold,drop_rate:1});
    return items;
}
// Presentation snapshot shares the actual completion table; never used to grant.
function stageCompletionLoot(nk:nkruntime.Nakama,stage:any,level:any,ticketProbabilities?:number[],rules:any=null):any[] {
    if(stage.arc_id==='arc_0'||stage.id==='stage_0_admin_test')return [];
    const items=sweepRewardTable(nk,stage.id,level.level_id,stage,level,'S',rules);
    for(const line of items) {
        if(line.group==='fragment') {
            const total=items.filter((r:any)=>r.group==='fragment').reduce((sum:number,r:any)=>sum+Number(r.weight||0),0);
            line.drop_rate=Number(line.group_drop_rate)*Number(line.weight)/total;
        }
    }
    const probabilities=ticketProbabilities||sweepConfig(nk).ticket_probabilities;
    items.unshift({item_id:SWEEP_TICKET,min_qty:0,max_qty:2,drop_rate:probabilities[1]+probabilities[2],ordinary_combat_only:true,
        quantity_outcomes:probabilities.map((probability:number,quantity:number)=>({quantity,probability}))});
    if(campaignFinalBossStage(String(stage.id),stage.is_boss)){const rate=towerSweepConfig(nk).boss_ticket_rates[level.level_id];if(rate!==undefined)items.push({item_id:TOWER_SWEEP_TICKET,min_qty:1,max_qty:1,drop_rate:rate,ordinary_combat_only:true});}
    return items;
}
function stageTicketQuantity(nk:nkruntime.Nakama,roll:number=Math.random()):number {
    const probabilities=sweepConfig(nk).ticket_probabilities;
    return roll<probabilities[0]?0:(roll<probabilities[0]+probabilities[1]?1:2);
}
function sweepPreviewData(nk:nkruntime.Nakama,s:any,req:any):any {
    if(req.sweep_type==='tower')return towerSweepPreview(nk,s,req);
    const c=sweepConfig(nk),stage=String(req.stage_id||''),mode=String(req.level_id||'');
    if(!c.enabled)throw new Error('SWEEP_DISABLED');
    if(!s.profile.stage_grades||s.profile.stage_grades[stage+':'+mode]!=='S')throw new Error('STAGE_S_REQUIRED');
    const heroes=s.heroes.heroes||[];if(!heroes.some((h:any)=>h.hero_id===req.hero_id&&h.owned===true))throw new Error('HERO_NOT_OWNED');
    const stages=nk.sqlQuery('SELECT exp_weight, is_boss, arc_id FROM game_stages WHERE id = $1',[stage]);
    const levels=nk.sqlQuery('SELECT exp_multiplier, gold_reward, loot_table, boss_loot_table FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2',[stage,mode]);
    if(!stages.length||!levels.length||stages[0].arc_id==='arc_0'||stage==='stage_0_admin_test'||['normal','epic','legend'].indexOf(mode)<0)throw new Error('INVALID_STAGE');
    if(!progressionArcModeAllowed(nk,s.profile,stage,mode))throw new Error('ARC_MODE_LOCKED');
    const level=levels[0],items=sweepRewardTable(nk,stage,mode,stages[0],level,'S');
    const exp=Math.max(0,Math.round(progressionMaxStageBaseExp(nk,stage)*Number(stages[0].exp_weight||1)*Number(level.exp_multiplier||1)));
    const held=sweepActive(s.profile)?Number(s.profile.sweep.reserved_tickets||0):0;
    const staminaHeld=sweepActive(s.profile)?Number(s.profile.sweep.reserved_stamina||0):0;
    return {items,exp,modifiers:{exp:progressionGameplayBoostMultiplier(s.profile,'exp'),gold:progressionGameplayBoostMultiplier(s.profile,'gold')},round_duration_ms:c.round_duration_ms,max_rounds:Math.max(0,Math.min(c.max_rounds,sweepCount(s.inventory.items||[])-held,Math.floor(Number(s.profile.stamina||0))-staminaHeld)),arc_id:stages[0].arc_id,is_boss:stages[0].is_boss,config:c};
}
function sweepRoll(items:any[]):any[] {
    const rune=(r:any)=>r.group==='rune'||String(r.item_id||'').indexOf('stone_')===0||String(r.item_id||'').indexOf('rune_')===0;
    const out=items.filter(r=>!rune(r)&&r.group!=='fragment'&&Math.random()<Math.max(0,Math.min(1,Number(r.drop_rate||0)))).map(r=>Object.assign({},r));
    for(const group of [items.filter(rune),items.filter(r=>r.group==='fragment')]){
        // Preserve the legacy 70% fragment drop chance; only its quantity stops rolling.
        if(group.length&&group[0].group_drop_rate!==undefined&&Math.random()>=Number(group[0].group_drop_rate))continue;
        const total=group.reduce((n:number,r:any)=>n+Math.max(0,Number(r.weight||r.drop_rate||0)),0);let roll=Math.random()*total;
        if(total>0)for(const r of group){roll-=Math.max(0,Number(r.weight||r.drop_rate||0));if(roll<=0){out.push(Object.assign({},r));break;}}
    }
    return out;
}
function sweepProcess(nk:nkruntime.Nakama,userId:string,logger:nkruntime.Logger,nowMs:number=Date.now(),limit:number=4,atomicState:any=null):any {
    for(let index=0;index<(atomicState?100:Math.min(8,Math.max(1,limit)));index++) {
        const s=atomicState||sweepRead(nk,userId,nowMs),session=s.profile.sweep;if(!sweepActive(s.profile)||session.status==='blocked')return session||null;
        const cutoff=atomicState?Infinity:(session.cancel_at_ms===undefined?nowMs:Math.min(nowMs,session.cancel_at_ms));
        if(session.next_due_at_ms>cutoff||session.completed_rounds>=session.total_rounds) {
            if(session.cancel_at_ms!==undefined||session.completed_rounds>=session.total_rounds){session.status=session.cancel_at_ms!==undefined?'cancelled':'completed';session.reserved_tickets=0;session.reserved_stamina=0;session.reserved_entries=0;session.state_version++;delete s.profile.activity;sweepRefreshStamina(nk,s.profile,nowMs);sweepWrite(nk,userId,s,false);}
            return session;
        }
        const towerMode=session.sweep_type==='tower',ticket=towerMode?TOWER_SWEEP_TICKET:SWEEP_TICKET,staminaCost=towerMode?2:1;
        const items=s.inventory.items||[],held=sweepCount(items,ticket);
        if(held<1||Number(s.profile.stamina||0)<staminaCost||(towerMode&&(!s.t||Number(s.tower.tickets||0)<1)))throw new Error('RESERVATION_CORRUPTED');
        let debit=1;for(let k=items.length-1;k>=0&&debit;k--){if(items[k].item_id!==ticket)continue;const n=Math.min(debit,Number(items[k].quantity));items[k].quantity-=n;debit-=n;if(items[k].quantity<=0)items.splice(k,1);}
        s.profile.stamina-=staminaCost;
        if(towerMode){s.tower.tickets--;s.towerDirty=true;session.reserved_entries--;}
        const modifiers=session.config_snapshot.modifiers||{exp:1,gold:1};
        const rewards=sweepRoll(session.config_snapshot.items).map((r:any)=>r.resource_id==='gold'?Object.assign({},r,{quantity:Math.floor(r.quantity*modifiers.gold)}):r);
        for(const reward of rewards){if(reward.item_id){if(!serverGrantInventoryItem(nk,items,reward.item_id,reward.quantity))throw new Error('REWARD_ITEM_INVALID');}else if(reward.resource_id){s.profile.resources=s.profile.resources||{};s.profile.resources[reward.resource_id]=Number(s.profile.resources[reward.resource_id]||0)+reward.quantity;}}
        const heroes=s.heroes.heroes||[],hero=heroes.find((h:any)=>h.hero_id===session.hero_id&&h.owned===true);if(!hero)throw new Error('HERO_NOT_OWNED');
        progressionMigrate(nk,s.profile,heroes);
        const baseExp=towerMode?Math.ceil(progressionNextUserExp(nk,Number(s.profile.level||1))*0.005*Number(s.profile.level||1)*Number(session.floor)/100/5000)*5000:session.config_snapshot.exp;
        const exp=Math.floor(baseExp*modifiers.exp);
        progressionApplyUser(nk,s.profile,exp);progressionReconcileLevelUnlocks(nk,s.profile);
        let level=Number(hero.level||1),xp=Number(hero.exp||0)+exp,next=progressionNextHeroExp(nk,level);
        while(level<Math.min(PROGRESSION_MAX_LEVEL,s.profile.level)&&next>0&&xp>=next){xp-=next;level++;next=progressionNextHeroExp(nk,level);}
        hero.level=level;hero.exp=level>=PROGRESSION_MAX_LEVEL?0:Math.min(xp,next);hero.next_level_exp=level>=PROGRESSION_MAX_LEVEL?0:next;hero.current_attribute=progressionHeroAttributes(nk,session.hero_id,level);
        session.completed_rounds++;session.reserved_tickets--;session.reserved_stamina-=staminaCost;session.state_version++;
        session.receipts.push({round_index:session.completed_rounds,receipt_id:session.session_id+':'+session.completed_rounds,completed_at_ms:atomicState?nowMs:session.next_due_at_ms,loot:rewards,exp});
        session.next_due_at_ms=session.started_at_ms+(session.completed_rounds+1)*session.config_snapshot.round_duration_ms;
        if(session.completed_rounds===session.total_rounds||(session.cancel_at_ms!==undefined&&session.next_due_at_ms>session.cancel_at_ms)){session.status=session.cancel_at_ms!==undefined?'cancelled':'completed';session.reserved_tickets=0;session.reserved_stamina=0;session.reserved_entries=0;delete s.profile.activity;}
        if(!sweepActive(s.profile))sweepRefreshStamina(nk,s.profile,nowMs);
        s.inventory.items=items;if(!atomicState)sweepWrite(nk,userId,s,true);
        try{nk.notificationSend(userId,'Càn quét',{session_id:session.session_id,state_version:session.state_version,status:session.status},144,null,false);}catch(e){if(logger)logger.warn('Sweep notification deferred: %s',String(e));}
        if(!sweepActive(s.profile))return session;
    }
    return sweepRead(nk,userId,nowMs).profile.sweep;
}
function sweepInstantQuote(session:any,now:number=Date.now()):any {
    const remaining=session&&session.status==='running'?Math.max(0,session.total_rounds-Math.max(session.completed_rounds,Math.floor((now-session.started_at_ms)/session.config_snapshot.round_duration_ms))):0;
    return {unit_cost_gems:5,remaining_rounds:remaining,cost_gems:remaining*5};
}
function sweepResponse(s:any,extra:any={}):string {return JSON.stringify(Object.assign({success:true,instant_finish:sweepInstantQuote(s.profile.sweep),session:s.profile.sweep||null,server_time_ms:Date.now(),profile:s.profile,inventory:s.inventory,heroes:s.heroes.heroes||[]},extra));}
function sweepRpc(handler:any):nkruntime.RpcFunction {return (ctx,logger,nk,payload)=>{try{return handler(ctx,logger,nk,JSON.parse(payload||'{}'));}catch(e){return JSON.stringify({success:false,code:String(e).replace(/^Error: /,''),message:String(e),server_time_ms:Date.now()});}};}
const getSweepOptions=sweepRpc((ctx:any,_logger:any,nk:any)=>{
    const s=sweepRead(nk,ctx.userId),c=sweepConfig(nk),options:any[]=[];
    for(const key of Object.keys(s.profile.stage_grades||{})){if(s.profile.stage_grades[key]!=='S')continue;const split=key.lastIndexOf(':'),stage=key.slice(0,split),mode=key.slice(split+1);const rows=nk.sqlQuery('SELECT id, arc_id, is_boss FROM game_stages WHERE id = $1',[stage]);if(rows.length&&rows[0].arc_id!=='arc_0'&&stage!=='stage_0_admin_test'&&['normal','epic','legend'].indexOf(mode)>=0)options.push({stage_id:stage,level_id:mode,arc_id:rows[0].arc_id,is_boss:rows[0].is_boss});}
    const held=sweepActive(s.profile)?s.profile.sweep.reserved_tickets:0;
    return sweepResponse(s,{options,available_tickets:Math.max(0,sweepCount(s.inventory.items||[])-held),available_stamina:Math.max(0,Number(s.profile.stamina||0)-(sweepActive(s.profile)?s.profile.sweep.reserved_stamina:0)),max_rounds:c.max_rounds});
});
const previewSweep=sweepRpc((ctx:any,logger:any,nk:any,req:any)=>{if(req.sweep_type==='tower'){const status=JSON.parse(trialTowerStatus(ctx,logger,nk,'{}'));if(!status.success)return JSON.stringify(status);}const s=sweepRead(nk,ctx.userId);return sweepResponse(s,{preview:sweepPreviewData(nk,s,req)});});
const startSweep=sweepRpc((ctx:any,_logger:any,nk:any,req:any)=>{
    if(req.sweep_type==='tower'){const status=JSON.parse(trialTowerStatus(ctx,_logger,nk,'{}'));if(!status.success)return JSON.stringify(status);}
    const s=sweepRead(nk,ctx.userId),old=s.profile.sweep;
    if(typeof req.request_id!=='string'||!/^[a-zA-Z0-9_-]{8,60}$/.test(req.request_id))throw new Error('INVALID_REQUEST_ID');
    const fingerprint=JSON.stringify(req.sweep_type==='tower'?['tower',req.floor,req.hero_id,req.rounds]:[req.stage_id,req.level_id,req.hero_id,req.rounds]),requestKey='sweep_'+req.request_id;
    const requestRows=nk.storageRead([{collection:'player_item_requests',key:requestKey,userId:ctx.userId}]);
    if(requestRows.length){if(requestRows[0].value.fingerprint!==fingerprint)throw new Error('REQUEST_CONFLICT');return sweepResponse(s,{duplicate:true,request_session_id:requestRows[0].value.session_id});}
    if(old&&old.request_id===req.request_id)return sweepResponse(s);
    if((s.profile.sweep_request_ids||[]).indexOf(req.request_id)>=0)throw new Error('REQUEST_ALREADY_COMPLETED');
    if(sweepActive(s.profile))throw new Error('SWEEP_ACTIVE');
    const run=s.r?parseJsonObject(s.r.value):{};
    if((run.status==='active'&&Number(run.expires_at_ms)>Date.now())||(s.profile.breakthrough||{}).in_tribulation===true)throw new Error('COMBAT_ACTIVE');
    const preview=sweepPreviewData(nk,s,req),rounds=Number(req.rounds);
    if(!Number.isSafeInteger(rounds)||rounds<1||rounds>preview.max_rounds)throw new Error('INSUFFICIENT_TICKETS_OR_STAMINA');
    const now=Date.now();s.profile.sweep={session_id:nk.uuidv4(),request_id:req.request_id,stage_id:req.stage_id,level_id:req.level_id,hero_id:req.hero_id,arc_id:preview.arc_id,is_boss:preview.is_boss,total_rounds:rounds,completed_rounds:0,started_at_ms:now,next_due_at_ms:now+preview.round_duration_ms,status:'running',reserved_tickets:rounds,reserved_stamina:rounds,config_snapshot:preview,state_version:1,receipts:[]};
    if(req.sweep_type==='tower')Object.assign(s.profile.sweep,{sweep_type:'tower',floor:req.floor,stage_id:'stage_trial_tower',level_id:'floor_'+req.floor,reserved_entries:rounds,reserved_stamina:rounds*2});
    s.profile.activity={type:'sweeping',activity_id:s.profile.sweep.session_id};s.profile.sweep_request_ids=(s.profile.sweep_request_ids||[]).concat([req.request_id]).slice(-100);
    s.extraWrites=[{collection:'player_item_requests',key:requestKey,userId:ctx.userId,value:{fingerprint,session_id:s.profile.sweep.session_id,created_at:now},version:'*',permissionRead:0,permissionWrite:0}];
    sweepWrite(nk,ctx.userId,s,false);return sweepResponse(s);
});
const getSweepStatus=sweepRpc((ctx:any,logger:any,nk:any)=>{sweepProcess(nk,ctx.userId,logger);return sweepResponse(sweepRead(nk,ctx.userId));});
const cancelSweep=sweepRpc((ctx:any,logger:any,nk:any,req:any)=>{
    const s=sweepRead(nk,ctx.userId),session=s.profile.sweep;if(!session||session.session_id!==req.session_id)throw new Error('SESSION_NOT_FOUND');
    // A permanently invalid reward snapshot cannot be settled. Preserve every
    // committed receipt and release only the uncharged, failed remainder.
    if(session.status==='blocked'){
        session.cancel_at_ms=Date.now();session.status='cancelled';session.reserved_tickets=0;session.reserved_stamina=0;session.reserved_entries=0;session.state_version++;delete s.profile.activity;sweepWrite(nk,ctx.userId,s,false);return sweepResponse(s);
    }
    if(sweepActive(s.profile)&&session.cancel_at_ms===undefined){session.cancel_at_ms=Date.now();session.status='cancelling';session.state_version++;sweepWrite(nk,ctx.userId,s,false);}
    sweepProcess(nk,ctx.userId,logger);return sweepResponse(sweepRead(nk,ctx.userId));
});

const finishSweep=sweepRpc((ctx:any,logger:any,nk:any,req:any)=>{
    const now=Date.now(),s=sweepRead(nk,ctx.userId,now),session=s.profile.sweep;
    if(!session||session.session_id!==req.session_id)throw new Error('SESSION_NOT_FOUND');
    if(session.status==='completed')return sweepResponse(s,{duplicate:true});
    if(session.status!=='running'||session.cancel_at_ms!==undefined)throw new Error('SWEEP_NOT_RUNNING');
    const quote=sweepInstantQuote(session,now);
    if(!Number.isSafeInteger(req.max_cost_gems)||req.max_cost_gems<quote.cost_gems)throw new Error('PRICE_CHANGED');
    const gems=Number((s.profile.resources||{}).gems||0);
    if(gems<quote.cost_gems)throw new Error('INSUFFICIENT_GEMS');
    s.profile.resources=s.profile.resources||{};s.profile.resources.gems=gems-quote.cost_gems;
    sweepProcess(nk,ctx.userId,logger,now,100,s);
    if(session.status!=='completed')throw new Error('SWEEP_FINISH_FAILED');
    session.instant_finish={cost_gems:quote.cost_gems,paid_rounds:quote.remaining_rounds,finished_at_ms:now};
    sweepWrite(nk,ctx.userId,s,true);
    return sweepResponse(s);
});
