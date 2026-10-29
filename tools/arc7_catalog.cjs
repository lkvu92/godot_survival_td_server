/* C237: deterministic Arc7 catalog; no runtime RNG, profile or live DB writes. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {getWaveExp}=require('./campaign_wave_exp.cjs');
const progression=require('./arc7_progression.cjs');
const {applySpawnFormation}=require('./campaign_spawn_formation.cjs');
const {rebalanceWaveExp}=require('./campaign_wave_exp.cjs');
const ARC='arc_van_yeu_co_linh',VERSION=1,SEED=70261029;
const ELEMENTS=['metal','water','wood','fire','earth'];
const SPECIES=[
 ['pha_son_cu_vien','Phá Sơn Cự Viên','C01','beast_melee',2600,200,25,78,70,.58],
 ['huyet_man_cuong_su','Huyết Man Cuồng Sư','C02','beast_melee',2100,185,18,95,65,.72],
 ['co_giap_long_te','Cổ Giáp Long Tê','C03','beast_dash',4400,250,48,65,170,.42],
 ['doc_tich_man_ngac','Độc Tích Man Ngạc','C04','beast_bolt',1500,160,12,65,330,.48],
 ['loi_trao_hung_bi','Lôi Trảo Hùng Bi','C05','beast_melee',3000,230,32,72,80,.48],
 ['huyen_lan_long_bao','Huyền Lân Long Báo','C06','beast_dash',1800,175,15,110,195,.65],
 ['man_cot_toan_nghe','Man Cốt Toan Nghê','C07','beast_bolt',1800,190,23,70,350,.42],
];
const BOSSES=['bach_ho_yeu_vuong','chu_tuoc_nu_vuong'];
const BLOODLINE_DEFINITION={id:'beast_bloodline',display_name:'Cổ Huyết Bạo Thể',description:'Một lần khi HP thấp: tăng sát thương và tốc độ di chuyển; không hồi máu.',params:{hp_below_pct:.3,atk_multiplier:1.35,move_speed_multiplier:1.15,max_triggers:1,duration_seconds:null,manual_activation:false}};
const NAMES=['Cổ Lĩnh Ngoại Vi','Tử Chướng U Lâm','Huyết Ngân Thú Đạo','Cự Cốt Sơn Khê','Bạch Hổ Vương Đình','Yêu Mạch Thâm Lâm','Vạn Cốt Huyết Địa','Liệt Vũ Cổ Thụ','Xích Hà Cấm Lĩnh','Chu Tước Huyết Sào'];
const clone=x=>JSON.parse(JSON.stringify(x)),round=x=>Math.round(x*1e6)/1e6;
const stageId=i=>`stage_7_${String(i).padStart(2,'0')}`;
const variant=(id,e)=>`arc7_${id}_${e}`;
function rng(seed){let v=seed>>>0;return()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
function bloodline(manual=false){return {id:'beast_bloodline',display_name:'Cổ Huyết Bạo Thể',params:{hp_below_pct:.3,atk_multiplier:1.35,move_speed_multiplier:1.15,max_triggers:1,duration_seconds:null,manual_activation:manual}};}
function skill(id,type,radius,mult,extra={}){return {id,type,display_name:{C01:'Phá Nham Quyền',C02:'Huyết Nha Phệ',C03:'Thiết Giác Xung',C04:'Chướng Độc Thóa',C05:'Lôi Liệt Trảo',C06:'Huyền Ảnh Tập',C07:'Cốt Khí Phá',B01:'Bạch Kim Hổ Trảo',B02:'Liệp Ảnh Vồ Sát',B03:'Hổ Khiếu Chấn Lĩnh',B04:'Bạo Thể · Vạn Yêu Phục',Z01:'Xích Vũ Liên Châu',Z02:'Liệt Dực Hoành Tảo',Z03:'Thiên Vũ Lạc Hỏa',Z04:'Chu Tước · Phần Thiên Lĩnh'}[id],radius,damage_multiplier:mult,warning_time:.35,recovery:.3,...extra};}
function bossSkills(final){return final?[
 skill('Z01','vermilion_volley',85,1,{display_name:'Phần Tâm Hỏa Chưởng',vermilion_version:2,basic:true,warning_time:.45,projectile_speed:320,projectile_lifetime:3,hit_radius:18,volley_interval:.2,burn_multiplier:.05,burn_duration:4,cooldown:2.8,initial_cooldown:0,range:600}),
 skill('Z02','vermilion_sweep',150,.2,{display_name:'Lục Vũ Hỏa Trận',vermilion_version:2,warning_time:.2,half_angle:1.15,duration:2,shot_count:6,shot_interval:.2,flight_duration:.35,launch_distance:300,hit_radius:18,impact_multiplier:.1,bleed_multiplier:.1,bleed_duration:4,burn_multiplier:.05,tick_interval:1,cooldown:7,initial_cooldown:3,range:600}),
skill('Z03','vermilion_rain',150,.5,{display_name:'Phượng Hoàng Phần Nguyên',vermilion_version:2,warning_time:0,duration:2,fall_interval:.5,eruption_count:4,eruption_radius:85,slow_percent:.3,burn_multiplier:.05,burn_duration:4,cooldown:10,initial_cooldown:6,range:750}),
 skill('Z04','vermilion_domain',235,.05,{display_name:'Niết Bàn Trọng Sinh',vermilion_version:2,passive:true,activation:'on_death',warning_time:0,inner_radius:0,duration:4,tick_interval:1,dot_multiplier:.05,wave_count:4,wave_duration:.8,slow_percent:.4,revive_hp_ratio:.5,cooldown:300,initial_cooldown:0,range:650}),
 ]:[
 skill('B01','tiger_claw',100,.35,{display_name:'Bạch Hổ Tam Quyền',tiger_version:2,basic:true,warning_time:.2,half_angle:1.05,punch_count:3,punch_interval:.2,paralysis_chance:.1,paralysis_duration:.5,cooldown:2,initial_cooldown:0,range:180}),
 skill('B02','tiger_pounce',110,1,{display_name:'Liên Hoàn Hổ Trảo',tiger_version:2,dash_distance:260,dash_duration:.42,warning_time:.3,slash_count:2,slash_interval:.5,buff_duration:2,move_speed_multiplier:1.3,attack_speed_multiplier:1.3,bleed_chance:.5,bleed_multiplier:.1,bleed_duration:4,cooldown:7,initial_cooldown:2,range:470}),
 skill('B03','tiger_roar',210,1,{display_name:'Hổ Trận Tứ Phương',tiger_version:2,warning_time:0,wave_duration:.55,field_duration:2,field_tick_interval:1,paralysis_chance:.3,paralysis_duration:.5,tails_duration:1,stun_chance:.5,stun_duration:.5,kick_count:4,kick_interval:.25,kick_damage_multiplier:.3,kick_origin_distance:120,knockback_distance:50,cooldown:11,initial_cooldown:5,range:600}),
 skill('B04','tiger_bloodline',320,.05,{display_name:'Cuồng Dã',tiger_version:2,passive:true,activation:'self_hp_below',hp_below_pct:.5,warning_time:0,duration:6,pulse_count:6,pulse_interval:1,wave_duration:.75,paralysis_chance:.15,paralysis_duration:.5,buff_duration:6,move_speed_multiplier:1.3,attack_speed_multiplier:1.25,cleanse_on_activate:true,cooldown:300,initial_cooldown:0,range:1200}),
 ];}
function buildEnemies(){const rows=[];for(const e of ELEMENTS){for(const [id,name,code,type,hp,atk,def,speed,range,as] of SPECIES){
 const extra=type==='beast_dash'?{dash_distance:code==='C03'?160:200,dash_duration:code==='C03'?.5:.32,warning_time:.65}:type==='beast_bolt'?{projectile_speed:code==='C04'?260:320,projectile_lifetime:3.5,hit_radius:16}:{};
 if(code==='C04')extra.effects=[{id:'poison',duration:3,dps:20,tick_interval:.75}];
 rows.push({id:variant(id,e),display_name:name,element:e,attack_type:type==='beast_bolt'?'ranged':'melee',visual_scale:.26,balance_reference_level:60,attributes:{hp,atk,def,move_speed:speed,attack_range:range,attack_speed:as,projectile_speed:320,crit_rate:0,crit_damage:1.5},collision_radius:25,skills:[],generic_skills:[{id:'debuff_resistance',display_name:'Yêu Thể Bất Phược',params:{effect_ids:['root'],duration_multiplier:0,duration_seconds:null}},bloodline()],attack_skill:skill(code,type,code==='C05'?85:65,1,extra),reward:{exp:1,gold:100}});
 }for(const [i,id] of BOSSES.entries()){const skills=bossSkills(i===1);rows.push({id:variant(id,e),display_name:i===0?'Bạch Hổ Yêu Vương':'Chu Tước Nữ Vương',element:e,attack_type:i===0?'melee':'ranged',is_boss:true,boss_scale:1,boss_visual_scale:.48,visual_scale:.48,balance_reference_level:60,collision_radius:38,attributes:{hp:i===0?170000:145000,atk:i===0?550:500,def:i===0?40:35,move_speed:i===0?80:60,attack_range:i===0?110:500,attack_speed:i===0?.5:.35,projectile_speed:320,crit_rate:0,crit_damage:1.5},skills:[],generic_skills:[{id:'debuff_resistance',params:{effect_ids:['root'],duration_multiplier:0,duration_seconds:null}},bloodline(i===0)],attack_skill:clone(skills[0]),boss_skills:skills,reward:{exp:1,gold:1000}});}}
 return rows;}
function buildStages(){const result=[];for(let i=1;i<=10;i++){const random=rng(SEED+i*1009),factor=round(1+(i-1)*.035);const stage={id:stageId(i),arc_id:ARC,level:60+i,order:i,display_name:NAMES[i-1],description:'Vạn Yêu Cổ Lĩnh · Rừng Thiêng Đẫm Máu. Đọc hướng đòn, tránh cú vồ và chế ngự cổ huyết bạo thể.',is_boss:i===5||i===10,exp_weight:1,background:'res://assets/bg/arc7_van_yeu_co_linh_bg.jpg',campaign_pressure_version:1,campaign_opening_relief_version:1,stage_rules:{arc7_version:VERSION,generation_seed:SEED+i*1009,balance_reference_level:60,stat_curve:{model:'authored_stage_with_runtime_pressure_v1',stage_factor:factor},element_weights:Object.fromEntries(ELEMENTS.map(e=>[e,20]))},waves:[]};
 for(let w=1;w<=20;w++){const bossWave=stage.is_boss&&w===20,entries=[],wave={id:`wave_${String(w).padStart(2,'0')}`,wave_id:`wave_${String(w).padStart(2,'0')}`,display_name:`Đợt ${w}`,wave_index:w,is_boss_wave:bossWave,entries};
 const pick=id=>variant(id,ELEMENTS[Math.floor(random()*5)]);
 if(bossWave){wave.boss_id=pick(BOSSES[i===5?0:1]);entries.push({enemy_id:wave.boss_id,count:1,interval:1,start_delay:1,boss:true,spawn_role:'boss',formation_lead_seconds:2,modifiers:{hp_mul:factor,atk_mul:factor,def_mul:factor,speed_mul:1}});}
 const count=bossWave?3:Math.min(15,3+Math.floor((w-1)*.65));
 for(let n=0;n<count;n++){const pool=w<=4?[0,1,3,6]:w<=6?[0,1,3,5,6]:[0,1,2,3,4,5,6];const selected=pool[(n+Math.floor(random()*pool.length))%pool.length],id=SPECIES[selected][0],role=selected===2?'tanker':[3,6].includes(selected)?'ranger':'fast';entries.push({enemy_id:pick(id),count:1,interval:1,start_delay:round((bossWave?5:0)+n*(w<=4?1.6:.95)),spawn_role:role,formation_lead_seconds:role==='tanker'?0:role==='ranger'?2.5:1.5,modifiers:{hp_mul:factor,atk_mul:factor,def_mul:factor,speed_mul:1}});}
 const target=getWaveExp(w),bossShare=bossWave?Math.round(target*.75):0,regular=entries.filter(e=>!e.boss),budget=target-bossShare,base=Math.floor(budget/regular.length),remainder=budget%regular.length;
 regular.forEach((e,k)=>e.modifiers.exp=base+(k<remainder?1:0));if(bossWave)entries[0].modifiers.exp=bossShare;stage.waves.push(wave);
 }result.push(stage);}return result;}
function equalRunes(table){const groups=new Map();for(const row of table||[]){if(row.group!=='rune')continue;const key=row.item_id.replace(/_(metal|water|wood|fire|earth)_/,'_');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}for(const rows of groups.values()){if(rows.length!==5)throw Error('Incomplete rune pool');const weight=rows.reduce((s,r)=>s+r.weight,0)/5;for(const row of rows){row.weight=weight;row.drop_rate=round(weight/100);}}return table;}
function buildCatalog(catalog){const stage_levels=[];for(let i=1;i<=10;i++)for(const mode of ['normal','epic','legend']){const template=catalog.stage_levels.find(r=>r.stage_id===`stage_6_${String(i).padStart(2,'0')}`&&r.level_id===mode);if(!template)throw Error('Missing Arc6 economy');const row=clone(template);row.id=`${stageId(i)}_${mode}`;row.stage_id=stageId(i);row.description=`Vạn Yêu Cổ Lĩnh · ${row.display_name} · nền tảng hero Lv60`;row.unlock_condition=mode==='normal'?{stage_id:i===1?'stage_6_10':stageId(i-1),level_id:'normal'}:{stage_id:stageId(i),level_id:mode==='epic'?'normal':'epic'};row.gold_reward+=Math.round(150*(mode==='normal'?1:mode==='epic'?1.8:3));equalRunes(row.loot_table);equalRunes(row.boss_loot_table);row.stage_rules={...(row.stage_rules||{}),balance_reference_level:60,recommendation:{model:'arc7_lv60_base_pending_runtime_v1',requires_balance_reaudit:true}};stage_levels.push(row);}
 const result = {arcs:[{id:ARC,display_name:'Vạn Yêu Cổ Lĩnh',description:'Rừng Thiêng Đẫm Máu. Yêu tộc lấy nhục thân và huyết mạch thượng cổ làm gốc; kẻ yếu là mồi cho kẻ mạnh.',level_min:61,level_max:70,enabled_if:{type:'always'},element:'',order:7,enemy_visual_scale_multiplier:1,boss_skill_ids:[],stage_ids:Array.from({length:10},(_,i)=>stageId(i+1))}],enemies:buildEnemies(),stages:buildStages(),stage_levels};
 const existingArc=catalog.arcs.find(arc=>arc.id===ARC);
 if(existingArc){result.arcs[0].display_name=existingArc.display_name;result.arcs[0].description=existingArc.description;}
 progression.normalize(result.enemies,catalog);
 progression.waves(result.stages,result.enemies);
 applySpawnFormation(result.stages,result.enemies);
 rebalanceWaveExp(result.stages);
 for(const row of result.stage_levels){row.stage_rules.recommendation={model:'arc7_lv60_progression_v2_pending_runtime',requires_balance_reaudit:true};}
 const reportPath=path.join(__dirname,'../docs/reports/ARC7_RUNTIME_ACCEPTANCE.json');
 if(fs.existsSync(reportPath)){
  const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
  if(report.valid_for_balance && report.combat_digest===combatDigest(result))for(const row of result.stage_levels){
   const measured=report.summary.find(x=>x.stage_id===row.stage_id&&x.level_id===row.level_id);
   if(measured&&measured.passed===measured.cases&&measured.cases>=5){row.recommended_power=measured.max_reference_power;row.stage_rules.recommendation={model:'godot_lv60_neutral_mortal_kite_offered_cards_v1',reference_hero_level:60,cases:measured.cases,passed:measured.passed,minimum_power_search:false};}
  }
 }
 return result;}
function loadCatalog(root){return Object.fromEntries(['arcs','enemies','stages','stage_levels','progression','campaign_pressure_profiles','enemy_skills','heroes'].map(k=>[k,JSON.parse(fs.readFileSync(path.join(root,'data',k+'.json'),'utf8'))]));}
function mergeCatalog(catalog,built){const out=clone(catalog);out.enemy_skills=[...(out.enemy_skills||[]).filter(r=>r.id!==BLOODLINE_DEFINITION.id),clone(BLOODLINE_DEFINITION)];for(const [key,rows]of Object.entries(built)){const ids=new Set(rows.map(r=>r.id));const replacements=new Map(rows.map(r=>[r.id,r]));out[key]=out[key].map(r=>replacements.get(r.id)||r).concat(rows.filter(r=>!catalog[key].some(old=>old.id===r.id)));}const eligible=out.progression.talisman_system.fragment_drop.eligible_stages;if(!eligible.includes('stage_7_10'))eligible.push('stage_7_10');if(!out.campaign_pressure_profiles.profiles.some(r=>r.arc_id===ARC))out.campaign_pressure_profiles.profiles.push({arc_id:ARC,version:1,power_start:1,power_end:1.315,curve:'ease_in_out',opening_allowed_roles:['normal','ranger'],late_requirements:['single_target_check','crowd_check']});return out;}
const combatDigest=b=>crypto.createHash('sha256').update(JSON.stringify({enemies:b.enemies,stages:b.stages})).digest('hex');
const catalogDigest=b=>crypto.createHash('sha256').update(JSON.stringify(b)).digest('hex');
if(require.main===module){const mode=process.argv[2];if(!['--write','--check'].includes(mode))throw Error('Use --check or --write');const root=path.join(__dirname,'..'),old=loadCatalog(root),built=buildCatalog(old),next=mergeCatalog(old,built);let changed=0;for(const k of Object.keys(old)){if(JSON.stringify(old[k])===JSON.stringify(next[k]))continue;changed++;if(mode==='--write')fs.writeFileSync(path.join(root,'data',k+'.json'),JSON.stringify(next[k],null,2)+'\n');}console.log(`${mode==='--check'&&changed?'FAIL':'PASS'} C237 catalog: ${changed} files; seed=${SEED}; sha256=${catalogDigest(built)}`);if(mode==='--check'&&changed)process.exitCode=1;}
module.exports={ARC,VERSION,SEED,ELEMENTS,SPECIES,BOSSES,BLOODLINE_DEFINITION,variant,stageId,rng,buildCatalog,mergeCatalog,loadCatalog,catalogDigest,combatDigest};
