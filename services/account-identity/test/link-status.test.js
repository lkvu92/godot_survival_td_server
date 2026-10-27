import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createService} from '../src/server.js';

test('browser keeps credentials hidden until validated, and hides consumed links',async()=>{
 const source=await readFile(new URL('../public/confirm.js',import.meta.url),'utf8');
 for(const valid of [true,false]){
  const nodes=new Map();
  const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',dataset:{},classList:{toggle(){}},addEventListener(){}});return nodes.get(id);}};
  let resolve;
  const pending=new Promise(r=>resolve=r);
  vm.runInNewContext(source,{document,URLSearchParams,location:{hash:'#token='+ 'a'.repeat(43)+'&purpose=register_email',pathname:'/account/confirm'},history:{replaceState(){}},fetch:()=>pending});
  assert.equal(nodes.get('form').hidden,true);
  resolve({ok:valid,json:async()=>({success:valid,message:'Link đã dùng.'})});
  await new Promise(r=>setImmediate(r));
  assert.equal(nodes.get('form').hidden,!valid);
  if(!valid)assert.equal(nodes.get('status').textContent,'Link đã dùng.');
 }
});

test('Google proof accepts valid Gmail OAuth even when email registration reports conflict',async t=>{
 const queries=[];
 const db={async query(sql){queries.push(sql);if(sql.includes('RETURNING count'))return {rows:[{count:1}]};if(sql==='SELECT 1 FROM users WHERE email=$1')return {rowCount:1,rows:[{}]};return {rows:[],rowCount:0};},release(){}};
 const pool={...db,async connect(){return db;},async end(){}};
 const secret='a'.repeat(64);
 const app=await createService({ACCOUNT_IDENTITY_SECRET:secret,ACCOUNT_IDENTITY_OUTBOX_KEY:'b'.repeat(64),PGHOST:'unused',PGDATABASE:'unused',PGUSER:'unused',PGPASSWORD:'unused',NAKAMA_HTTP_KEY:'test',SMTP_USER:'test@gmail.com',SMTP_PASSWORD:'test',SMTP_FROM:'test@gmail.com',ACCOUNT_IDENTITY_PUBLIC_URL:'https://identity.example',GOOGLE_WEB_CLIENT_IDS:'google-client',PORT:'0'},
  {pool,transport:{},google:{async verifyIdToken(){return {getPayload:()=>({sub:'google-owner',email:'owner@gmail.com',email_verified:true})};}}});
 await app.start();t.after(()=>app.close());
 const post=async(path,body,auth)=>{
  const response=await fetch('http://127.0.0.1:'+app.server.address().port+'/account/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+secret}:{})},body:JSON.stringify(body)});
  return {status:response.status,...await response.json()};
 };
 assert.equal((await post('registration/request',{email:'owner@gmail.com'})).code,'ACCOUNT_EXISTS');
 queries.length=0;
 const proof=await post('internal/google-proof',{id_token:'valid-provider-proof'},true);
 assert.equal(proof.success,true);assert.equal(proof.authoritative_email,'owner@gmail.com');
 assert.equal(queries.some(q=>q.includes('FROM users')||q.includes('account_identity_challenges')),false);
});
