import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWebClientURL,webClientLink} from '../src/security.js';
import {createService} from '../src/server.js';
import {renderAccountMail} from '../src/mail-template.js';

test('web client origin is independent of API and validates environment URL boundaries',()=>{
 const base={APP_ENVIRONMENT:'production',ACCOUNT_IDENTITY_PUBLIC_URL:'https://api.lkvustudio.com',WEB_CLIENT_URL:'https://lkvustudio.com/ttl'};
 assert.equal(validateWebClientURL(base).origin,'https://lkvustudio.com');
 assert.equal(validateWebClientURL({...base,APP_ENVIRONMENT:'develop',WEB_CLIENT_URL:'https://survival-td-web.truyen24h.workers.dev'}).hostname,'survival-td-web.truyen24h.workers.dev');
 for(const value of ['http://lkvustudio.com','https://lkvustudio.com/bad%20path','https://user:pass@lkvustudio.com','https://lkvustudio.com/?x=1','https://lkvustudio.com/#token=x','https://lkvustudio.com\n'])assert.throws(()=>validateWebClientURL({...base,WEB_CLIENT_URL:value}));
 assert.equal(validateWebClientURL({...base,WEB_CLIENT_URL:''}).origin,base.ACCOUNT_IDENTITY_PUBLIC_URL,'Legacy API origin remains compatible');
});

test('mail action and policy links use the configured web origin for every purpose',()=>{
 for(const WEB_CLIENT_URL of ['https://survival-td-web.truyen24h.workers.dev','https://lkvustudio.com/ttl']){
  const origin=validateWebClientURL({WEB_CLIENT_URL,APP_ENVIRONMENT:'production'});
  for(const purpose of ['register_email','verify_legacy_email','delete_account','restore_account','reset_password']){
   const link=webClientLink(origin,'/account/confirm');link.hash=new URLSearchParams({token:'a'.repeat(43),purpose}).toString();
   const content=renderAccountMail({purpose,actionUrl:link.href,publicOrigin:origin.href,expiresAt:'2026-12-01T00:00:00Z'});
   assert(content.text.includes(WEB_CLIENT_URL+'/account/confirm#'));
   assert(content.text.includes(WEB_CLIENT_URL+'/account/privacy-policy/'));
   assert(!content.text.includes('api.lkvustudio.com'));
  }
 }
});

test('public GET/HEAD redirects to WEB_CLIENT_URL; POST authority stays on API origin',async t=>{
 const db={async query(sql){if(sql.includes('SELECT state FROM account_archive_restore_gate'))return {rows:[{state:'ready'}],rowCount:1};if(sql.includes('RETURNING count'))return {rows:[{count:1}]};return {rows:[],rowCount:0};},release(){}};
 const pool={...db,async connect(){return db;},async end(){}};
 const app=await createService({ACCOUNT_IDENTITY_SECRET:'a'.repeat(64),ACCOUNT_IDENTITY_OUTBOX_KEY:'b'.repeat(64),PGHOST:'unused',PGDATABASE:'unused',PGUSER:'unused',PGPASSWORD:'unused',NAKAMA_HTTP_KEY:'test',SMTP_USER:'test@gmail.com',SMTP_PASSWORD:'test',SMTP_FROM:'test@gmail.com',ACCOUNT_IDENTITY_PUBLIC_URL:'https://api.lkvustudio.com',WEB_CLIENT_URL:'https://lkvustudio.com/ttl',APP_ENVIRONMENT:'production',PORT:'0'}, {pool,transport:{}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
 const base='http://127.0.0.1:'+app.server.address().port;
 for(const method of ['GET','HEAD'])for(const path of ['/account/confirm','/account/privacy-policy','/account/privacy-policy/','/account/delete-account/index.html']){
  const r=await fetch(base+path,{method,redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://lkvustudio.com/ttl'+path);
 }
 const response=await fetch(base+'/account/link/status',{method:'POST',headers:{Origin:'https://lkvustudio.com','Content-Type':'application/json'},body:'{}'});
 assert.equal(response.status,403,'Browser direct POST cannot substitute the web origin for API authority');
});
