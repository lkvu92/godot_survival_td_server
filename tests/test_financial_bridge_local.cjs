const fs=require('fs'),assert=require('assert'),path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../nakama/.env.local'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
async function request(payload){const r=await fetch('http://127.0.0.1:7350/v2/rpc/google_play_financial_sync?http_key='+encodeURIComponent(env.NAKAMA_HTTP_KEY)+'&unwrap=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw Error('RPC HTTP '+r.status);return r.json();}
(async()=>{
 const wrong=await request({action:'batch',verifier_secret:'wrong'});assert.equal(wrong.reason,'FORBIDDEN');
 const batch=await request({action:'batch',verifier_secret:env.MONETIZATION_VERIFIER_SECRET});assert.equal(batch.success,true);assert.equal(batch.policy.enabled,false);assert.deepEqual(batch.orders,[]);
 const disabled=await request({action:'record',verifier_secret:env.MONETIZATION_VERIFIER_SECRET,purchase_order_id:'fixture-not-written'});assert.equal(disabled.reason,'SYNC_DISABLED');
 const health=await fetch('http://127.0.0.1:18082/health');assert(health.ok);
 console.log(JSON.stringify({suite:'C246 local bridge',generated_at:new Date().toISOString(),scope:'real local HTTP endpoints, disabled policy; no Google calls, records or money changes',results:[{case:'wrong secret',response:wrong},{case:'disabled batch',response:batch},{case:'disabled record',response:disabled},{case:'verifier health',result:'PASS'}]},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
