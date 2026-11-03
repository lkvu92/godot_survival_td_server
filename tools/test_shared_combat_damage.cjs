/* C240 test-only external snapshots; never authenticate, seed a DB or load gameplay fallback. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const args=process.argv.slice(2),get=(key,fallback)=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const root=path.resolve(__dirname,'..'),workspace=path.resolve(root,'..'),client=path.join(workspace,'client');
const godot=get('godot',process.env.GODOT_BIN);if(!godot||!fs.existsSync(godot))throw Error('Pass --godot=console.exe');
const out=path.resolve(get('out',path.join(workspace,'tmp/c240-runtime')));fs.mkdirSync(out,{recursive:true});
const data=path.join(root,'data'),read=name=>JSON.parse(fs.readFileSync(path.join(data,name+'.json'),'utf8'));
const snapshot={schema_version:2};for(const name of ['heroes','enemies','skills','effects','enemy_skills','boss_skills','items','arcs','stages','stage_levels','cards','talismans','progression','packs','first_topup','daily_checkin','events','rewarded_ads'])snapshot[name]=read(name);
for(const [key,name]of [['vip','vip_config'],['stamina','stamina_config'],['tribulation','tribulation_config']])snapshot[key]=read(name);
const snapshotFile=path.join(out,'external-test-snapshot.json');fs.writeFileSync(snapshotFile,JSON.stringify(snapshot));
const entries=[
 ['native_atlas','TestNativeSkillAtlas.tscn',[data]],
 ['shared','TestSharedCombatDamage.tscn',[]],
 ['element','TestElementCombatRuntime.tscn',[path.join(data,'progression.json')]],
 ['additive','TestAdditiveCombatBonuses.tscn',[]],
 ['tower_parity','TestTowerCombatParity.tscn',[]],
 ['tower_battle','TestTrialTowerBattle.tscn',[]],
 ['tribulation','TestTribulationBalance.tscn',[snapshotFile]],
 ['source_lifetime','test_damage_source_lifetime.tscn',[]],
 ['status_lifetime','TestStatusSourceLifetime.tscn',[data]],
 ['arc7','TestArc7Campaign.tscn',[data]],
 ['creep_casts','TestCreepFireSkills.tscn',[path.join(data,'enemies.json')]],
 ['wraith_casts','TestPrimordialWraithSkills.tscn',[path.join(data,'enemies.json')]],
 ['tiger_casts','TestTigerRework.tscn',[data]],
 ['vermilion_casts','TestVermilionRework.tscn',[data]],
 ['low_talismans','TestLowTierTalismans.tscn',[data]],
 ['layered_talismans','TestLayeredTalismans.tscn',[data]],
 ['mid_talismans','TestMidTierTalismans.tscn',[data]]
].filter(([id])=>!get('only','')||get('only','').split(',').includes(id));
let next=0;const results=[];
async function worker(){while(next<entries.length){const [id,scene,extra]=entries[next++],logfile=path.join(out,id+'.log');const row=await new Promise(resolve=>{let log='',timedOut=false;const child=spawn(godot,['--headless','--fixed-fps','60','--path',client,'--scene',`res://tests/${scene}`,'--log-file',path.join(out,id+'.engine.log'),'--quit-after','30000','--',...extra],{windowsHide:true});const timer=setTimeout(()=>{timedOut=true;child.kill();},120000);child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.on('error',error=>{clearTimeout(timer);resolve({id,status:'ERROR',error:error.message});});child.on('close',code=>{clearTimeout(timer);fs.writeFileSync(logfile,log);const scriptErrors=/SCRIPT ERROR:|Parse Error:|Assertion failed|AssertionError/.test(log),otherErrors=log.split('\n').filter(l=>/ERROR:/.test(l)&&!l.includes('resources still in use at exit'));resolve({id,exit:code,status:code===0&&!timedOut&&!scriptErrors&&!otherErrors.length?'PASS':'FAIL',timed_out:timedOut,script_errors:scriptErrors,other_errors:otherErrors,cleanup_warning:/ObjectDB instances leaked|resources still in use at exit/.test(log),log:path.relative(workspace,logfile)});});});results.push(row);console.log(JSON.stringify(row));}}
(async()=>{await Promise.all(Array.from({length:Number(get('jobs','3'))},worker));results.sort((a,b)=>a.id.localeCompare(b.id));const report={version:1,status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',test_only:true,results};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(`C240_RUNTIME=${report.status} ${results.filter(r=>r.status==='PASS').length}/${results.length}`);if(report.status!=='PASS')process.exitCode=1;})();
