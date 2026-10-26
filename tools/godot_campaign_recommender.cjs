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
const heroByElement={fire:'hero_2',water:'hero_1',wood:'hero_4',metal:'hero_5',earth:'hero_3'};
const modes=['normal','epic','legend'],model='godot_runtime_neutral_checkpoints_v2',policy='offered_skill_atk_cdr_accuracy_as_def_heal_v1';
if(!godot||!fs.existsSync(godot))throw Error('Pass --godot=<Godot console executable> or set GODOT_BIN');
if(write&&(onlyArc||onlyStage||onlyMode))throw Error('--write requires complete Arc 1-5 without filters');
if(!(threshold>0&&threshold<=1)||!seeds.length||seeds.some(x=>!Number.isInteger(x)))throw Error('Invalid --clear-rate or --seeds');
for(const arg of argv)if(!['--write','--fresh'].includes(arg)&&!/^--(godot|arc|stage|difficulty|report|seeds|clear-rate|checkpoint-dir)=/.test(arg))throw Error('Unknown argument '+arg);
const allArcs=read('arcs').filter(a=>Number(a.order)>=1&&Number(a.order)<=5),heroes=read('heroes'),levels=read('stage_levels');
const selectedArcs=allArcs.filter(a=>!onlyArc||a.id===onlyArc||String(a.order)===onlyArc);
if(!selectedArcs.length)throw Error('No matching Arc 1-5');
fs.mkdirSync(checkpointDir,{recursive:true});
const tempResult=path.join(os.tmpdir(),`survival_td_c218_case_${process.pid}.json`);
const checkpoint=arc=>Number(arc.level_max)<=10?4:Number(arc.level_max)<=20?9:Number(arc.level_max)<=30?14:19;
const fingerprint=crypto.createHash('sha256').update(JSON.stringify({model,policy,seeds,threshold,stages:read('stages'),levels,heroes})).digest('hex');
const atomicJson=(file,data)=>{const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n');fs.renameSync(temp,file);};
const arcFile=arc=>path.join(checkpointDir,`${String(arc.order??arc.arc_order).padStart(2,'0')}_${arc.id??arc.arc_id}.json`);
function blankArc(arc,heroId){return {version:2,status:'IN_PROGRESS',arc_id:arc.id,arc_order:Number(arc.order),arc_element:arc.element,reference_hero_id:heroId,checkpoint_wave:checkpoint(arc),model,policy,seeds,clear_rate_target:threshold,fingerprint,rows:[]};}
function loadArc(arc,heroId){const file=arcFile(arc);if(fresh||!fs.existsSync(file))return blankArc(arc,heroId);const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.fingerprint!==fingerprint||saved.reference_hero_id!==heroId)throw Error(`Checkpoint mismatch for ${arc.id}; use --fresh after catalog/config changes`);return saved;}
function runCase(stage,mode,hero,level,seed,target){
 process.stderr.write(`[C218] ${stage}/${mode} ${hero} L${level} seed=${seed} checkpoint=W${target}\n`);
 if(fs.existsSync(tempResult))fs.unlinkSync(tempResult);
 const args=['--headless','--path',client,'--scene','res://tests/CampaignRecommendationHarness.tscn','--',`--data=${path.join(root,'data').replaceAll('\\','/')}`,`--stage=${stage}`,`--difficulty=${mode}`,`--hero=${hero}`,`--level=${level}`,`--target-wave=${target}`,`--seed=${seed}`,'--speed=8',`--output=${tempResult.replaceAll('\\','/')}`];
 const r=cp.spawnSync(godot,args,{encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024});
 if(!fs.existsSync(tempResult))throw Error(`Harness produced no result: ${stage}/${mode}/${hero}/L${level}\n${r.stdout}\n${r.stderr}`);
 const out=JSON.parse(fs.readFileSync(tempResult,'utf8'));out.process_exit=r.status;return out;
}
function evaluate(stage,mode,hero,level,target){let pass=0,cases=[];const needed=Math.ceil(seeds.length*threshold),allowedFail=seeds.length-needed;for(const seed of seeds){const row=runCase(stage,mode,hero,level,seed,target);cases.push(row);if(row.status==='PASS')pass++;if(pass>=needed||cases.length-pass>allowedFail)break;}return {passed:pass>=needed,pass,seeds_run:cases.length,required:needed,cases};}
function findMinimum(stage,mode,hero,start,max,target){for(let level=start;level<=max;level++){const trial=evaluate(stage,mode,hero,level,target);if(!trial.passed)continue;const sample=trial.cases.find(x=>x.status==='PASS');return {status:'PASS',hero_id:hero,minimum_level:level,recommended_power:sample.base_combat_power,base_stats:sample.base_stats,clear_rate:trial.pass/seeds.length,seeds_run:trial.seeds_run,checkpoint_wave:target,checkpoints:sample.checkpoints};}return {status:'UNSOLVED',hero_id:hero,start_level:start,max_level:max,checkpoint_wave:target};}
const arcOutputs=[];
for(const arc of selectedArcs){
 const heroId=heroByElement[String(arc.element)],hero=heroes.find(h=>h.id===heroId);if(!hero)throw Error(`Missing ${arc.element} reference hero for ${arc.id}`);
 const state=loadArc(arc,heroId),target=checkpoint(arc),existing=new Map(state.rows.map(r=>[`${r.stage_id}|${r.level_id}`,r]));
 const previous={normal:Number(arc.level_min),epic:Number(arc.level_min),legend:Number(arc.level_min)};
 for(const stage of arc.stage_ids){
  if(onlyStage&&stage!==onlyStage)continue;
  let sameStage=Number(arc.level_min);
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
   const start=Math.max(Number(arc.level_min),previous[mode],sameStage);
   const found=findMinimum(stage,mode,heroId,start,Number(arc.level_max),target);
   const row={arc_id:arc.id,stage_id:stage,level_id:mode,status:found.status,checkpoint_wave:target,recommended_power:found.recommended_power??null,recommended_hero_level:found.minimum_level??null,reference_hero:found,model,policy,clear_rate_target:threshold,lower_bound_level:start};
   state.rows=state.rows.filter(r=>`${r.stage_id}|${r.level_id}`!==key);state.rows.push(row);existing.set(key,row);atomicJson(arcFile(arc),state);
   if(found.status!=='PASS')break;
   sameStage=found.minimum_level;previous[mode]=found.minimum_level;
  }
 }
 const expected=arc.stage_ids.filter(s=>!onlyStage||s===onlyStage).length*(onlyMode?1:3);
 state.status=state.rows.filter(r=>(!onlyStage||r.stage_id===onlyStage)&&(!onlyMode||r.level_id===onlyMode)&&r.status==='PASS').length===expected?'COMPLETE':'UNSOLVED';
 state.completed_at=new Date().toISOString();atomicJson(arcFile(arc),state);arcOutputs.push(state);
 process.stderr.write(`[C218] saved ${arc.id}: ${state.status} -> ${arcFile(arc)}\n`);
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
