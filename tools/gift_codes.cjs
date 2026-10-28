#!/usr/bin/env node
// C234. Draft secrets stay in an ignored private file, never in seed/client data.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
function flag(args,name,fallback){const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];}
function date(value){if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isSafeInteger(Date.parse(value)))throw Error('Use ISO date with timezone');return Date.parse(value);}
function drafts(options={}) {
    const start=options.start||Date.now(),end=options.end||start+30*86400000;
    const common={enabled:false,starts_at_ms:start,expires_at_ms:end,allowed_servers:options.servers||[],max_uses:null,mail_claim_days:30};
    const item=(id,amount)=>({type:'item',id,amount});
    const resource=(id,amount)=>({type:'resource',id,amount});
    const make=(code,title,rewards)=>({action:'upsert',expected_revision:0,reason:'Initial campaign setup',definition:{...common,code,mail_title:title,mail_body:'Cảm ơn đạo hữu đồng hành cùng Thông Thiên Lộ. Hãy nhận quà đính kèm!',rewards}});
    return [make('TANTHU','Quà chào mừng tân thủ',[item('healing_elixir',20),item('shield_elixir',10),item('energy_elixir',10),resource('gold',5000),resource('gems',50)]),
        make('KHAIMOSERVER','Quà khai mở server',[{type:'random_item',pool:['earth','fire','metal','water','wood'].map(e=>'rune_'+e+'_high'),amount:20},item('talisman_enhance_charm',1),item('element_enlightenment_charm',1),item('talisman_fragment_1',15),item('campaign_sweep_ticket',20),item('revive_talisman',1)]),
        make('TEST_'+crypto.randomBytes(24).toString('hex').toUpperCase(),'Quà tester',JSON.parse(fs.readFileSync(path.join(root,'data/items.json'),'utf8').replace(/^\uFEFF/,'')).map(r=>item(r.id,r.category==='talisman'?1:1000)))];
}
async function main(args) {
    const command=args[0];
    if(command==='draft') {
        const file=path.resolve(flag(args,'out',path.join(root,'.tmp-giftcodes/campaigns.private.json')));
        if(fs.existsSync(file))throw Error('Draft exists; choose a new --out file to preserve existing tester code');
        const start=flag(args,'start'),end=flag(args,'end');
        fs.mkdirSync(path.dirname(file),{recursive:true});
        fs.writeFileSync(file,JSON.stringify(drafts({start:start?date(start):undefined,end:end?date(end):undefined,servers:(flag(args,'servers','')).split(',').filter(Boolean)}),null,2)+'\n',{mode:0o600,flag:'wx'});
        console.log('Private drafts saved to '+file+'. Disabled until edited and published.');return;
    }
    const operatorFile=flag(args,'operator-config');
    let operatorToken='',httpKey='';
    if(operatorFile){
        const config=JSON.parse(fs.readFileSync(operatorFile,'utf8').replace(/^\uFEFF/,''));
        const env=Object.fromEntries((config.runtime?.env||[]).map(line=>{const index=line.indexOf('=');return [line.slice(0,index),line.slice(index+1)];}));
        operatorToken=env.CONFIG_PUBLISH_TOKEN||'';httpKey=config.runtime?.http_key||'';
        if(operatorToken.length<64||!httpKey)throw Error('Private runtime config lacks operator credentials');
    }
    const token=process.env.GIFT_ADMIN_TOKEN,url=flag(args,'url','http://127.0.0.1:7350');
    if(!operatorFile&&!token)throw Error('Set GIFT_ADMIN_TOKEN or use --operator-config PRIVATE_RUNTIME_CONFIG');
    const target=new URL(url);
    if(target.protocol!=='https:'&&!(target.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(target.hostname)))throw Error('Remote RPC requires HTTPS');
    const rpc=async body=>{
        const endpoint=new URL('/v2/rpc/'+(operatorFile?'operator_gift_codes':'gift_code_admin'),target);
        const headers={'Content-Type':'application/json'};
        if(operatorFile)endpoint.searchParams.set('http_key',httpKey);else headers.Authorization='Bearer '+token;
        const payload=operatorFile?{...body,publish_token:operatorToken}:body;
        const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(JSON.stringify(payload)),signal:AbortSignal.timeout(30000)});
        const envelope=await response.json(),result=typeof envelope.payload==='string'?JSON.parse(envelope.payload):envelope;
        if(!response.ok||result.success!==true)throw Error('Gift admin failed: '+String(result.code||response.status)+' '+String(result.message||''));
        return result;
    };
    if(command==='publish') {
        const file=flag(args,'file');if(!file)throw Error('publish requires --file');
        const entries=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
        if(!Array.isArray(entries)||!entries.length)throw Error('Expected array of upsert requests');
        for(let i=0;i<entries.length;i++){const result=await rpc(entries[i]);console.log('Published entry '+(i+1)+', revision '+result.definition.revision+', enabled='+result.definition.enabled);}
        return;
    }
    if(command==='list'||command==='history') {
        const result=await rpc({action:command,code:flag(args,'code'),cursor:flag(args,'cursor',''),limit:50});
        console.log(JSON.stringify(result,null,2));return;
    }
    throw Error('Usage: node tools/gift_codes.cjs draft [--start ISO --end ISO --servers s001] | publish --file PRIVATE_JSON | list | history --code CODE [--url URL]');
}
module.exports={drafts,date};
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
