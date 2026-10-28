/* C221: reproducible authored catalog generation, never live DB/profile writes.
 * Randomness is materialized in ordinary wave entries; runtime needs no new RNG. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {rebalanceWaveExp} = require('./campaign_wave_exp.cjs');
const {applySpawnFormation} = require('./campaign_spawn_formation.cjs');
const ARC = 'arc_ngu_to_quy_khu';
const VERSION = 1;
const SEED = 60261026;
const ELEMENTS = ['metal', 'water', 'wood', 'fire', 'earth'];
const POOL = {
  metal: ['steam_automaton', 'iron_crossbowman', 'shield_sentinel'],
  water: ['frost_lancer', 'snow_mage', 'frost_knight'],
  wood: ['spore_crawler', 'thorn_spitter', 'ent_protector'],
  fire: ['flame_imp', 'pyromancer', 'lava_brute'],
  earth: ['snow_skeleton', 'seismic_shaman', 'granite_colossus'],
};
const ROLES = ['normal', 'ranger', 'tank'];
const ARC6_VISUAL_SCALE_MULTIPLIER = 1.6;
const ARC2_SOURCE_ENEMIES = new Set(['snow_mage', 'snow_skeleton', 'frost_lancer', 'frost_knight']);
// Continue Arc 5's authored curve. These are Normal-mode HP/ATK/DEF
// multipliers; runtime applies the selected difficulty exactly once.
const ARC6_STAGE_STAT_CURVE = [
  [6.75,8.40], [7.00,8.80], [7.25,9.20], [7.50,9.60], [7.75,10.00],
  [8.00,10.30], [8.25,10.60], [8.50,10.90], [8.75,11.20], [9.00,11.50],
];
const NAMES = ['Hỗn Khí Ngoại Vực', 'Thiết Mộc Hoang Lâm', 'Băng Diễm Liệt Cốc', 'Ngũ Mạch Giao Tranh', 'Tàn Ảnh Quy Khư', 'Vạn Tượng Băng Hoại', 'Nghịch Lưu Linh Hải', 'Ngũ Tố Loạn Táng', 'Vô Giới Chi Môn', 'Thái Sơ Quy Hư'];
const CORE = [[3,1,0],[3,1,0],[4,2,0],[4,2,0],[5,3,0],[5,3,0],[5,3,1],[5,3,1],[6,4,2],[6,4,2],[7,4,2],[7,4,2],[8,5,3],[8,5,3],[9,6,3],[9,6,3],[10,6,4],[10,6,4],[11,7,4],[12,7,5]];
const clone = x => JSON.parse(JSON.stringify(x));
const round = x => Math.round(x * 1e6) / 1e6;
const stageId = i => `stage_6_${String(i).padStart(2,'0')}`;
function rng(seed) {
  let value = seed >>> 0;
  return () => {value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296;};
}
function extraSkill(element, original) {
  const shield = {id:'damage_shield',display_name:'Địa Mạch Hộ Thân',params:{shield_percent_max_hp:.1,shield_flat_hp:0,duration_seconds:null,cooldown_seconds:0,initial_delay_seconds:0}};
  const defense = {id:'defense_buff',display_name:'Kim Cương Hộ Thể',params:{def_flat:0,def_multiplier:1.12,duration_seconds:null}};
  const candidates = {
    metal:[defense,shield],
    water:[{id:'debuff_resistance',display_name:'Hàn Lưu Vô Tướng',params:{duration_multiplier:.85,effect_ids:['slow','freeze','stun','holy_stun','root','knockback','knockback_light'],duration_seconds:null}},shield],
    wood:[{id:'regeneration',display_name:'Sinh Tức Bất Diệt',params:{percent_max_hp_per_sec:.004,duration_seconds:null}}, {...defense,display_name:'Thiết Mộc Kết Giáp',params:{...defense.params,def_multiplier:1.1}}],
    fire:[{id:'haste',display_name:'Tàn Hỏa Bạo Phát',params:{hp_below_pct:.35,move_speed_multiplier:1.15,duration_seconds:null}}, {...defense,display_name:'Dung Nham Kết Giáp',params:{...defense.params,def_multiplier:1.1}}],
    earth:[shield, {...defense,display_name:'Địa Mạch Kiên Giáp'}],
  };
  const used = new Set((original.generic_skills || []).map(s => s.id));
  const skill = candidates[element].find(s => !used.has(s.id));
  if (!skill) throw Error(`No unique passive for ${original.id}`);
  return clone(skill);
}
function buildEnemies(originals) {
  const result = [];
  for (const element of ELEMENTS) for (const [roleIndex, source] of POOL[element].entries()) {
    const original = originals.find(e => e.id === source);
    if (!original) throw Error('Missing source '+source);
    const enemy = clone(original);
    enemy.id = 'arc6_'+source;
    enemy.display_name = source === 'frost_knight' ? 'Hàn Giáp Vệ · Quy Khư' : original.display_name+' · Quy Khư';
    enemy.element = element;
    enemy.source_enemy_id = source;
    enemy.arc6_role = ROLES[roleIndex];
    // Shared variants span the Arc. Each stage carries its exact Lv51..60
    // reference; Lv55 is the midpoint used for catalog-level inspection.
    enemy.balance_reference_level = 55;
    // Arc 2 has no arc-level presentation multiplier. Arc 6 applies 1.6 at
    // runtime, so compensate copied members of Arc 2's actual stage roster.
    if (ARC2_SOURCE_ENEMIES.has(source)) enemy.visual_scale = round(Number(original.visual_scale) / ARC6_VISUAL_SCALE_MULTIPLIER);
    enemy.generic_skills = [...(enemy.generic_skills || []), extraSkill(element, original)];
    result.push(enemy);
  }
  const source = originals.find(e => e.id === 'primordial_wraith');
  if (!source || source.boss_skills?.length !== 4) throw Error('Missing complete Wraith skills');
  for (const final of [false,true]) {
    const boss = clone(source);
    boss.id = final ? 'arc6_wraith_final' : 'arc6_wraith_mid';
    boss.display_name = final ? 'Quy Khư Nguyên Linh' : 'Tàn Ảnh Ngũ Tố';
    boss.is_boss = true;
    boss.source_enemy_id = source.id;
    boss.balance_reference_level = 55;
    boss.visual_scale = .15;
    boss.boss_visual_scale = .442;
    boss.collision_radius = 34;
    // Stable boss base attributes; stage scaling belongs to entry modifiers.
    boss.attributes = {...boss.attributes,hp:6500,atk:105,def:45,move_speed:28,attack_range:85};
    boss.boss_skills = boss.boss_skills.slice(0, final ? 4 : 2);
    result.push(boss);
  }
  return result;
}
function buildStages() {
  const result = [];
  for (let i = 1; i <= 10; i++) {
    const id = stageId(i), bossStage = i === 5 || i === 10;
    const [wave1Stat,wave20Stat] = ARC6_STAGE_STAT_CURVE[i-1];
    const random = rng(SEED + i * 1009);
    const stage = {id,arc_id:ARC,level:50+i,display_name:NAMES[i-1],description:'Linh khí Ngũ Hành hỗn loạn, vạn vật quy về hư vô.',is_boss:bossStage,exp_weight:1,background:'res://assets/bg/arc6_bg.jpg',order:i,campaign_pressure_version:1,campaign_opening_relief_version:1,
      stage_rules:{arc6_version:VERSION,generation_seed:SEED+i*1009,balance_reference_level:50+i,stat_curve:{model:'shared_hp_atk_def_linear_v1',wave_1:wave1Stat,wave_20:wave20Stat},element_weights:{metal:20,water:20,wood:20,fire:20,earth:20}},waves:[]};
    for (let w = 1; w <= 20; w++) {
      const bossWave = bossStage && w === 20;
      const counts = bossWave ? [3,2,1] : CORE[w-1];
      const wave = {id:`wave_${String(w).padStart(2,'0')}`,wave_id:`wave_${String(w).padStart(2,'0')}`,display_name:`Đợt ${w}`,entries:[],wave_index:w,is_boss_wave:bossWave};
      if (bossWave) {
        const bossId = i === 5 ? 'arc6_wraith_mid' : 'arc6_wraith_final';
        wave.boss_id = bossId;
        // Wraith has multi-hit casts, so only boss ATK has an explicit role
        // coefficient. HP/DEF follow this stage's W20 budget.
        wave.entries.push({enemy_id:bossId,count:1,interval:1.2,start_delay:.6,boss:true,modifiers:{hp_mul:wave20Stat,atk_mul:round(wave20Stat*.45),def_mul:wave20Stat,speed_mul:.75,exp:1}});
      }
      for (const roleIndex of [2,0,1]) {
        for (let slot = 0; slot < counts[roleIndex]; slot++) {
          const element = ELEMENTS[Math.floor(random()*ELEMENTS.length)];
          const source = POOL[element][roleIndex];
          const statMultiplier = round(wave1Stat+(wave20Stat-wave1Stat)*(w-1)/19);
          const modifiers = {hp_mul:statMultiplier,atk_mul:statMultiplier,def_mul:statMultiplier,def_add:0,speed_mul:.75,exp:1};
          const opening = w <= 4;
          const offset = roleIndex === 2 ? 0 : roleIndex === 0 ? (w >= 7 ? 1.4 : 0) : (opening ? 4.5 : 3.2);
          wave.entries.push({enemy_id:'arc6_'+source,count:1,interval:opening?1.2:.75,start_delay:round((bossWave?4:0)+offset+slot*(opening?1.6:.85)),modifiers});
        }
      }
      stage.waves.push(wave);
    }
    result.push(stage);
  }
  rebalanceWaveExp(result);
  return result;
}
function equalizeRunes(table) {
  const result = clone(table), runes = result.filter(row => row.group === 'rune');
  const pools = new Map();
  for (const row of runes) {
    const tier = row.item_id.replace(/_(metal|water|wood|fire|earth)_/, '_');
    if (!pools.has(tier)) pools.set(tier,[]);
    pools.get(tier).push(row);
  }
  for (const group of pools.values()) {
    if (group.length !== 5) throw Error('Rune group must contain all five elements');
    const weight = group.reduce((sum,row)=>sum+Number(row.weight || 0),0)/5;
    const max = Math.max(...group.map(row=>Number(row.max_qty || row.base_quantity || 1)));
    const min = Math.max(1, Math.min(...group.map(row=>Number(row.min_qty || 1))));
    for (const row of group) Object.assign(row,{weight,drop_rate:round(weight/100),min_qty:min,max_qty:max,base_quantity:max});
  }
  return result;
}
function buildLevels(originals) {
  const result = [];
  for (let i=1;i<=10;i++) for (const mode of ['normal','epic','legend']) {
    // A stat-curve rebuild must not erase measured recommendation/loot rows.
    // A brand-new catalog still falls through to the Arc 5 economy template.
    const existing = originals.find(row=>row.stage_id===stageId(i) && row.level_id===mode);
    if (existing) {
      const level = clone(existing);
      level.description = `Ngũ Tố Quy Khư · ${level.display_name}. Đội hình năm hệ, cân bằng theo mốc Lv.${50+i}.`;
      level.stage_rules = {...(level.stage_rules || {}),balance_reference_level:50+i};
      if (level.stage_rules.recommendation) level.stage_rules.recommendation = {...level.stage_rules.recommendation,requires_balance_reaudit:true};
      result.push(level);
      continue;
    }
    const original = originals.find(row=>row.stage_id===`stage_5_${String(i).padStart(2,'0')}` && row.level_id===mode);
    if (!original) throw Error('Missing difficulty template');
    const level = clone(original);
    level.id = `${stageId(i)}_${mode}`;
    level.stage_id = stageId(i);
    level.description = `Ngũ Tố Quy Khư · ${level.display_name}. Đội hình năm hệ, cân bằng theo mốc Lv.${50+i}.`;
    level.loot_table = equalizeRunes(level.loot_table);
    if (level.boss_loot_table?.length) level.boss_loot_table = equalizeRunes(level.boss_loot_table);
    // Continue the existing economy instead of resetting to Arc5's first reward.
    // Keep the template's stage/boss and 1/1.8/3 tier relationships.
    const previousFinal = originals.find(row=>row.stage_id==='stage_5_10' && row.level_id==='normal');
    const previousFirst = originals.find(row=>row.stage_id==='stage_5_01' && row.level_id==='normal');
    const economyFactor = mode==='normal'?1:mode==='epic'?1.8:3;
    const goldOffset = Math.round((previousFinal.gold_reward-previousFirst.gold_reward+10)*economyFactor/5)*5;
    level.gold_reward += goldOffset;
    for (const table of [level.loot_table,level.boss_loot_table || []]) for (const item of table) {
      if (item.resource_id!=='gold') continue;
      item.min_qty += goldOffset;
      item.max_qty += goldOffset*2;
      item.base_quantity += goldOffset*2;
    }
    // Provisional reference estimate. Replaced only by measured runtime results.
    const ref = originals.find(row=>row.stage_id==='stage_4_05' && row.level_id===mode);
    level.recommended_power = Math.ceil(ref.recommended_power*(1+.035*(i-1)));
    result.push(level);
  }
  return result;
}
function buildCatalog(catalog, recommendations = []) {
  const arc = {id:ARC,display_name:'Ngũ Tố Quy Khư',description:'Vạn vật sinh từ hỗn độn, quy về hư vô. Linh khí Ngũ Hành cắn xé, không còn ranh giới.',level_min:51,level_max:60,enabled_if:{type:'always'},element:'earth',order:6,enemy_visual_scale_multiplier:ARC6_VISUAL_SCALE_MULTIPLIER,boss_skill_ids:['control_resistance_growth'],stage_ids:Array.from({length:10},(_,i)=>stageId(i+1))};
  const result = {arcs:[arc],enemies:buildEnemies(catalog.enemies),stages:buildStages(),stage_levels:buildLevels(catalog.stage_levels)};
  for (const measured of recommendations) {
    const level = result.stage_levels.find(row=>row.stage_id===measured.stage_id && row.level_id===measured.level_id);
    if (!level || !Number.isInteger(measured.max_reference_power) || measured.max_reference_power<=0) throw Error('Invalid measured recommendation');
    level.recommended_power = measured.max_reference_power;
    level.stage_rules = {...(level.stage_rules || {}),balance_reference_level:Number(measured.reference_hero_level),recommendation:{model:'godot_full_run_neutral_offered_cards_survival_v1',reference_hero_level:measured.reference_hero_level,passed:measured.passed,cases:measured.cases,minimum_power_search:false}};
    if (measured.requires_range_reaudit) level.stage_rules.recommendation.requires_range_reaudit = true;
  }
  return result;
}
const catalogDigest = built => crypto.createHash('sha256').update(JSON.stringify({enemies:built.enemies,stages:built.stages})).digest('hex');
function loadRecommendations(root, built) {
  const file = path.join(root,'docs/reports/ARC6_RUNTIME_FINAL_REFERENCE.json');
  if (!fs.existsSync(file)) return [];
  const report = JSON.parse(fs.readFileSync(file,'utf8'));
  if (!report.valid_for_balance || report.mortal!==true) return [];
  let requiresRangeReaudit = false;
  if (report.catalog_digest!==catalogDigest(built)) {
    // Presentation-only Arc 2 scale compensation does not alter combat. Restore
    // the former authored values when validating the existing combat report.
    const previous = clone(built);
    for (const id of ARC2_SOURCE_ENEMIES) {
      const variant = previous.enemies.find(enemy => enemy.id === `arc6_${id}`);
      if (variant) variant.visual_scale = .4095;
    }
    // C222 retains the existing reference power only for the exact range-only
    // revision; never treat the old runs as measurements of other changes.
    for (const enemy of previous.enemies.filter(e=>e.is_boss)) {
      if (enemy.boss_skills[0]?.range!==700 || enemy.boss_skills[1]?.range!==550) return [];
      enemy.boss_skills[0].range = 650;
      enemy.boss_skills[1].range = 650;
    }
    if (report.catalog_digest!==catalogDigest(previous)) return [];
    requiresRangeReaudit = true;
  }
  if (report.target_wave!==20 || report.seeds?.length<3 || report.heroes?.length!==5 || report.summary?.length!==30) return [];
  for (const row of report.summary) {
    const cases=report.results.filter(r=>r.requested.stage===row.stage_id && r.requested.mode===row.level_id);
    if (cases.length!==15 || cases.some(r=>r.mortal!==true || r.status==='ERROR')) throw Error('Incomplete measured lane '+row.stage_id+'/'+row.level_id);
    // Reference recommendations are verified conservative loadouts, not a claim
    // that a three-seed sample estimates a population win rate or minimum CP.
    if (row.passed<12 || report.heroes.some(hero=>cases.filter(r=>r.hero_id===hero && r.status==='PASS' && r.process_exit===0).length<2)) throw Error('Reference loadout needs tuning '+row.stage_id+'/'+row.level_id);
  }
  return report.summary.map(row=>requiresRangeReaudit ? {...row,requires_range_reaudit:true} : row);
}
function mergeCatalog(catalog, built) {
  const output = clone(catalog);
  for (const [key,rows] of Object.entries(built)) {
    const ids = new Set(rows.map(row=>row.id));
    const replacements = new Map(rows.map(row=>[row.id,row]));
    output[key] = output[key].map(row=>replacements.get(row.id) || row).concat(rows.filter(row=>!catalog[key].some(old=>old.id===row.id)));
  }
  const eligible = output.progression.talisman_system.fragment_drop.eligible_stages;
  if (!eligible.includes('stage_6_10')) eligible.push('stage_6_10');
  const profiles = output.campaign_pressure_profiles.profiles;
  if (!profiles.some(p=>p.arc_id===ARC)) profiles.push({arc_id:ARC,version:1,power_start:1,power_end:1.315,curve:'ease_in_out',opening_allowed_roles:['normal','ranger'],late_requirements:['single_target_check','crowd_check']});
  applySpawnFormation(output.stages, output.enemies);
  return output;
}
function loadCatalog(root) {
  return Object.fromEntries(['arcs','enemies','stages','stage_levels','progression','campaign_pressure_profiles'].map(key=>[key,JSON.parse(fs.readFileSync(path.join(root,'data',key+'.json'),'utf8'))]));
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length!==1 || !['--check','--write'].includes(args[0])) throw Error('Use --check or --write');
  const root = path.join(__dirname,'..'), catalog=loadCatalog(root), raw=buildCatalog(catalog);
  const next=mergeCatalog(catalog,buildCatalog(catalog,loadRecommendations(root,raw)));
  let changed=0;
  for (const key of Object.keys(catalog)) {
    if (JSON.stringify(catalog[key])===JSON.stringify(next[key])) continue;
    changed++;
    if (args[0]==='--write') fs.writeFileSync(path.join(root,'data',key+'.json'),JSON.stringify(next[key],null,2)+'\n');
  }
  console.log(`${args[0]==='--check' && changed?'FAIL':'PASS'} C221 Arc6 catalog: ${changed} files ${args[0]==='--write'?'updated':'differ'}; seed=${SEED}`);
  if (args[0]==='--check' && changed) process.exitCode=1;
}
module.exports={ARC,VERSION,SEED,ELEMENTS,POOL,ROLES,CORE,ARC6_STAGE_STAT_CURVE,rng,extraSkill,buildCatalog,mergeCatalog,loadCatalog,catalogDigest,loadRecommendations};
