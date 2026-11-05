// Isolated real Nakama HTTP + optional browser integration; no live DB writes.
const {execFileSync,spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),pg='survival_td_local-postgres-1',suffix=crypto.randomBytes(4).toString('hex'),db='c269_http_'+suffix,name='c269-http-'+suffix;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c269-http-')),admin=crypto.randomUUID(),custom=crypto.randomUUID(),serverKey=crypto.randomUUID(),password=crypto.randomUUID(),email='c269-'+suffix+'@example.test';
const docker=(args,input)=>execFileSync('docker',args,{encoding:'utf8',input,stdio:['pipe','pipe','pipe'],maxBuffer:80*1024*1024}).trim();
const psql=sql=>docker(['exec','-i',pg,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-tA'],sql);
let web,browser;let created=false,started=false;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){try{
 const network=docker(['inspect','-f','{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}',pg]),pgPassword=docker(['exec',pg,'printenv','POSTGRES_PASSWORD']);
 docker(['exec',pg,'createdb','-U','postgres',db]);created=true;
 fs.mkdirSync(path.join(dir,'modules'));
 const buildDir=path.join(root,'server/nakama/data/modules/build');const runtime=fs.readdirSync(buildDir).filter(f=>f.endsWith('.js')&&!['main.js','index.js'].includes(f)).map(f=>fs.readFileSync(path.join(buildDir,f),'utf8')).join('\n');
 fs.writeFileSync(path.join(dir,'modules/index.js'),runtime+`
 var InitModule=function(ctx,logger,nk,initializer){
 createEnemyCatalogTables(nk);
 initializer.registerRpc('admin_whoami',rpcAdminWhoami);
 initializer.registerRpc('admin_campaign_overview',rpc_admin_campaign_overview);
 initializer.registerRpc('admin_campaign_stage_get',rpc_admin_campaign_stage_get);
 initializer.registerRpc('admin_campaign_stage_save',rpc_admin_campaign_stage_save);
 initializer.registerRpc('admin_campaign_stage_resolve',rpc_admin_campaign_stage_resolve);
 initializer.registerRpc('admin_enemy_catalog_status',rpc_admin_enemy_catalog_status);
 initializer.registerRpc('admin_enemy_catalog_validate',rpc_admin_enemy_catalog_validate);
 initializer.registerRpc('admin_enemy_catalog_publish',rpc_admin_enemy_catalog_publish);
 initializer.registerRpc('admin_enemy_catalog_rollback',rpc_admin_enemy_catalog_rollback);
 initializer.registerRpc('admin_enemy_release_list',rpc_admin_enemy_release_list);
 initializer.registerRpc('admin_enemy_release_get',rpc_admin_enemy_release_get);
 initializer.registerRpc('admin_enemy_audit_list',rpc_admin_enemy_audit_list);
 initializer.registerRpc('admin_enemy_audit_get',rpc_admin_enemy_audit_get);
 initializer.registerRpc('admin_enemy_catalog_list',rpc_admin_enemy_catalog_list);
 initializer.registerRpc('admin_enemy_visual_set_list',rpc_admin_enemy_visual_set_list);
 initializer.registerRpc('admin_enemy_visual_asset_list',rpc_admin_enemy_visual_asset_list);
 initializer.registerRpc('admin_enemy_skill_list',rpc_admin_enemy_skill_list);
 initializer.registerRpc('get_stage_plan',getStagePlan);
 // Test-only fixture endpoint, isolated runtime/container, never shipped.
 };


 `);
 fs.writeFileSync(path.join(dir,'test.yml'),`name: c269-http\ndata_dir: /tmp/nakama\nlogger:\n  level: WARN\ndatabase:\n  address:\n    - ${JSON.stringify('postgres:'+encodeURIComponent(pgPassword)+'@'+pg+':5432/'+db)}\nsocket:\n  server_key: ${serverKey}\nsession:\n  encryption_key: ${crypto.randomUUID()}\n  refresh_encryption_key: ${crypto.randomUUID()}\nruntime:\n  path: /test/modules\n  js_entrypoint: index.js\n  env:\n    - CONFIG_ADMIN_USER_ID=${admin}\nconsole:\n  username: testadmin\n  password: ${crypto.randomUUID()}\n  signing_key: ${crypto.randomUUID()}\n`);
 const common=['--network',network,'-v',dir+':/test:ro','--entrypoint','/nakama/nakama','heroiclabs/nakama:3.24.2'];
 docker(['run','--rm',...common,'migrate','up','--config','/test/test.yml']);
 psql(fs.readFileSync(path.join(root,'tmp/c269/fixture.sql'),'utf8'));
 psql(`INSERT INTO users(id,username,custom_id) VALUES('${admin}','c269_admin','${custom}');`);
 docker(['run','-d','--name',name,'-p','127.0.0.1::7350',...common,'--config','/test/test.yml']);started=true;
 await wait(1500);let port;try{port=docker(['port',name,'7350/tcp']).split(':').pop();}catch{throw Error(docker(['logs',name]).replaceAll(pgPassword,'[redacted]').replaceAll(serverKey,'[redacted]'));}const url='http://127.0.0.1:'+port;
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/healthcheck')).ok){ready=true;break;}}catch{}await wait(250);}if(!ready)throw Error('Test Nakama startup failed: '+docker(['logs',name]));
 async function auth(kind,body){const r=await fetch(url+'/v2/account/authenticate/'+kind+'?create=true',{method:'POST',headers:{authorization:'Basic '+Buffer.from(serverKey+':').toString('base64'),'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();}
 async function rpc(token,id,body={}){const r=await fetch(url+'/v2/rpc/'+id,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(JSON.stringify(body))});const env=await r.json();assert.equal(r.status,200,JSON.stringify(env));return JSON.parse(env.payload);}
 const session=await auth('custom',{id:custom}),other=await auth('device',{id:'c269-other-'+suffix});
 assert.equal((await rpc(other.token,'admin_campaign_overview')).code,403);
 const overview=await rpc(session.token,'admin_campaign_overview');assert.equal(overview.success,true);
 const stageId=overview.data.stages.find(s=>s.managed).id;
 let stage=(await rpc(session.token,'admin_campaign_stage_get',{id:stageId})).data;
 const resolve=await rpc(session.token,'admin_campaign_stage_resolve',{document:stage.document,seed:269,difficulty_id:'normal'});assert.equal(resolve.success,true,JSON.stringify(resolve));
 const invalid=structuredClone(stage.document);invalid.stage_rules.element_rates.fire=49;assert.equal((await rpc(session.token,'admin_campaign_stage_save',{document:invalid,expected_revision:stage.revision,expected_draft_revision:stage.draft_revision})).code,422);
 const saved=await rpc(session.token,'admin_campaign_stage_save',{document:stage.document,expected_revision:stage.revision,expected_draft_revision:stage.draft_revision});assert.equal(saved.success,true,JSON.stringify(saved));
 assert.equal((await rpc(session.token,'admin_campaign_stage_save',{document:stage.document,expected_revision:stage.revision,expected_draft_revision:stage.draft_revision})).code,409);
 const validated=await rpc(session.token,'admin_enemy_catalog_validate');assert.equal(validated.data.valid,true,JSON.stringify(validated));
 const published=await rpc(session.token,'admin_enemy_catalog_publish',{expected_revision:saved.data.draft_revision,note:'C269 HTTP checkpoint'});assert.equal(published.success,true,JSON.stringify(published));
 const {database,runtime:loadRuntime}=require('../tools/enemy_catalog_db.cjs');const issued=loadRuntime().campaignRunPlan(database(pg,db),stageId,'normal','fixture-run');const run={run_id:'fixture-run',status:'active',expires_at_ms:Date.now()+60000,enemy_catalog_version:issued.content_version,encounter_plan:issued};psql("INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_stage_runs','active','"+admin+"','"+JSON.stringify(run).replaceAll("'","''")+"','fixture',1,0)");assert.equal((await rpc(session.token,'get_stage_plan',{run_id:'fixture-run'})).encounter_plan.stage_id,stageId);assert.equal((await rpc(other.token,'get_stage_plan',{run_id:'fixture-run'})).code,404);
 if(process.argv.includes('--game')){
  const godot=process.env.C269_GODOT||path.join(process.env.USERPROFILE,'Downloads/Godot_v4.6.3-stable_win64.exe/Godot_v4.6.3-stable_win64_console.exe');
  const output=execFileSync(godot,['--headless','--path',path.join(root,'client'),'--scene','res://tests/TestStageDesigner.tscn','--quit-after','600','--log-file',path.join(root,'tmp/c269-game-http.log')],{encoding:'utf8',env:{...process.env,C269_PLAN_URL:url,C269_PLAN_TOKEN:session.token},windowsHide:true});
  assert(output.includes('"status":"PASS"'),output);console.log(output.trim());
 }
 console.log('PASS Nakama HTTP: real sessions, admin authorization, resolve, invalid save, atomic save, 409, owner-only stored plan');
 if(process.argv.includes('--web')){
  const linked=await fetch(url+'/v2/account/link/email',{method:'POST',headers:{authorization:'Bearer '+session.token,'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(linked.status,200);
  const log=fs.openSync(path.join(root,'tmp/c269/web-server.log'),'w');
  web=spawn(process.execPath,[path.join(root,'web_client/node_modules/next/dist/bin/next'),'start','--port','3219'],{cwd:path.join(root,'web_client'),env:{...process.env,NODE_ENV:'production',NAKAMA_BASE_URL:url,NAKAMA_SERVER_KEY:serverKey,SESSION_SECRET:crypto.randomUUID()+crypto.randomUUID()},stdio:['ignore',log,log],windowsHide:true});
  const webUrl='http://localhost:3219';let webReady=false;for(let i=0;i<120;i++){try{if((await fetch(webUrl+'/login')).ok){webReady=true;break;}}catch{}await wait(500);}assert(webReady,'Next test server ready');
  const {chromium}=require(process.env.C269_PLAYWRIGHT_MODULE||path.join(root,'tmp/c269/browser/node_modules/playwright-core'));
  browser=await chromium.launch({headless:true,executablePath:process.env.C269_CHROMIUM||path.join(process.env.LOCALAPPDATA,'ms-playwright/chromium-1181/chrome-win/chrome.exe')});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=await context.request.post(webUrl+'/api/auth/login',{headers:{origin:webUrl},data:{email,password}});assert.equal(login.status(),200,await login.text());
  await page.goto(webUrl+'/dashboard/campaign');await page.getByRole('heading',{name:'Arc & Stage'}).waitFor();
  await page.getByRole('button',{name:new RegExp(stage.document.display_name)}).click();
  await page.getByRole('button',{name:'Kiểm tra & mô phỏng'}).waitFor();
  await page.getByText('Nhịp sinh quái & tăng tiến',{exact:true}).click();
  await page.getByRole('checkbox',{name:'Sinh lần lượt từng con, nghỉ sau con cuối'}).check();
  const spacing=page.getByRole('spinbutton',{name:'Khoảng cách từng con (s, tối thiểu 0,05)',exact:true});
  await spacing.fill('0');await page.getByRole('alert').filter({hasText:'individual_delay'}).waitFor();
  await spacing.fill('0.3');await page.getByRole('spinbutton',{name:'Quái mỗi đợt',exact:true}).fill('3');
  await page.getByRole('spinbutton',{name:'Nghỉ sau con cuối của đợt (s)',exact:true}).fill('2');
  await page.getByRole('button',{name:'Kiểm tra & mô phỏng'}).click();await page.getByRole('heading',{name:'Mô phỏng lịch xuất hiện'}).waitFor();
  await page.getByRole('button',{name:'Phát',exact:true}).click();await page.getByRole('button',{name:'x2',exact:true}).click();await wait(400);
  await page.screenshot({path:path.join(root,'tmp/c269/web-light.png'),fullPage:true});
  await page.evaluate(()=>{localStorage.setItem('theme','dark');document.documentElement.classList.add('dark');});
  await page.screenshot({path:path.join(root,'tmp/c269/web-dark.png'),fullPage:true});
  await page.getByRole('button',{name:'Thêm wave',exact:true}).click();
  const waveSelector=page.getByRole('combobox',{name:'Wave đang chỉnh'});await waveSelector.selectOption('1');
  const countInput=page.getByRole('spinbutton',{name:'Số lượng',exact:true}).first();await countInput.fill('7');await waveSelector.selectOption('0');assert.equal(await page.getByRole('spinbutton',{name:'Số lượng',exact:true}).first().inputValue(),'8');await waveSelector.selectOption('1');assert.equal(await page.getByRole('spinbutton',{name:'Số lượng',exact:true}).first().inputValue(),'7');
  await page.getByRole('button',{name:'Xóa wave',exact:true}).click();await page.getByRole('button',{name:'Xác nhận',exact:true}).click();assert.equal(await waveSelector.locator('option').count(),1);
  await page.getByRole('checkbox',{name:'Tỷ lệ hệ riêng cho wave'}).check();assert.equal(await page.getByRole('spinbutton',{name:'Hỏa (%)',exact:true}).count(),2);await page.getByRole('checkbox',{name:'Tỷ lệ hệ riêng cho wave'}).uncheck();
  const input=page.getByRole('spinbutton',{name:'Hỏa (%)',exact:true}).first();await input.fill('49');await page.getByRole('alert').filter({hasText:'Tổng năm tỷ lệ'}).waitFor();await input.fill('50');
  await page.getByRole('button',{name:'Lưu cấu hình',exact:true}).click();await page.getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.getByText('Đã lưu cấu hình stage',{exact:true}).waitFor();
  const savedPacing=(await rpc(session.token,'admin_campaign_stage_get',{id:stage.document.id})).data.document.stage_rules.spawn_pacing;assert.equal(savedPacing.individual_delay,0.3);assert.equal(savedPacing.batch_delay,2);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS browser: authenticated Next proxy -> Nakama, Arc/Stage selection, preview animation x2, light/dark, percentage validation, confirmed save, no JS errors');
 }
}finally{
 if(browser)await browser.close();if(web){web.kill();await wait(500);}
 if(started){try{fs.writeFileSync(path.join(root,'tmp/c269/http-runtime.log'),docker(['logs',name]));}catch{}docker(['rm','-f',name]);}if(created)docker(['exec',pg,'dropdb','-U','postgres','--force',db]);
 const target=path.resolve(dir);if(!target.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(target).startsWith('c269-http-'))throw Error('Unsafe cleanup target');fs.rmSync(target,{recursive:true,force:true});
}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});


