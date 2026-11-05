// Isolated real PostgreSQL regression tests; never touches a game database.
const {execFileSync,spawn}=require('node:child_process');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const container=process.env.SUPPORT_TEST_CONTAINER||'c232-test-postgres-1';
const database='support_test_'+crypto.randomBytes(6).toString('hex');
const args=['exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-tA'];
function psql(sql,db=database){return execFileSync('docker',[...args,'-d',db],{input:sql,encoding:'utf8',maxBuffer:8e6}).trim();}
function bind(sql,params){return sql.replace(/\$(\d+)/g,(_,n)=>{const v=params[Number(n)-1];return v===null?'NULL':typeof v==='boolean'?String(v):typeof v==='number'?String(v):"'"+String(v).replace(/'/g,"''")+"'";});}
function query(sql,params=[]){const bound=bind(sql,params);let prefix='WITH q AS ('+bound+')';if(bound.startsWith('WITH changed AS')){const i=bound.indexOf(') SELECT ');prefix=bound.slice(0,i+1)+',q AS ('+bound.slice(i+2)+')';}return JSON.parse(psql(prefix+" SELECT COALESCE(json_agg(row_to_json(q)),'[]'::json) FROM q;"));}
const player=crypto.randomUUID(),other=crypto.randomUUID(),admin=crypto.randomUUID(),admin2=crypto.randomUUID();
const nk={sqlExec:(s,p)=>psql(bind(s,p)),sqlQuery:query,uuidv4:()=>crypto.randomUUID()};
const ctx={userId:player,env:{CONFIG_ADMIN_USER_ID:admin+','+admin2}};
const sandbox={console,JSON,Date,Number,Array,String,Object,Math,RegExp,serverRequest:p=>JSON.parse(p||'{}'),serverFailure:(reason,code,message)=>JSON.stringify({success:false,reason,code,message}),isConfigAdmin:c=>c.env.CONFIG_ADMIN_USER_ID.split(',').includes(c.userId),requireServerAdmin:c=>c.env.CONFIG_ADMIN_USER_ID.split(',').includes(c.userId)?null:JSON.stringify({success:false,code:403})};
vm.createContext(sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../nakama/data/modules/build/profanity_filter.js'),'utf8'),sandbox);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../nakama/data/modules/build/support.js'),'utf8'),sandbox);
const handler=(action,isAdmin=false,user=player,input={})=>JSON.parse(sandbox.supportHandler(action,isAdmin)({...ctx,userId:user},{},nk,JSON.stringify(input)));
let passed=0;function check(name,fn){fn();passed++;console.log('PASS '+name);}
async function main(){
 psql('CREATE DATABASE '+database,'postgres');
 try{
 sandbox.createSupportTables(nk);sandbox.createSupportTables(nk);
 check('free-text filter permits support role words and rejects profanity',()=>{assert.equal(vm.runInContext("validateSupportText('Nhờ admin hỗ trợ kiểm tra tài khoản')",sandbox),true);assert.equal(handler('create',false,player,{request_id:crypto.randomUUID(),category:'bug',title:'fuck test',body:'test'}).code,400);assert.equal(handler('create',false,player,{request_id:crypto.randomUUID(),category:'bug',title:'Valid test',body:'fuck'}).code,400);});
 const request={request_id:crypto.randomUUID(),category:'bug',title:'Ticket thử nghiệm',body:'Lỗi khi vào màn chơi',server_id:'',generation:0,metadata:{version:'test',platform:'test'}};
 const created=handler('create',false,player,request);assert.equal(created.success,true,JSON.stringify(created));let ticket=created.data.ticket;
 check('retry returns same ticket and does not duplicate',()=>{assert.equal(handler('create',false,player,request).data.ticket.id,ticket.id);assert.equal(query('SELECT COUNT(*)::int AS n FROM support_messages')[0].n,1);});
 check('same UUID with changed content conflicts',()=>assert.equal(handler('create',false,player,{...request,body:'changed'}).code,409));
 check('owner isolation get/list/read/reply',()=>{assert.equal(handler('get',false,other,{ticket_id:ticket.id}).code,404);assert.equal(handler('list',false,other).data.tickets.length,0);assert.equal(handler('read',false,other,{ticket_id:ticket.id,public_seq:1}).code,404);assert.equal(handler('reply',false,other,{ticket_id:ticket.id,request_id:crypto.randomUUID(),expected_version:1,body:'x'}).code,404);});
 check('admin authorization on all endpoints',()=>{for(const a of ['list','get','reply','update'])assert.equal(handler(a,true,other).code,403);});
 check('reject malformed bounds and metadata',()=>{assert.equal(handler('create',false,player,{...request,request_id:crypto.randomUUID(),metadata:{steps:123}}).code,400);assert.equal(handler('list',false,player,{limit:31}).code,400);assert.equal(handler('get',false,player,{ticket_id:ticket.id,cursor:'bad'}).code,400);});
 const mutate=(action,input={},who=admin)=>handler(action,true,who,{ticket_id:ticket.id,expected_version:ticket.version,request_id:crypto.randomUUID(),...input});
 const note=mutate('reply',{body:'SECRET INTERNAL',internal:true});assert.equal(note.success,true);ticket=note.data.ticket;
 check('internal notes excluded by server projection and unread unchanged',()=>{const data=handler('get',false,player,{ticket_id:ticket.id}).data;assert.equal(data.messages.length,1);assert.equal(JSON.stringify(data).includes('SECRET'),false);assert.equal('events' in data,false);assert.equal(data.ticket.unread,false);assert.equal(handler('get',true,admin,{ticket_id:ticket.id}).data.messages.length,2);});
 const publicReply={ticket_id:ticket.id,expected_version:ticket.version,request_id:crypto.randomUUID(),body:'Đã tiếp nhận',internal:false};ticket=handler('reply',true,admin,publicReply).data.ticket;
 check('public reply unread and retry does not duplicate',()=>{assert.equal(ticket.unread,true);assert.equal(handler('reply',true,admin,publicReply).data.ticket.version,ticket.version);assert.equal(handler('list',false,player).data.unread_count,1);});
 const observed=ticket.public_seq;
 ticket=mutate('reply',{body:'Bổ sung',internal:false}).data.ticket;
 handler('read',false,player,{ticket_id:ticket.id,public_seq:observed});
 check('read snapshot cannot erase a newer reply',()=>{assert.equal(handler('list',false,player).data.unread_count,1);assert.equal(handler('read',false,player,{ticket_id:ticket.id,public_seq:999999}).code,400);});
 check('stale update is rejected without an audit',()=>{const before=query('SELECT COUNT(*)::int AS n FROM support_ticket_events')[0].n;assert.equal(mutate('update',{expected_version:1,status:'resolved'}).code,409);assert.equal(query('SELECT COUNT(*)::int AS n FROM support_ticket_events')[0].n,before);});
 check('assignment validates configured admin',()=>assert.equal(mutate('update',{assignee:other}).code,400));
 ticket=mutate('update',{status:'waiting_player',assignee:admin2,priority:'high'}).data.ticket;
 const replyInput={ticket_id:ticket.id,request_id:crypto.randomUUID(),expected_version:ticket.version,body:'Đã bổ sung'};
 ticket=handler('reply',false,player,replyInput).data.ticket;
 check('player reply resumes processing and retains unseen unread',()=>{assert.equal(ticket.status,'in_progress');assert.equal(ticket.unread,true);});
 ticket=mutate('update',{status:'resolved'}).data.ticket;
 ticket=handler('close',false,player,{ticket_id:ticket.id,request_id:crypto.randomUUID(),expected_version:ticket.version}).data.ticket;
 check('closed disallows public reply',()=>assert.equal(handler('reply',false,player,{ticket_id:ticket.id,request_id:crypto.randomUUID(),expected_version:ticket.version,body:'x'}).code,409));
 ticket=handler('reopen',false,player,{ticket_id:ticket.id,request_id:crypto.randomUUID(),expected_version:ticket.version}).data.ticket;assert.equal(ticket.status,'in_progress');
 ticket=mutate('update',{status:'closed'}).data.ticket;
 psql(`UPDATE support_tickets SET closed_at=NOW()-INTERVAL '8 days' WHERE id='${ticket.id}'`);
 check('reopen deadline enforced',()=>assert.equal(handler('reopen',false,player,{ticket_id:ticket.id,request_id:crypto.randomUUID(),expected_version:ticket.version}).code,409));
 check('ticket daily rate limit',()=>{for(let i=0;i<4;i++)assert.equal(handler('create',false,player,{...request,request_id:crypto.randomUUID()}).success,true);assert.equal(handler('create',false,player,{...request,request_id:crypto.randomUUID()}).code,429);});
 check('ticket keyset pagination complete',()=>{const seen=[];let cursor='';do{const page=handler('list',false,player,{cursor,limit:2}).data;seen.push(...page.tickets.map(t=>t.id));cursor=page.next_cursor;}while(cursor);assert.equal(new Set(seen).size,5);assert.equal(seen.length,5);});
 // Concurrent writers are independent PostgreSQL connections.
 const raceId=handler('list',false,player).data.tickets.find(t=>t.status==='new').id;
 const raceTicket=handler('get',true,admin,{ticket_id:raceId}).data.ticket;
 function concurrent(who){const r={ticket_id:raceId,request_id:crypto.randomUUID(),expected_version:raceTicket.version,status:'in_progress'};const sql=bind('SELECT support_mutate($1::uuid,true,\'update\',$2::jsonb,$3::uuid)',[who,JSON.stringify(r),crypto.randomUUID()]);return new Promise((resolve,reject)=>{const p=spawn('docker',[...args,'-d',database]);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('close',code=>code?reject(new Error(err)):resolve(JSON.parse(out)));p.stdin.end(sql);});}
 const race=await Promise.all([concurrent(admin),concurrent(admin2)]);
 check('concurrent CAS permits exactly one writer',()=>{assert.equal(race.filter(r=>r.success).length,1);assert.equal(race.filter(r=>r.code===409).length,1);});
 check('message pagination and private notes stay hidden across pages',()=>{psql(`INSERT INTO support_messages(ticket_id,author_id,author_kind,internal,body) SELECT '${raceId}','${admin}','admin',i%2=0,'page '||i FROM generate_series(1,120) i;`);let cursor='',seen=[];do{const data=handler('get',false,player,{ticket_id:raceId,cursor}).data;assert.equal(data.messages.every(m=>!m.internal),true);seen.push(...data.messages.map(m=>m.id));cursor=data.next_cursor;}while(cursor);assert.equal(new Set(seen).size,61);});
 check('reply hourly rate limit',()=>{assert.equal(handler('reply',true,admin,{ticket_id:raceId,request_id:crypto.randomUUID(),expected_version:2,body:'limited'}).code,429);});
 check('all successful mutations audited',()=>{assert.equal(query('SELECT COUNT(*)::int AS n FROM support_ticket_events')[0].n,query('SELECT COUNT(*)::int AS n FROM support_receipts')[0].n);});
 console.log(`PASS support MVP: ${passed} real PostgreSQL checks`);
 }finally{psql('DROP DATABASE '+database,'postgres');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
