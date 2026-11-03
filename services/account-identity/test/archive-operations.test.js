import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHmac,createHash} from 'node:crypto';
import {retentionKeys,expiryPolicy} from '../src/archive-operations.js';
import {encryptBackup,decryptBackup,verifyLedger} from '../src/archive-recovery.js';
test('keyring refuses malformed keys, collisions and reused mail secrets',()=>{
 const a='a'.repeat(64),b='b'.repeat(64);
 assert.deepEqual(retentionKeys({ACCOUNT_RETENTION_KEY_ID:'old',ACCOUNT_RETENTION_KEY:a}),{old:a});
 for(const env of [{ACCOUNT_RETENTION_KEYS_JSON:'bad'},{ACCOUNT_RETENTION_KEYS_JSON:'[]'},{ACCOUNT_RETENTION_KEYS_JSON:'{"key":"12345"}'},{ACCOUNT_RETENTION_KEY_ID:'old',ACCOUNT_RETENTION_KEY:a,ACCOUNT_RETENTION_KEYS_JSON:JSON.stringify({old:b})},{ACCOUNT_RETENTION_KEY_ID:'old',ACCOUNT_RETENTION_KEY:a,ACCOUNT_IDENTITY_OUTBOX_KEY:a}])assert.throws(()=>retentionKeys(env));
});
test('expiry is disabled until explicit effective approval exists',()=>{
 const p={schema_version:1,revision:'reviewed',enabled:true,batch_size:20,identity_expiry:{enabled:true,approval_reference:'approved-case',approved_by:'reviewer',effective_at:'2020-01-01T00:00:00Z'}};
 assert.equal(expiryPolicy(p),p);
 for(const bad of [null,{}, {...p,enabled:false},{...p,batch_size:0},{...p,identity_expiry:{...p.identity_expiry,enabled:false}},{...p,identity_expiry:{...p.identity_expiry,approval_reference:'pending'}},{...p,identity_expiry:{...p.identity_expiry,effective_at:'2999-01-01T00:00:00Z'}}])assert.equal(expiryPolicy(bad),null);
});
test('backup encryption is authenticated and domain-separated from archive JSON',()=>{
 const key=randomBytes(32).toString('hex'),data=Buffer.concat([Buffer.from('fixture backup binary'),Buffer.from([0,1])]);
 const encrypted=encryptBackup(data,key);assert.deepEqual(decryptBackup(encrypted,key),data);assert(!encrypted.includes(data));
 const damaged=Buffer.from(encrypted);damaged[damaged.length-1]^=1;
 assert.throws(()=>decryptBackup(damaged,key));assert.throws(()=>decryptBackup(encrypted,randomBytes(32).toString('hex')));assert.throws(()=>verifyLedger({},key,'0'.repeat(64)));
});
test('legacy recovery ledger without privacy checkpoint fails closed',()=>{
 const secret=randomBytes(32).toString('hex');
 const body=JSON.stringify({schema_version:1,created_at:new Date().toISOString(),jobs:[],archives:[],holds:[],audit:[],claims:[],finance:{}});
 const envelope={schema_version:1,body,mac:createHmac('sha256',Buffer.from(secret,'hex')).update('C250-ledger:'+body).digest('hex')};
 const checkpoint=createHash('sha256').update(body).digest('hex');
 assert.throws(()=>verifyLedger(envelope,secret,checkpoint),/RECOVERY_LEDGER_SCHEMA_INVALID/);
});
