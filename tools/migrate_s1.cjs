// C143 offline S1 migration. No startup execution, no deletion of legacy data.
// Uses psql (PGPASSWORD/service file supported); never prints connection secrets.
const collections=['player_profiles','player_inventory','player_heroes','player_stage_runs','player_identity','player_event_progress','player_daily_checkin','weekly_leaderboard_claims','player_purchase_grants','player_item_requests'];
const owned="collection=ANY('{"+collections.join(',')+"}'::TEXT[]) AND key !~ '^[a-z][a-z0-9_]{0,31}:g[1-9][0-9]*:'";
const boards="'{best_wave,most_kills,total_wins,cultivation_realm,campaign_stage,combat_power_v2}'::TEXT[]";
const sources={
  database:'SELECT current_database() AS database_name,(SELECT system_identifier::TEXT FROM pg_control_system()) AS cluster_id',
  storage:`SELECT user_id,collection,key,value,version,read,write,create_time FROM storage WHERE ${owned}`,
  users:'SELECT id,create_time FROM users',
  registry:'SELECT server_id,generation,revision,status,config_version FROM game_servers',vip:'SELECT * FROM player_vip_credits',voids:'SELECT * FROM store_purchase_voids',
  purchases:'SELECT * FROM monetization_purchases',orders:'SELECT * FROM monetization_purchase_orders',
  ads:'SELECT * FROM monetization_ad_rewards',quotas:'SELECT * FROM monetization_daily_reward_claims',fragments:'SELECT * FROM monetization_daily_fragment_rewards',
  periods:'SELECT * FROM weekly_leaderboard_periods',scores:'SELECT * FROM weekly_leaderboard_scores',awards:'SELECT * FROM weekly_leaderboard_awards',
  boards:`SELECT * FROM leaderboard WHERE id=ANY(${boards})`,board_records:`SELECT * FROM leaderboard_record WHERE leaderboard_id=ANY(${boards})`,
};
const manifest=`jsonb_build_object(${Object.entries(sources).map(([id,query])=>`'${id}',(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::TEXT),'[]'::JSONB) FROM (${query}) x)`).join(',')})`;
const hash=`encode(sha256(convert_to((${manifest})::TEXT,'UTF8')),'hex')`;
function migrationSql(mode,expectedHash,stopped=false){
  if(!['plan','apply','verify'].includes(mode))throw Error('Use --mode plan|apply|verify');
  if(mode==='plan')return `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
    SELECT jsonb_build_object('migration','legacy_to_s001_g1','manifest_hash',${hash},
      'storage_count',(SELECT COUNT(*) FROM storage WHERE ${owned}),
      'profile_count',(SELECT COUNT(*) FROM storage WHERE ${owned} AND collection='player_profiles' AND key='main'),
      'database',current_database(),'cluster_id',(SELECT system_identifier::TEXT FROM pg_control_system()),
      'account_count',(SELECT COUNT(*) FROM users WHERE id<>'00000000-0000-0000-0000-000000000000'),
      'requires_runtime_stopped',TRUE,'legacy_preserved',TRUE);COMMIT;`;
  if(mode==='verify')return `SELECT jsonb_build_object('checkpoint',to_jsonb(c),'missing_or_changed',
    (SELECT COUNT(*) FROM storage old LEFT JOIN storage dst ON dst.user_id=old.user_id AND dst.collection=old.collection AND dst.key='s001:g1:'||old.key
      WHERE old.${owned.replace(/\bkey\b/g,'old.key')} AND (dst.key IS NULL OR dst.value IS DISTINCT FROM old.value OR dst.version<>old.version)),
    'source_unchanged',c.source_hash_after=${hash},
    'missing_characters',(SELECT COUNT(*) FROM storage p JOIN users u ON u.id=p.user_id
      WHERE p.collection='player_profiles' AND p.key='main' AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=u.id AND a.status='archived')
      AND NOT EXISTS(SELECT 1 FROM player_characters x WHERE x.account_id=u.id AND x.server_id='s001' AND x.generation=1 AND x.status='ready')))
    FROM server_migration_checkpoints c WHERE id='legacy_to_s001_g1';`;
  if(!stopped)throw Error('Apply requires --runtime-stopped after stopping ALL Nakama nodes, schedulers and verifier writers');
  if(!/^[a-f0-9]{64}$/.test(expectedHash||''))throw Error('Apply requires the exact --plan-hash from a fresh dry-run');
  return `BEGIN;SET LOCAL lock_timeout='10s';SET LOCAL statement_timeout='120s';
    SELECT pg_advisory_xact_lock(143,1);
    LOCK TABLE users,storage,game_servers,player_characters,monetization_purchases,monetization_purchase_orders,monetization_ad_rewards,
      monetization_daily_reward_claims,monetization_daily_fragment_rewards,weekly_leaderboard_periods,weekly_leaderboard_scores,weekly_leaderboard_awards,
      leaderboard,leaderboard_record,player_vip_credits,store_purchase_voids,account_link_state,server_lifecycle_jobs IN EXCLUSIVE MODE;
    CREATE TABLE IF NOT EXISTS server_migration_checkpoints(id TEXT PRIMARY KEY,plan_hash TEXT NOT NULL,source_hash_after TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),report JSONB NOT NULL);
    DO $migration$
    DECLARE current_hash TEXT;copied BIGINT; checkpoint server_migration_checkpoints%ROWTYPE;
    BEGIN
      SELECT * INTO checkpoint FROM server_migration_checkpoints WHERE id='legacy_to_s001_g1';
      IF FOUND THEN
        IF checkpoint.plan_hash<>'${expectedHash}' THEN RAISE EXCEPTION 'MIGRATION_REQUEST_CONFLICT'; END IF;
        RETURN;
      END IF;
      IF EXISTS(SELECT 1 FROM game_servers WHERE status NOT IN('disabled','deleted') OR active_requests<>0)
        OR EXISTS(SELECT 1 FROM account_link_state WHERE active_requests<>0) THEN RAISE EXCEPTION 'STOP_AND_DRAIN_ALL_WRITERS'; END IF;
      IF NOT EXISTS(SELECT 1 FROM game_servers s JOIN remote_config_releases r ON r.config_version=s.config_version
        WHERE s.server_id='s001' AND s.generation=1 AND s.status='disabled') THEN RAISE EXCEPTION 'CREATE_DISABLED_S1_WITH_VALID_CONFIG_FIRST'; END IF;
      IF EXISTS(SELECT 1 FROM player_characters WHERE server_id='s001') OR EXISTS(SELECT 1 FROM storage WHERE key LIKE 's001:g1:%')
        THEN RAISE EXCEPTION 'S1_DESTINATION_NOT_EMPTY'; END IF;
      IF EXISTS(SELECT 1 FROM storage WHERE collection LIKE 'player\\_%' ESCAPE '\\'
        AND collection<>ALL('{${collections.join(',')},player_settings,player_compliance_profiles,player_entitlements}'::TEXT[]))
        THEN RAISE EXCEPTION 'UNKNOWN_PLAYER_COLLECTION_REQUIRES_OWNERSHIP_REVIEW'; END IF;
      IF EXISTS(SELECT 1 FROM leaderboard WHERE id LIKE 's001:g1:%') OR EXISTS(SELECT 1 FROM server_weekly_periods WHERE server_id='s001')
        OR EXISTS(SELECT 1 FROM server_lifecycle_jobs WHERE status<>'succeeded') THEN RAISE EXCEPTION 'DESTINATION_OR_LIFECYCLE_CONFLICT'; END IF;
      IF EXISTS(SELECT 1 FROM monetization_purchase_orders WHERE status='pending') OR EXISTS(SELECT 1 FROM monetization_ad_rewards WHERE status IN('prepared','verified'))
        THEN RAISE EXCEPTION 'PENDING_FINANCIAL_DELIVERY'; END IF;
      IF EXISTS(SELECT 1 FROM storage WHERE collection='player_stage_runs' AND value->>'status'='active') THEN RAISE EXCEPTION 'ACTIVE_RUN_REQUIRES_ABANDON'; END IF;
      IF EXISTS(SELECT 1 FROM storage WHERE collection='player_profiles' AND value->'sweep'->>'status' IN('running','cancelling','blocked')) THEN RAISE EXCEPTION 'ACTIVE_SWEEP_REQUIRES_CANCEL'; END IF;
      current_hash:=${hash};IF current_hash<>'${expectedHash}' THEN RAISE EXCEPTION 'PLAN_STALE';END IF;
      INSERT INTO storage(collection,key,user_id,value,version,read,write,create_time,update_time)
        SELECT collection,'s001:g1:'||key,user_id,value,version,0,0,create_time,NOW() FROM storage WHERE ${owned};
      GET DIAGNOSTICS copied=ROW_COUNT;
      INSERT INTO player_characters(account_id,server_id,generation,status,created_at)
        SELECT u.id,'s001',1,'ready',u.create_time FROM users u JOIN storage p ON p.user_id=u.id AND p.collection='player_profiles' AND p.key='main'
        WHERE NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=u.id AND a.status='archived');
      INSERT INTO player_server_preferences(account_id,last_server_id) SELECT id,'s001' FROM users u
        WHERE id<>'00000000-0000-0000-0000-000000000000' AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=u.id AND a.status='archived')
        ON CONFLICT(account_id) DO UPDATE SET last_server_id=EXCLUDED.last_server_id;
      INSERT INTO server_weekly_periods SELECT 's001',1,p.* FROM weekly_leaderboard_periods p;
      INSERT INTO server_weekly_scores SELECT 's001',1,p.* FROM weekly_leaderboard_scores p;
      INSERT INTO server_weekly_awards SELECT 's001',1,p.* FROM weekly_leaderboard_awards p;
      -- Runtime is stopped, so Nakama caches/indexes are rebuilt on the next boot.
      -- Composite population preserves every native schema column, including expiry.
      INSERT INTO leaderboard SELECT (jsonb_populate_record(NULL::leaderboard,to_jsonb(b)||jsonb_build_object('id','s001:g1:'||b.id,'authoritative',TRUE))).*
        FROM leaderboard b WHERE b.id=ANY(${boards});
      INSERT INTO leaderboard_record SELECT (jsonb_populate_record(NULL::leaderboard_record,to_jsonb(r)||jsonb_build_object('leaderboard_id','s001:g1:'||r.leaderboard_id))).*
        FROM leaderboard_record r WHERE r.leaderboard_id=ANY(${boards});
      ${['monetization_purchase_orders','monetization_purchases','monetization_ad_rewards','monetization_daily_reward_claims','monetization_daily_fragment_rewards'].map(table=>`UPDATE ${table} SET target_server_id='s001',target_generation=1 WHERE target_server_id='' AND target_generation=0;`).join('\n')}
      IF EXISTS(SELECT 1 FROM storage old LEFT JOIN storage dst ON dst.collection=old.collection AND dst.key='s001:g1:'||old.key AND dst.user_id=old.user_id
        WHERE old.collection=ANY('{${collections.join(',')}}'::TEXT[]) AND old.key !~ '^[a-z][a-z0-9_]{0,31}:g[1-9][0-9]*:'
        AND (dst.key IS NULL OR dst.value IS DISTINCT FROM old.value OR dst.version<>old.version)) THEN RAISE EXCEPTION 'MIGRATION_RECONCILIATION_FAILED'; END IF;
      INSERT INTO server_migration_checkpoints(id,plan_hash,source_hash_after,report)
        VALUES('legacy_to_s001_g1','${expectedHash}',${hash},jsonb_build_object('copied_storage',copied,'legacy_preserved',TRUE,'server_enabled',FALSE));
    END $migration$;
    SELECT to_jsonb(c) FROM server_migration_checkpoints c WHERE id='legacy_to_s001_g1';COMMIT;`;
}
module.exports={migrationSql};
if(require.main===module){
  require('./s1_migration_cli.cjs').main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
