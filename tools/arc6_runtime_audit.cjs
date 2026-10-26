/* C221 real Godot full-run audit. Explicit fixture injection is test-only.
 * Does not publish, alter profiles, or write catalog recommendations. */
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const args=process.argv.slice(2), get=k=>(args.find(a=>a.startsWith('--'+k+'='))||'').slice(k.length+3);
for(const arg of args) if(!/^--(godot|seeds|stages|heroes|modes|level|report|jobs|movement|tier-levels)=/.test(arg)) throw Error('Unknown argument '+arg);
const godot=get('godot')||process.env.GODOT_BIN;
if(!godot||!fs.existsSync(godot))throw Error('Pass --godot=<console executable>');
const server=path.join(__dirname,'..'), client=path.join(server,'..','client');
const load=n=>JSON.parse(fs.readFileSync(path.join(server,'data',n+'.json'),'utf8'));
const stages=get('stages')?get('stages').split(','):load('arcs').find(a=>a.id==='arc_ngu_to_quy_khu').stage_ids;
const heroes=get('heroes')?get('heroes').split(','):load('heroes').map(h=>h.id);
const seeds=(get('seeds')||'221,222,223').split(',').map(Number), modes=(get('modes')||'normal,epic,legend').split(',');
const level=Number(get('level')||35),jobs=Number(get('jobs')||2);
const tierLevels=get('tier-levels')?get('tier-levels').split(',').map(Number):null;
if(tierLevels&&(tierLevels.length!==3||tierLevels.some(x=>!Number.isInteger(x)||x<1||x>47)))throw Error('Use three tier levels between1 and47');
const movement=get('movement')||'kite';
if(!['stationary','approach','kite'].includes(movement))throw Error('Invalid movement');
if(!Number.isInteger(level)||level<1||level>50||!Number.isInteger(jobs)||jobs<1||jobs>4||seeds.some(x=>!Number.isInteger(x)))throw Error('Invalid level/jobs/seeds');
const output=path.resolve(get('report')||path.join(server,'docs/reports/ARC6_RUNTIME_LV35.json'));
const temporary=fs.mkdtempSync(path.join(server,'..','tmp','arc6-audit-'));
const cases=[];
for(const stage of stages)for(const mode of modes)for(const hero of heroes)for(const seed of seeds)cases.push({stage,mode,hero,seed,level:tierLevels?tierLevels[['normal','epic','legend'].indexOf(mode)]+Math.floor((Number(stage.slice(-2))-1)/3):level});
const catalogDigest=()=>crypto.createHash('sha256').update(JSON.stringify({enemies:load('enemies').filter(e=>e.id.startsWith('arc6_')),stages:load('stages').filter(s=>s.arc_id==='arc_ngu_to_quy_khu')})).digest('hex');
const startDigest=catalogDigest();
let cursor=0,done=0; const results=[];
function runCase(test,index) {
  return new Promise(resolve=>{
    const file=path.join(temporary,`case-${index}.json`), log=path.join(temporary,`case-${index}.log`);
    const command=['--headless','--path',client,'--scene','res://tests/CampaignRecommendationHarness.tscn','--fixed-fps','60','--log-file',log,'--',`--data=${path.join(server,'data')}`,`--stage=${test.stage}`,`--difficulty=${test.mode}`,`--hero=${test.hero}`,`--seed=${test.seed}`,`--level=${test.level}`,'--target-wave=20','--require-max-skills=false','--mortal=true',`--movement=${movement}`,'--speed=8','--timeout=2400',`--output=${file}`];
    const child=cp.spawn(godot,command,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let tail='',expired=false,settled=false;
    const timer=setTimeout(()=>{expired=true;child.kill();},120000);
    const finish=(code,error)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      let row;
      try{row=JSON.parse(fs.readFileSync(file,'utf8'));}catch{row={status:'ERROR',reason:expired?'process_timeout':error||'no_output',diagnostic:tail.slice(-3000)};}
      if (row.mortal !== true) row={...row,status:'ERROR',reason:'mortal_mode_not_verified'};
      resolve({...row,case_index:index,process_exit:code,requested:test});
    };
    for(const stream of [child.stdout,child.stderr])stream.on('data',buffer=>{tail=(tail+buffer.toString()).slice(-6000);});
    child.on('error',err=>finish(null,err.message));child.on('exit',code=>finish(code));
  });
}
async function worker(){while(cursor<cases.length){const index=cursor++,test=cases[index];const row=await runCase(test,index);results.push(row);done++;if(done%10===0||row.status!=='PASS'||done===cases.length)console.log(JSON.stringify({done,total:cases.length,stage:test.stage,mode:test.mode,hero:test.hero,seed:test.seed,status:row.status,reason:row.reason}));}}
(async()=>{
  await Promise.all(Array.from({length:jobs},worker));
  results.sort((a,b)=>a.case_index-b.case_index);
  const summary=stages.flatMap(stage=>modes.map(mode=>{const rows=results.filter(r=>r.requested.stage===stage&&r.requested.mode===mode);return {stage_id:stage,level_id:mode,cases:rows.length,passed:rows.filter(r=>r.status==='PASS'&&r.process_exit===0).length,failed:rows.filter(r=>r.status!=='PASS'||r.process_exit!==0).map(r=>({hero:r.requested.hero,seed:r.requested.seed,reason:r.reason,run_level:r.run_level})),reference_hero_level:Math.max(...rows.map(r=>r.requested.level)),max_reference_power:Math.max(0,...rows.map(r=>Number(r.base_combat_power)||0))};}));
  const report={version:1,model:'godot_full_run_neutral_offered_cards_survival_v1',mortal:true,catalog_digest:startDigest,valid_for_balance:startDigest===catalogDigest(),reference_level:level,tier_levels:tierLevels,seeds,heroes,modes,target_wave:20,require_max_skills:false,loadout:'no equipment, cultivation or elemental affinity',movement,summary,results};
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  const passed=results.filter(r=>r.status==='PASS'&&r.process_exit===0).length;
  console.log(JSON.stringify({status:passed===cases.length?'PASS':'REVIEW',passed,cases:cases.length,report:output,artifacts:temporary}));
  if(results.some(r=>r.status==='ERROR'))process.exitCode=1;
})().catch(err=>{console.error(err);process.exitCode=1;});
