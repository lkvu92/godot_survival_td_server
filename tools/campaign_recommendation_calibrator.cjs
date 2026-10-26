/* C218 stage recommendation calibrator.  Deterministic, runtime-aligned damage
 * model; --write is the only path that changes stage_levels.json. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const pressure=require('./campaign_pressure_engine.cjs');
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const defMul=d=>100/(100+Math.max(0,d));
const crit=a=>1+Math.max(0,Math.min(1,n(a.crit_rate)))*(Math.max(1,n(a.crit_damage,1))-1);
function element(a,b,m){return 1+n(((m[a]||{})[b]),0)/100;}
function levelSkill(skill,level){return (skill.levels||[])[Math.max(0,Math.min((skill.levels||[]).length-1,level-1))]||{stats:{}};}
function cpCalculator(root){const code=fs.readFileSync(path.join(root,'nakama/data/modules/build/combat_power.js'),'utf8')+';globalThis.x=calculateCombatPower';const box={};vm.runInNewContext(code,box);return box.x;}
function initial(hero,persistent){return pressure.heroAtLevel(hero,persistent);}
function choose(state,catalog){ // exact documented deterministic auto policy: skill > ATK > CDR > accuracy > AS > DEF > heal
 const candidates=[];
 for(const id of heroSkills(state.hero,catalog.skills)){
  const s=catalog.skills.find(x=>x.id===id), have=state.skills[id]||0, req=n(s.hero_level_unlock,1), gate=(s.createria_unlock||{});
  if(state.persistent<req||state.run<n(gate.level,1)||(gate.required_skill&&!state.skills[gate.required_skill])||have>=s.levels.length)continue;
  candidates.push({kind:'skill',id,score:10000-have});
 }
 if(candidates.length){candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));const c=candidates[0];state.skills[c.id]=(state.skills[c.id]||0)+1;return c.id;}
 const order=['atk','cooldown_reduction','effect_accuracy','attack_speed','def','heal'];
 for(const family of order){const rows=catalog.cards.filter(c=>c.support_family===family&&state.run>=n(c.min_hero_level,1));if(!rows.length)continue;rows.sort((a,b)=>n(b.effect?.value)-n(a.effect?.value)||a.id.localeCompare(b.id));const c=rows[0],e=c.effect||{};if(e.type==='stat_percent')state.attrs[e.stat]=n(state.attrs[e.stat])*(1+n(e.value));else if(e.type==='cooldown_reduction')state.cdr=Math.min(.65,state.cdr+n(e.value));else if(e.type==='heal_percent')state.hp=Math.min(state.maxHp,state.hp+state.maxHp*n(e.value));return c.id;}
 return 'none';
}
function heroSkills(hero){return hero.skill_pool||[];}
function simulate(stage,mode,persistent,catalog){
 const hero=catalog.heroes.find(x=>x.id===catalog.reference_hero), matrix=catalog.progression.element_combat.matchup_modifier_pct||{};
 const state={hero,persistent,run:1,attrs:initial(hero,persistent),skills:{},cdr:0,hp:0,maxHp:0,exp:0,picks:[]};
 state.skills[hero.starting_skills[0]]=1;state.maxHp=n(state.attrs.hp);state.hp=state.maxHp;let now=0,regenAt=10;
 const enemyMap=new Map(catalog.enemies.map(x=>[x.id,x])), diff=mode.enemy_modifiers||{};
 for(let wi=0;wi<stage.waves.length;wi++){
  const alive=[],events=[];for(const entry of stage.waves[wi].entries||[]){const e=enemyMap.get(entry.enemy_id);if(!e)continue;const x=pressure.effectiveStats(entry,e,{hp_mul:n(diff.hp_mul,1),atk_mul:n(diff.atk_mul,1)});for(let i=0;i<x.count;i++)events.push({t:now+x.start_delay+i*x.interval,type:'spawn',e,x,hp:x.hp/defMul(x.def),next:0});}
  let basic=now, skillAt={}; for(const id of Object.keys(state.skills))skillAt[id]=now;
  let steps=0;while(events.length||alive.length){if(++steps>100000)return {pass:false,reason:'event_budget',wave:wi+1};if(!alive.length&&events.length){now=Math.min(...events.map(x=>x.t));const due=events.filter(x=>x.t<=now+1e-7);for(const u of due){events.splice(events.indexOf(u),1);u.next=now+1/Math.max(.05,u.x.attack_speed);alive.push(u);}continue;}let next=events.length?Math.min(...events.map(x=>x.t)):Infinity;next=Math.min(next,basic,regenAt,...Object.values(skillAt));for(const u of alive)next=Math.min(next,u.next);if(!Number.isFinite(next)||next-now>240)return {pass:false,reason:'timeout',wave:wi+1};now=next;
   if(now>=regenAt-1e-7){state.hp=Math.min(state.maxHp,state.hp+state.maxHp*n(state.attrs.regen_percent_per_10s));regenAt+=10;continue;}
   const due=events.filter(x=>x.t<=now+1e-7);for(const u of due){events.splice(events.indexOf(u),1);u.next=now+1/Math.max(.05,u.x.attack_speed);alive.push(u);} if(due.length)continue;
   const target=alive[0];if(!target)return {pass:false,reason:'empty_event',wave:wi+1};
   const hit=(raw,u)=>{u.hp-=raw*crit(state.attrs)*element(hero.element,u.e.element,matrix)*defMul(u.x.def);if(u.hp<=0){state.exp+=u.x.exp;alive.splice(alive.indexOf(u),1);}};
   if(basic<=now+1e-7){hit(n(state.attrs.atk)*.75,target);basic=now+Math.max(.2,2-n(state.attrs.attack_speed)*.005);continue;}
   const sid=Object.keys(skillAt).find(id=>skillAt[id]<=now+1e-7);if(sid){const s=catalog.skills.find(x=>x.id===sid),row=levelSkill(s,state.skills[sid]),z=row.stats||{},raw=n(state.attrs.atk)*n(z.damage_pct)*.01*Math.max(1,n(z.strike_count,n(z.projectile_count,1)));hit(raw,target);skillAt[sid]=now+Math.max(.1,n(z.cooldown,1)*(1-state.cdr));continue;}
   const attacker=alive.find(u=>u.next<=now+1e-7);if(attacker){state.hp-=n(attacker.x.atk)*crit(attacker.e.attributes)*element(attacker.e.element,hero.element,matrix)*defMul(n(state.attrs.def));attacker.next=now+1/Math.max(.05,attacker.x.attack_speed);if(state.hp<=0)return {pass:false,reason:'death',wave:wi+1};}
  }
  while(state.exp>=pressure.requirement(state.run)){state.exp-=pressure.requirement(state.run);state.run++;state.picks.push(choose(state,catalog));}
 }
 return {pass:true,clear_time:Math.round(now*100)/100,run_level:state.run,picks:state.picks};
}
function minimum(stage,mode,lower,upper,catalog){let lo=lower-1,hi=Math.max(lower,1);while(hi<=upper&&!simulate(stage,mode,hi,catalog).pass){lo=hi;hi=Math.min(upper+1,hi*2);}if(hi>upper)return null;while(lo+1<hi){const mid=Math.floor((lo+hi)/2);if(simulate(stage,mode,mid,catalog).pass)hi=mid;else lo=mid;}return {level:hi,result:simulate(stage,mode,hi,catalog)};}
function calibrate(root,{stageId='' }={}){const load=x=>JSON.parse(fs.readFileSync(path.join(root,'data',x+'.json'),'utf8'));const catalog={...pressure.loadCatalog(root),cards:load('cards'),progression:load('progression'),reference_hero:'hero_1'};const cp=cpCalculator(root), rows=[],arcs=catalog.arcs.filter(a=>n(a.order)>=1);for(const arc of arcs){let lower=n(arc.level_min,1);for(const id of arc.stage_ids){if(stageId&&id!==stageId)continue;const st=catalog.stages.find(x=>x.id===id);for(const levelId of ['normal','epic','legend']){const mode=catalog.stageLevels.find(x=>x.stage_id===id&&x.level_id===levelId);const found=minimum(st,mode,lower,n(arc.level_max,50),catalog);if(!found){rows.push({stage_id:id,level_id:levelId,status:'UNSOLVED',lower_bound_level:lower});continue;}const profile={level:found.level,element_affinities:{},elements:{}};const score=cp(profile,[{hero_id:'hero_1',owned:true,level:found.level}],[],[catalog.heroes.find(x=>x.id==='hero_1')],catalog.skills,catalog.progression,[]).score;rows.push({stage_id:id,level_id:levelId,status:'PASS',recommended_hero_level:found.level,recommended_power:score,clear_time:found.result.clear_time,policy:'deterministic_skill_atk_cdr_accuracy_as_def_heal_v1',model:'runtime_aligned_damage_timeline_v1'});lower=Math.max(lower,found.level);}}}
 return {version:1,rows,catalog};}
if(require.main===module){const root=path.join(__dirname,'..'),args=process.argv.slice(2),write=args.includes('--write'),stage=(args.find(a=>a.startsWith('--stage='))||'').slice(8),out=(args.find(a=>a.startsWith('--report='))||'').slice(9);if(args.some(a=>a!=='--write'&&!a.startsWith('--stage=')&&!a.startsWith('--report=')))throw Error('Use --stage=id [--report=path] [--write]');const r=calibrate(root,{stageId:stage});if(out)fs.writeFileSync(path.resolve(out),JSON.stringify({version:r.version,rows:r.rows},null,2)+'\n');if(write){const f=path.join(root,'data/stage_levels.json'),levels=JSON.parse(fs.readFileSync(f,'utf8'));for(const row of r.rows.filter(x=>x.status==='PASS')){const x=levels.find(x=>x.stage_id===row.stage_id&&x.level_id===row.level_id);x.recommended_power=row.recommended_power;x.recommended_hero_level=row.recommended_hero_level;x.recommendation_model=row.model;x.recommendation_policy=row.policy;}fs.writeFileSync(f,JSON.stringify(levels,null,2)+'\n');}console.log(JSON.stringify({status:'PASS',write,rows:r.rows.length,solved:r.rows.filter(x=>x.status==='PASS').length,unsolved:r.rows.filter(x=>x.status!=='PASS').length,rows:r.rows}));}
module.exports={simulate,minimum,calibrate};
