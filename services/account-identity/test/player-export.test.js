import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archivedPlayerIdentity} from '../src/player-export.js';
import {seal,hash} from '../src/security.js';
const uid='12345678-1234-1234-1234-123456789abc',key='d'.repeat(64);
test('archive export selects only requested subject and whitelisted identity',async()=>{
 const payload=seal({schema_version:3,subjects:[{id:uid,email:'fixture@example.com',activation_profile:{full_name:'Fixture',phone_number:'0900000000',challenge_id:'SECRET'}},{id:'other',email:'OTHER'}]},key);
 const row={payload,key_id:'k',content_digest:hash(payload)};
 const db={query:async(sql,args)=>{assert.deepEqual(args,[uid]);return {rows:[row]};}};
 const out=await archivedPlayerIdentity(db,uid,{k:key});assert.equal(out.records[0].profile.full_name,'Fixture');assert.equal(out.records[0].profile.email,'fixture@example.com');assert(!JSON.stringify(out).includes('SECRET'));assert(!JSON.stringify(out).includes('OTHER'));
 await assert.rejects(archivedPlayerIdentity(db,uid,{}),/KEY_MISSING/);
 row.content_digest='tampered';await assert.rejects(archivedPlayerIdentity(db,uid,{k:key}),/INTEGRITY/);
});
test('expired archives report absence without decrypting',async()=>{
 const out=await archivedPlayerIdentity({query:async()=>({rows:[{expired_at:new Date(),payload:''}]})},uid,{});assert.equal(out.records.length,0);assert.equal(out.warnings.length,1);
});
