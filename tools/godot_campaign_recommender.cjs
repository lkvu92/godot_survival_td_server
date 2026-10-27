/* C218 authoritative recommendation runner.
 * One same-element reference hero per Arc; Godot runtime owns pass/fail.
 * Progress is checkpointed atomically per row and per Arc for safe resume. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),os=require('node:os'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),workspace=path.join(root,'..'),client=path.join(workspace,'client');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n+'.json'),'utf8'));
const argv=process.argv.slice(2),value=k=>(argv.find(x=>x.startsWith(`--${k}=`))||'').slice(k.length+3);
const write=argv.includes('--write'),fresh=argv.includes('--fresh'),godot=value('godot')||process.env.GODOT_BIN||'';
const onlyArc=value('arc'),onlyStage=value('stage'),onlyMode=value('difficulty'),report=value('report');
const seeds=(value('seeds')||'218,219,220,221,222').split(',').map(Number),threshold=Number(value('clear-rate')||.8);
const checkpointDir=path.resolve(value('checkpoint-dir')||path.join(workspace,'.tmp','c218-recommendations'));
const godotUserDataDir=path.join(os.tmpdir(),`survival_td_c218_godot_${process.pid}`);
const heroByElement={fire:'hero_2',water:'hero_1',wood:'hero_4',metal:'hero_5',earth:'hero_3'};
const modes=['normal','epic','legend'],model='godot_runtime_neutral_mortal_checkpoints_v4',policy='guaranteed_ordered_skill_atk_cdr_accuracy_as_def_heal_v2';
if(!godot||!fs.existsSync(godot))throw Error('Pass --godot=<Godot console executable> or set GODOT_BIN');
if(write&&(onlyArc||onlyStage||onlyMode))throw Error('--write requires complete Arc 1-5 without filters');
if(!(threshold>0&&threshold<=1)||!seeds.length||seeds.some(x=>!Number.isInteger(x)))throw Error('Invalid --clear-rate or --seeds');
for(const arg of argv)if(!['--write','--fresh'].includes(arg)&&!/^--(godot|arc|stage|difficulty|report|seeds|clear-rate|checkpoint-dir)=/.test(arg))throw Error('Unknown argument '+arg);
const campaignArcs=read('arcs').filter(a=>Number(a.order)>=1&&Number(a.order)<=6),heroes=read('heroes'),levels=read('stage_levels'),stages=read('stages');
// Arc 6 is opt-in analysis. Preserve the existing Arc 1-5 write boundary.
const allArcs=campaignArcs.filter(a=>Number(a.order)<=5);
const selectedArcs=(onlyArc?campaignArcs:allArcs).filter(a=>!onlyArc||a.id===onlyArc||String(a.order)===onlyArc);
if(!selectedArcs.length)throw Error('No matching Arc 1-6');
fs.mkdirSync(checkpointDir,{recursive:true});
fs.mkdirSync(godotUserDataDir,{recursive:true});
const tempResult=path.join(os.tmpdir(),`survival_td_c218_case_${process.pid}.json`);
const checkpoint=arc=>Number(arc.level_max)<=10?4:Number(arc.level_max)<=20?9:Number(arc.level_max)<=30?14:19;
const fingerprint=crypto.createHash('sha256').update(JSON.stringify({model,policy,seeds,threshold,stages,levels,heroes})).digest('hex');
const atomicJson=(file,data)=>{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file);};
const arcFile=arc=>path.join(checkpointDir,`${String(arc.order??arc.arc_order).padStart(2,'0')}_${arc.id??arc.arc_id}.json`);
function blankArc(arc,heroId){return {version:2,status:'IN_PROGRESS',arc_id:arc.id,arc_order:Number(arc.order),arc_element:arc.element,reference_hero_id:heroId,checkpoint_wave:checkpoint(arc),model,policy,seeds,clear_rate_target:threshold,fingerprint,rows:[]};}
function loadArc(arc,heroId){const file=arcFile(arc);if(fresh||!fs.existsSync(file))return blankArc(arc,heroId);const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.fingerprint!==fingerprint||saved.reference_hero_id!==heroId)throw Error(`Checkpoint mismatch for ${arc.id}; use --fresh after catalog/config changes`);return saved;}
function runCase(stage,mode,hero,level,seed,target){
 process.stdout.write(`[C218] ${stage}/${mode} ${hero} L${level} seed=${seed} checkpoint=W${target}\n`);
 if(fs.existsSync(tempResult))fs.unlinkSync(tempResult);
 const args=['--headless',`--user-data-dir=${godotUserDataDir.replaceAll('\\','/')}`,'--path',client,'--scene','res://tests/CampaignRecommendationHarness.tscn','--',`--data=${path.join(root,'data').replaceAll('\\','/')}`,`--stage=${stage}`,`--difficulty=${mode}`,`--hero=${hero}`,`--level=${level}`,`--target-wave=${target}`,`--seed=${seed}`,'--mortal=true','--movement=stationary','--speed=8',`--output=${tempResult.replaceAll('\\','/')}`];
 args.push('--guarantee-skills=true');
 args.push('--uncapped-level=true');
 const r=cp.spawnSync(godot,args,{encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 if(!fs.existsSync(tempResult))throw Error(`Harness produced no result: ${stage}/${mode}/${hero}/L${level}\n${r.stdout}\n${r.stderr}`);
 const out=JSON.parse(fs.readFileSync(tempResult,'utf8'));out.process_exit=r.status;
 process.stdout.write(`[C218] ${out.status} ${stage}/${mode} ${hero} L${level} seed=${seed} reason=${out.reason} wave=${out.current_wave??'?'} hp=${Number(out.hp??0).toFixed(1)}\n`);
 return out;
}
function evaluate(stage,mode,hero,level,target){let pass=0,cases=[];const needed=Math.ceil(seeds.length*threshold),allowedFail=seeds.length-needed;for(const seed of seeds){const row=runCase(stage,mode,hero,level,seed,target);cases.push(row);if(row.status==='PASS')pass++;if(pass>=needed||cases.length-pass>allowedFail)break;}return {passed:pass>=needed,pass,seeds_run:cases.length,required:needed,cases};}
function failureDetail(trial){return {passed:trial.pass,seeds_run:trial.seeds_run,required:trial.required,cases:trial.cases.map(x=>({seed:x.seed,status:x.status,reason:x.reason,current_wave:x.current_wave,run_level:x.run_level,hp:x.hp,max_hp:x.max_hp,checkpoint_skills:x.checkpoint_skills,checkpoints:x.checkpoints,incoming_total_damage:x.incoming_total_damage,max_hit:x.max_hit,max_hit_source:x.max_hit_source,max_hit_type:x.max_hit_type}))};}
function passResult(hero,level,target,trial){const sample=trial.cases.find(x=>x.status==='PASS');return {status:'PASS',hero_id:hero,minimum_level:level,recommended_power:sample.base_combat_power,base_stats:sample.base_stats,clear_rate:trial.pass/seeds.length,seeds_run:trial.seeds_run,checkpoint_wave:target,checkpoints:sample.checkpoints};}
function findMinimum(stage,mode,hero,start,target,onTrial,resume={}){
 let lastFail=Number(resume.last_failed_level??start-1),best=resume.best_pass||null;
 if(resume.phase==='done'&&best)return best;
 if(resume.phase==='descend'&&best){for(let level=Number(resume.next_level);level>lastFail;level--){const trial=evaluate(stage,mode,hero,level,target);if(!trial.passed){onTrial(level,trial,{phase:'done',last_failed_level:level,best_pass:best});return best;}best=passResult(hero,level,target,trial);onTrial(level,trial,{phase:'descend',last_failed_level:lastFail,next_level:level-1,best_pass:best});}return best;}
 for(let level=Number(resume.next_level??start);;level+=3){const trial=evaluate(stage,mode,hero,level,target);if(!trial.passed){lastFail=level;onTrial(level,trial,{phase:'stride',last_failed_level:lastFail,next_level:level+3});continue;}best=passResult(hero,level,target,trial);onTrial(level,trial,{phase:'descend',last_failed_level:lastFail,next_level:level-1,best_pass:best});for(let candidate=level-1;candidate>lastFail;candidate--){const lower=evaluate(stage,mode,hero,candidate,target);if(!lower.passed){onTrial(candidate,lower,{phase:'done',last_failed_level:candidate,best_pass:best});return best;}best=passResult(hero,candidate,target,lower);onTrial(candidate,lower,{phase:'descend',last_failed_level:lastFail,next_level:candidate-1,best_pass:best});}return best;}
}
const arcOutputs=[];
for(const arc of selectedArcs){
 const heroId=heroByElement[String(arc.element)],hero=heroes.find(h=>h.id===heroId);if(!hero)throw Error(`Missing ${arc.element} reference hero for ${arc.id}`);
 const state=loadArc(arc,heroId),target=checkpoint(arc),existing=new Map(state.rows.map(r=>[`${r.stage_id}|${r.level_id}`,r]));
 const firstStage=stages.find(row=>row.id===arc.stage_ids[0]);
 const arcCalibrationFloor=Number(firstStage?.stage_rules?.target_normal_hero_level??arc.level_min);
 const previous={normal:arcCalibrationFloor,epic:arcCalibrationFloor,legend:arcCalibrationFloor};
 for(const stage of arc.stage_ids){
  if(onlyStage&&stage!==onlyStage)continue;
  const stageData=stages.find(row=>row.id===stage);
  if(!stageData)throw Error(`Missing stage ${stage}`);
  const stageCalibrationFloor=Number(stageData.stage_rules?.target_normal_hero_level??arc.level_min);
  let sameStage=stageCalibrationFloor;
  for(const mode of modes){
   const key=`${stage}|${mode}`,cached=existing.get(key);
   if(onlyMode&&mode!==onlyMode){
    if(modes.indexOf(mode)<modes.indexOf(onlyMode)){
     if(!cached||cached.status!=='PASS')throw Error(`Cannot test ${onlyMode} for ${stage}: missing PASS checkpoint for ${mode}`);
     sameStage=Math.max(sameStage,cached.recommended_hero_level);previous[mode]=Math.max(previous[mode],cached.recommended_hero_level);
    }
    continue;
   }
   if(cached&&cached.status==='PASS'){sameStage=cached.recommended_hero_level;previous[mode]=Math.max(previous[mode],sameStage);continue;}
   const searchState=cached?.reference_hero?.search_state||null;
   const baseStart=Math.max(stageCalibrationFloor,previous[mode],sameStage);
   const start=searchState?baseStart:Math.max(baseStart,Number(cached?.reference_hero?.last_tested_level??cached?.reference_hero?.max_level??0)+1);
   const found=findMinimum(stage,mode,heroId,start,target,(level,trial,nextSearch)=>{
    const pending={arc_id:arc.id,stage_id:stage,level_id:mode,status:'IN_PROGRESS',checkpoint_wave:target,recommended_power:null,recommended_hero_level:null,lower_bound_level:baseStart,reference_hero:{hero_id:heroId,last_tested_level:level,next_level:nextSearch.next_level??null,search_state:nextSearch,last_evaluation:failureDetail(trial)},model,policy,clear_rate_target:threshold};
    state.status='IN_PROGRESS';state.search_level_cap=null;state.rows=state.rows.filter(r=>`${r.stage_id}|${r.level_id}`!==key);state.rows.push(pending);atomicJson(arcFile(arc),state);
   },searchState||{});
   const row={arc_id:arc.id,stage_id:stage,level_id:mode,status:found.status,checkpoint_wave:target,recommended_power:found.recommended_power??null,recommended_hero_level:found.minimum_level??null,reference_hero:found,model,policy,clear_rate_target:threshold,lower_bound_level:start};
   state.rows=state.rows.filter(r=>`${r.stage_id}|${r.level_id}`!==key);state.rows.push(row);existing.set(key,row);atomicJson(arcFile(arc),state);
   process.stdout.write(`[C218] ${found.status} stage ${stage}/${mode} level=${found.minimum_level??'none'} power=${found.recommended_power??'none'} checkpoint saved\n`);
   sameStage=found.minimum_level;previous[mode]=found.minimum_level;
  }
 }
 const expected=arc.stage_ids.filter(s=>!onlyStage||s===onlyStage).length*(onlyMode?1:3);
 state.status=state.rows.filter(r=>(!onlyStage||r.stage_id===onlyStage)&&(!onlyMode||r.level_id===onlyMode)&&r.status==='PASS').length===expected?'COMPLETE':'UNSOLVED';
 state.completed_at=new Date().toISOString();atomicJson(arcFile(arc),state);arcOutputs.push(state);
 process.stdout.write(`[C218] saved ${arc.id}: ${state.status} -> ${arcFile(arc)}\n`);
}
const rows=arcOutputs.flatMap(a=>a.rows),output={version:2,status:arcOutputs.every(a=>a.status==='COMPLETE')?'PASS':'UNSOLVED',write,model,policy,seeds,clear_rate_target:threshold,arcs:arcOutputs,rows};
if(report)atomicJson(path.resolve(report),output);
if(write){
 const allStates=allArcs.map(arc=>{const file=arcFile(arc);if(!fs.existsSync(file))throw Error(`Refusing --write: missing ${file}`);return JSON.parse(fs.readFileSync(file,'utf8'));});
 if(allStates.some(a=>a.status!=='COMPLETE'||a.fingerprint!==fingerprint))throw Error('Refusing --write: every Arc 1-5 must be COMPLETE with current fingerprint');
 for(const row of allStates.flatMap(a=>a.rows)){const x=levels.find(v=>v.stage_id===row.stage_id&&v.level_id===row.level_id);if(!x)throw Error(`Missing stage level ${row.stage_id}/${row.level_id}`);Object.assign(x,{recommended_power:row.recommended_power,recommended_hero_level:row.recommended_hero_level,recommendation_model:row.model,recommendation_policy:row.policy,recommendation_checkpoint_wave:row.checkpoint_wave,recommendation_reference_hero:row.reference_hero.hero_id});}
 atomicJson(path.join(root,'data','stage_levels.json'),levels);
}
console.log(JSON.stringify({status:output.status,write,arcs:arcOutputs.map(a=>({arc_id:a.arc_id,status:a.status,file:arcFile(a)})),rows:rows.length,report:report||null}));
