import test from 'node:test';
import assert from 'node:assert/strict';
import {validateArchivePolicy as validateDeletionPolicy,archiveAccount as authorizePurge} from '../src/archive.js';
import {policy} from './archive-policy.fixture.js';

test('policy must be explicit and valid; snapshot is independent of later config changes',()=>{
 const snapshot=validateDeletionPolicy(policy);assert.equal(snapshot.soft_delete_days,14);
 for(const p of [null,{}, {...policy,enabled:false},{...policy,soft_delete_days:0},{...policy,soft_delete_days:1.5},{...policy,datasets:[]},{...policy,revision:''}])assert.throws(()=>validateDeletionPolicy(p),/DELETION_POLICY_UNAVAILABLE/);
 const changed={...policy,soft_delete_days:7};validateDeletionPolicy(changed);assert.equal(snapshot.soft_delete_days,14);
});
test('purge with missing/malformed archive key never even reads or mutates the database',async()=>{
 const db={query(){assert.fail('No SQL allowed without archive protection');}};
 for(const key of [undefined,'','12345','g'.repeat(64)])assert.equal(await authorizePurge(db,'fixture',key),false);
});
