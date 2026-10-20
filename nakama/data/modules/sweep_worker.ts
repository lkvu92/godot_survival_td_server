// C144: durable scheduling metadata only. Rewards and receipts remain one Storage transaction.
function sweepCreateWorkerIndex(nk: nkruntime.Nakama): void {
    nk.sqlExec(`CREATE INDEX IF NOT EXISTS storage_sweep_due_idx ON storage
      ((LEAST((value->'sweep'->>'next_due_at_ms')::BIGINT, (value->'sweep'->>'cancel_at_ms')::BIGINT)),user_id,key)
      WHERE collection='player_profiles' AND value->'sweep'->>'status' IN ('running','cancelling');
    CREATE TABLE IF NOT EXISTS sweep_worker_claims (
      user_id UUID NOT NULL, storage_key TEXT NOT NULL, lease_id TEXT NOT NULL,
      lease_until TIMESTAMPTZ NOT NULL, retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id,storage_key));
    CREATE INDEX IF NOT EXISTS sweep_worker_claim_expiry_idx ON sweep_worker_claims(lease_until);`, []);
}

const rpcSweepTick: nkruntime.RpcFunction = (ctx, logger, nk, _payload) => {
    // Nakama authenticates userless calls with runtime HTTP key at the gateway.
    if (ctx.userId && ctx.userId !== String((ctx.env || {}).CONFIG_ADMIN_USER_ID || ''))
        return JSON.stringify({success:false,code:'FORBIDDEN'});
    const multi = !!ctx.env && ctx.env.MULTI_SERVER_ENABLED === 'true';
    const now = Date.now(), deadline = now + 750;
    const jobs = nk.sqlQuery(`SELECT p.user_id::TEXT AS user_id,p.key AS storage_key,p.value->'sweep'->>'session_id' AS session_id
      FROM storage p JOIN users u ON u.id=p.user_id
      LEFT JOIN sweep_worker_claims c ON c.user_id=p.user_id AND c.storage_key=p.key
      WHERE p.collection='player_profiles' AND p.value->'sweep'->>'status' IN ('running','cancelling')
        AND LEAST((p.value->'sweep'->>'next_due_at_ms')::BIGINT, (p.value->'sweep'->>'cancel_at_ms')::BIGINT) <= $1::BIGINT
        AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0)
        AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=p.user_id AND a.status='archived')
        AND (c.user_id IS NULL OR (c.lease_until<=NOW() AND c.retry_at<=NOW()))
        AND (($2::BOOLEAN AND EXISTS(SELECT 1 FROM game_servers g JOIN player_characters pc
              ON pc.server_id=g.server_id AND pc.generation=g.generation AND pc.account_id=p.user_id AND pc.status='ready'
              WHERE p.key=g.server_id||':g'||g.generation||':main' AND g.status='open' AND g.opens_at<=NOW()))
          OR (NOT $2::BOOLEAN AND p.key='main'))
      ORDER BY LEAST((p.value->'sweep'->>'next_due_at_ms')::BIGINT, (p.value->'sweep'->>'cancel_at_ms')::BIGINT),p.user_id,p.key LIMIT 32`, [now,multi]);
    let processed=0, failed=0, claimedCount=0;
    for (const job of jobs) {
        if (Date.now() >= deadline) break;
        const lease = nk.uuidv4();
        const claimed=nk.sqlQuery(`INSERT INTO sweep_worker_claims(user_id,storage_key,lease_id,lease_until)
          VALUES($1::UUID,$2,$3,NOW()+INTERVAL '15 seconds')
          ON CONFLICT(user_id,storage_key) DO UPDATE SET lease_id=EXCLUDED.lease_id,lease_until=EXCLUDED.lease_until
          WHERE sweep_worker_claims.lease_until<=NOW() AND sweep_worker_claims.retry_at<=NOW()
          RETURNING attempts`,[job.user_id,job.storage_key,lease]);
        if (!claimed.length) continue;
        claimedCount++;
        let runtime=nk, scope:GameServerContext|null=null;
        try {
            let session:any;
            if (multi) {
                const match=/^([a-z][a-z0-9_]{0,31}):g([1-9][0-9]*):main$/.exec(job.storage_key);
                if (!match) throw new Error('Invalid sweep character key');
                scope={accountId:job.user_id,serverId:match[1],generation:Number(match[2])};
                runtime=mailCombatRuntime(characterRuntime(nk,scope),job.user_id);
                session=withServerRequest(nk,scope,()=>sweepProcess(runtime,job.user_id,logger,Date.now(),4));
            } else session=sweepProcess(mailCombatRuntime(nk,job.user_id),job.user_id,logger,Date.now(),4);
            nk.sqlExec(`DELETE FROM sweep_worker_claims WHERE user_id=$1::UUID AND storage_key=$2 AND lease_id=$3`,[job.user_id,job.storage_key,lease]);
            processed++;
            // Notification is a hint; failure never rolls back a committed receipt.
            if (session) {
                try {nk.notificationSend(job.user_id,'Càn quét',{
                    type:'sweep_updated',session_id:session.session_id,state_version:session.state_version,
                    status:session.status,server_time_ms:Date.now(),storage_key:job.storage_key
                },144,null,false);} catch(error) {logger.warn('Sweep notification failed: %s',String(error));}
            }
        } catch(error) {
            failed++;
            const message=String(error);
            const permanent=/RESERVATION_CORRUPTED|HERO_NOT_OWNED|REWARD_ITEM_INVALID|SWEEP_CONFIG_INVALID/.test(message);
            const exhausted=Number(claimed[0].attempts)>=11 && !/CAS|version|conflict|SERVER_REQUEST_FENCED/i.test(message);
            if (permanent || exhausted) {
                const block=()=>{
                    const rows=runtime.storageRead([{collection:'player_profiles',key:'main',userId:job.user_id}]);
                    if (!rows.length) return;
                    const profile=parseJsonObject(rows[0].value),session=profile.sweep;
                    if (!session || session.session_id!==job.session_id || !sweepActive(profile)) return;
                    session.status='blocked';session.last_error=message.slice(0,240);session.state_version++;
                    runtime.storageWrite([{collection:'player_profiles',key:'main',userId:job.user_id,
                        value:profile,version:rows[0].version,permissionRead:1,permissionWrite:0}]);
                };
                try {if(scope)withServerRequest(nk,scope,block);else block();}
                catch(blockError) {logger.warn('Sweep error state retry: %s',String(blockError));}
            }
            nk.sqlExec(`UPDATE sweep_worker_claims SET lease_until=NOW(),
              retry_at=NOW()+make_interval(secs=>LEAST(60,5*(attempts+1))),attempts=LEAST(12,attempts+1)
              WHERE user_id=$1::UUID AND storage_key=$2 AND lease_id=$3`,[job.user_id,job.storage_key,lease]);
            logger.warn('Sweep retry user=%s key=%s: %s',job.user_id,job.storage_key,String(error));
        }
    }
    // Bounded housekeeping; claims are expendable and never determine entitlement.
    nk.sqlExec(`DELETE FROM sweep_worker_claims WHERE (user_id,storage_key) IN
      (SELECT c.user_id,c.storage_key FROM sweep_worker_claims c WHERE c.lease_until<NOW()-INTERVAL '1 day'
       AND NOT EXISTS(SELECT 1 FROM storage p WHERE p.user_id=c.user_id AND p.key=c.storage_key
         AND p.collection='player_profiles' AND p.value->'sweep'->>'status' IN ('running','cancelling')) LIMIT 32)`,[]);
    return JSON.stringify({success:true,scanned:jobs.length,claimed:claimedCount,processed,failed,
        elapsed_ms:Date.now()-now,server_time_ms:Date.now()});
};
