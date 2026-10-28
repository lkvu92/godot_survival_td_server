/* C237 local-only selective seed/publish. --check and --verify are read-only.
 * Uses the compiled production seed bundle and processors. Never touches profiles,
 * credentials, other campaign rows or unrelated unpublished settings. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const ARC = 'arc_van_yeu_co_linh';
const PROJECT = 'survival_td_local';
const NK = PROJECT + '-nakama-1';
const PG = PROJECT + '-postgres-1';
const clone = value => JSON.parse(JSON.stringify(value));
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function ensure(condition, code) { if (!condition) { const error = new Error(code); error.safeCode = code; throw error; } }
function docker(args, input) {
  return execFileSync('docker', args, {input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024}).trim();
}
const environment = meta => Object.fromEntries(meta.Config.Env.map(row => { const i = row.indexOf('='); return [row.slice(0, i), row.slice(i + 1)]; }));
const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name + '.json'), 'utf8'));
const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex');
function compiledApi() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'nakama/data/build/index.js'), 'utf8'), context);
  return vm.runInContext('({seedGameData,seedBindSql,processEnemy,processArc,processStage,processStageLevel,parseRemoteSetting,publishConfigRelease})', context);
}
function selectedCatalog() {
  const arcs = read('arcs').filter(row => row.id === ARC);
  ensure(arcs.length === 1 && arcs[0].order === 7 && arcs[0].stage_ids.length === 10, 'ARC7_CATALOG_MISSING');
  const ids = arcs[0].stage_ids;
  const enemies = read('enemies').filter(row => row.id.startsWith('arc7_'));
  const stages = read('stages').filter(row => row.arc_id === ARC);
  const levels = read('stage_levels').filter(row => ids.includes(row.stage_id));
  ensure(enemies.length === 45 && stages.length === 10 && levels.length === 30, 'ARC7_CATALOG_COUNTS_INVALID');
  ensure(stages.every(row => ids.includes(row.id) && row.waves.length === 20), 'ARC7_WAVES_INVALID');
  ensure(stages.reduce((sum, row) => sum + row.waves.length, 0) === 200, 'ARC7_WAVE_COUNT_INVALID');
  ensure(read('progression').talisman_system.fragment_drop.eligible_stages.includes('stage_7_10'), 'ARC7_PROGRESSION_SOURCE_MISSING');
  return {arcs, enemies, stages, stage_levels: levels};
}
function runtimeAudit(meta) {
  const build = path.join(ROOT, 'nakama/data/build/index.js');
  const localHash = crypto.createHash('sha256').update(fs.readFileSync(build)).digest('hex');
  const mountedHash = docker(['exec', NK, 'sha256sum', '/nakama/data/build/index.js']).split(/\s+/)[0];
  const modified = fs.statSync(build).mtime.toISOString();
  const started = meta.State.StartedAt;
  return {started_at: started, build_modified_at: modified, mounted_build_matches: mountedHash === localHash,
    restart_needed: Date.parse(started) < Date.parse(modified), restarted_by_tool: false};
}
function expectedSeedFields(table) {
  return {
    arcs: ['id','display_name','description','level_min','level_max','enabled_if','element','stage_ids','boss_skill_ids','enemy_visual_scale_multiplier'],
    enemies: ['id','display_name','element','attack_type','visual_scale','boss_visual_scale','exp','is_boss','boss_scale','attributes','skills','attack_effects','generic_skills','boss_skills','reward','attack_skill','collision_radius','balance_reference_level'],
    stages: ['id','arc_id','level','display_name','description','is_boss','exp_weight','background','stage_rules','boss_skill_ids','boss_skill_entry_indexes'],
    stage_levels: ['id','stage_id','level_id','display_name','description','recommended_power','exp_multiplier','stamina_cost','enemy_modifiers','loot_table','boss_loot_table','unlock_condition','stage_rules','ui','gold_reward']
  }[table];
}
function catalogDifferences(api, nk, selected) {
  const differences = [];
  const processors = {arcs: api.processArc, enemies: api.processEnemy, stages: api.processStage, stage_levels: api.processStageLevel};
  for (const [table, rows] of Object.entries(selected)) {
    for (const source of rows) {
      const stored = nk.sqlQuery('SELECT * FROM game_' + table + ' WHERE id=$1', [source.id])[0];
      if (!stored) { differences.push(table + ':' + source.id + ':missing'); continue; }
      const actual = processors[table](clone(stored), nk);
      for (const key of expectedSeedFields(table)) {
        if (source[key] === undefined) continue;
        if (stable(actual[key]) !== stable(source[key])) differences.push(table + ':' + source.id + ':' + key);
      }
      if (source.order !== undefined && Number(stored.sort_order) !== source.order) differences.push(table + ':' + source.id + ':order');
      if (table === 'stages') {
        if (actual.waves.length !== 20) differences.push(table + ':' + source.id + ':wave_count');
        for (let i = 0; i < source.waves.length; i++) {
          const wave = actual.waves[i], expected = source.waves[i];
          if (!wave || stable(wave.entries) !== stable(expected.entries) || wave.wave_id !== expected.wave_id || wave.display_name !== expected.display_name)
            differences.push(table + ':' + source.id + ':wave_' + (i + 1));
        }
      }
    }
  }
  return differences;
}
function snapshotsMatch(api, release, settings) {
  const draft = {system: {}, game_play: {}};
  for (const row of settings.filter(row => row.is_active)) draft[row.module][row.key] = api.parseRemoteSetting(row.value_type, row.value);
  const keys = new Set([...Object.keys(draft.system), ...Object.keys(release.snapshot.system || {})].map(key => 'system.' + key)
    .concat([...Object.keys(draft.game_play), ...Object.keys(release.snapshot.game_play || {})].map(key => 'game_play.' + key)));
  return [...keys].filter(key => { const [module, ...parts] = key.split('.'); const setting = parts.join('.'); return stable(draft[module][setting]) !== stable(release.snapshot[module]?.[setting]); });
}
function scopedRows(nk, selected) {
  const ids = Object.fromEntries(Object.entries(selected).map(([table, rows]) => [table, new Set(rows.map(row => row.id))]));
  return {
    arcs: nk.sqlQuery('SELECT * FROM game_arcs ORDER BY id', []).filter(row => ids.arcs.has(row.id)),
    enemies: nk.sqlQuery('SELECT * FROM game_enemies ORDER BY id', []).filter(row => ids.enemies.has(row.id)),
    stages: nk.sqlQuery('SELECT * FROM game_stages ORDER BY id', []).filter(row => ids.stages.has(row.id)),
    waves: nk.sqlQuery('SELECT * FROM game_stage_waves ORDER BY stage_id,wave_index', []).filter(row => ids.stages.has(row.stage_id)),
    stage_levels: nk.sqlQuery('SELECT * FROM game_stage_levels ORDER BY id', []).filter(row => ids.stage_levels.has(row.id)),
    progression: nk.sqlQuery("SELECT * FROM game_config WHERE key='progression'", [])
  };
}
function untouchedHashes(nk, selected) {
  const result = {};
  for (const [table, rows] of Object.entries(selected)) {
    const ids = new Set(rows.map(row => row.id));
    result[table] = digest(nk.sqlQuery('SELECT * FROM game_' + table + ' ORDER BY id', []).filter(row => !ids.has(row.id)).map(row=>{ if(table==='enemies')for(const key of ['collision_radius','balance_reference_level'])if(row[key]===null)delete row[key];return row;}));
  }
  const stageIds = new Set(selected.stages.map(row => row.id));
  result.waves = digest(nk.sqlQuery('SELECT * FROM game_stage_waves ORDER BY stage_id,wave_index', []).filter(row => !stageIds.has(row.stage_id)));
  result.game_config = digest(nk.sqlQuery("SELECT * FROM game_config WHERE key<>'progression' ORDER BY key", []));
  result.other_content_configs = digest(nk.sqlQuery("SELECT * FROM game_content_configs WHERE id<>'enemy_skills' ORDER BY id", []));
  result.remote_settings = digest(nk.sqlQuery('SELECT * FROM remote_config_settings ORDER BY module,key', []));
  return result;
}
function progressionWithoutArc7(value) {
  const out = clone(value);
  out.talisman_system.fragment_drop.eligible_stages = out.talisman_system.fragment_drop.eligible_stages.filter(id => id !== 'stage_7_10');
  return out;
}
async function main() {
  const args = process.argv.slice(2);
  ensure(args.length === 1 && ['--check','--apply','--verify'].includes(args[0]), 'USE_CHECK_APPLY_OR_VERIFY');
  const mode = args[0], selected = selectedCatalog(), api = compiledApi();
  const meta = JSON.parse(docker(['inspect', NK]))[0];
  const pg = JSON.parse(docker(['inspect', PG]))[0];
  for (const value of [meta, pg]) ensure(value.Config.Labels['com.docker.compose.project'] === PROJECT && value.State.Running, 'LOCAL_COMPOSE_IDENTITY_INVALID');
  const bindings = meta.NetworkSettings.Ports['7350/tcp'];
  ensure(bindings?.length === 1 && bindings[0].HostIp === '127.0.0.1' && bindings[0].HostPort === '7350', 'LOOPBACK_7350_REQUIRED');
  const mount = meta.Mounts.find(row => row.Destination === '/nakama/data');
  ensure(mount && mount.Type === 'bind', 'LOCAL_BUILD_MOUNT_REQUIRED');
  const pe = environment(pg);
  ensure(pe.POSTGRES_USER && pe.POSTGRES_DB, 'LOCAL_DATABASE_IDENTITY_MISSING');
  const sql = query => docker(['exec','-i',PG,'psql','-X','-U',pe.POSTGRES_USER,'-d',pe.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'], query);
  const nk = {
    sqlQuery(query, params) {
      const bound = api.seedBindSql(query, params).replace(/;\s*$/, '');
      return JSON.parse(sql("SELECT COALESCE(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM (" + bound + ') q;'));
    },
    sqlExec(query, params) { return sql(api.seedBindSql(query, params)); }
  };
  const releases = nk.sqlQuery('SELECT * FROM remote_config_releases ORDER BY config_version DESC LIMIT 1', []);
  ensure(releases.length === 1 && releases[0].snapshot, 'ACTIVE_LOCAL_RELEASE_MISSING');
  const release = releases[0];
  const settings = nk.sqlQuery('SELECT * FROM remote_config_settings ORDER BY module,key', []);
  const pending = snapshotsMatch(api, release, settings);
  const audit = runtimeAudit(meta);
  const progressionRow = nk.sqlQuery("SELECT * FROM game_config WHERE key='progression'", [])[0];
  ensure(progressionRow?.value?.talisman_system?.fragment_drop?.eligible_stages instanceof Array, 'LOCAL_PROGRESSION_INVALID');
  const progression = clone(progressionRow.value);
  if (!progression.talisman_system.fragment_drop.eligible_stages.includes('stage_7_10')) progression.talisman_system.fragment_drop.eligible_stages.push('stage_7_10');
  const differences = catalogDifferences(api, nk, selected);
  const enemySkillRow = nk.sqlQuery("SELECT * FROM game_content_configs WHERE id='enemy_skills'", [])[0];
  ensure(enemySkillRow && Array.isArray(enemySkillRow.payload), 'ENEMY_SKILL_CONFIG_MISSING');
  const bloodline = require('./arc7_catalog.cjs').BLOODLINE_DEFINITION;
  const enemySkills = enemySkillRow.payload.filter(row=>row.id!==bloodline.id).concat([bloodline]);
  if (stable(enemySkills)!==stable(enemySkillRow.payload)) differences.push('enemy_skills:beast_bloodline');
  if (stable(progression) !== stable(progressionRow.value)) differences.push('progression:eligible_stages');
  const summary = {mode: mode.slice(2), project: PROJECT, endpoint: 'http://127.0.0.1:7350', selected: {arcs: 1, enemies: 45, stages: 10, waves: 200, stage_levels: 30},
    config_version: release.config_version, needs_sync: differences.length > 0, difference_count: differences.length,
    unpublished_setting_keys: pending, runtime: audit, player_writes: false};
  if (pending.length && mode === '--check') {
    console.log(JSON.stringify({...summary, status: 'BLOCKED_UNRELATED_DRAFT'}));
    process.exitCode = 1;
    return;
  }
  ensure(pending.length === 0, 'UNRELATED_UNPUBLISHED_SETTINGS');
  ensure(audit.mounted_build_matches, 'MOUNTED_BUILD_MISMATCH');
  if (mode === '--verify' || !differences.length) {
    ensure(differences.length === 0, 'ARC7_READBACK_MISMATCH');
    console.log(JSON.stringify({...summary, status: 'PASS', published: false}));
    return;
  }
  // Plan using the actual compiled seed mapping; capture mutations until every
  // request and the identical-settings publication have passed validation.
  const statements = [], logger = {info(){},warn(){},error(){}};
  const planner = Object.create(nk);
  planner.sqlExec = (query, params) => statements.push(api.seedBindSql(query, params));
  const requests = Object.entries(selected).map(([table, rows]) => ({table, rows}));
  requests.push({table:'content_configs',rows:[{id:'enemy_skills',payload:enemySkills,active:true}]});
  requests.push({table:'config',config_key:'progression',config_value:progression});
  const ctx = {userId:'local:C237',env:{CONFIG_ADMIN_USER_ID:'local:C237'}};
  const seed = JSON.parse(api.seedGameData(ctx,logger,planner,JSON.stringify({table:'bundle',requests})));
  ensure(seed.success === true && seed.atomic === true && statements.length === 1, 'COMPILED_SEED_PLAN_REJECTED');
  const publication = JSON.parse(api.publishConfigRelease(ctx,logger,planner,JSON.stringify({store_url:release.store_url})));
  ensure(publication.status === 'ok' && publication.config_version === release.config_version + 1 && statements.length === 2, 'COMPILED_PUBLICATION_PLAN_REJECTED');
  ensure(statements.every(statement => !/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:storage|player_|users|wallet|monetization_)/i.test(statement)), 'PLAYER_MUTATION_FORBIDDEN');
  if (mode === '--check') {
    console.log(JSON.stringify({...summary,status:'PASS',compiled_seed_plan_valid:true,compiled_publication_plan_valid:true,writes_executed:0}));
    return;
  }
  const beforeHashes = untouchedHashes(nk, selected);
  const backup = {contract:'C237',project:PROJECT,created_at:new Date().toISOString(),release,settings,
    before:scopedRows(nk,selected),before_enemy_skills:enemySkillRow,intended_catalog:selected,intended_progression:progression,untouched_hashes:beforeHashes,runtime:audit};
  const dir = path.join(ROOT, 'nakama/backups');
  fs.mkdirSync(dir, {recursive:true});
  const backupFile = path.join(dir, 'C237-arc7-' + Date.now() + '.json');
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2) + '\n', {flag:'wx',mode:0o600});
  const expectedSettings = api.seedBindSql('SELECT $1::jsonb', [JSON.stringify(settings)]).slice(7);
  const expectedEnemySkills = api.seedBindSql('SELECT $1::jsonb', [JSON.stringify(enemySkillRow)]).slice(7);
  const expectedProgression = api.seedBindSql('SELECT $1::jsonb', [JSON.stringify(progressionRow.value)]).slice(7);
  const guard = `DO $arc7_guard$ BEGIN
    IF (SELECT MAX(config_version) FROM remote_config_releases) <> ${release.config_version} THEN RAISE EXCEPTION 'C237_RELEASE_CHANGED'; END IF;
    IF (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY module,key),'[]'::jsonb) FROM remote_config_settings s) IS DISTINCT FROM ${expectedSettings} THEN RAISE EXCEPTION 'C237_SETTINGS_CHANGED'; END IF;
    IF (SELECT to_jsonb(s) FROM game_content_configs s WHERE id='enemy_skills') IS DISTINCT FROM ${expectedEnemySkills} THEN RAISE EXCEPTION 'C237_ENEMY_SKILLS_CHANGED'; END IF;
    IF (SELECT value FROM game_config WHERE key='progression') IS DISTINCT FROM ${expectedProgression} THEN RAISE EXCEPTION 'C237_PROGRESSION_CHANGED'; END IF;
  END $arc7_guard$;`;
  // A single psql connection owns BEGIN/COMMIT, unlike pooled Nakama sqlExec.
  sql('BEGIN; SELECT pg_advisory_xact_lock(143,2); LOCK TABLE remote_config_settings,remote_config_releases,game_config,game_arcs,game_enemies,game_stages,game_stage_waves,game_stage_levels,game_content_configs IN SHARE ROW EXCLUSIVE MODE;\n'
    + guard + '\nALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS collision_radius REAL; ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS balance_reference_level INT;\n' + statements.join(';\n') + ';\nCOMMIT;');
  ensure(catalogDifferences(api,nk,selected).length === 0, 'ARC7_POST_SEED_READBACK_MISMATCH');
  ensure(stable(nk.sqlQuery("SELECT payload FROM game_content_configs WHERE id='enemy_skills'",[])[0].payload)===stable(enemySkills),'BLOODLINE_READBACK_MISMATCH');
  const actualProgression = nk.sqlQuery("SELECT value FROM game_config WHERE key='progression'", [])[0].value;
  ensure(stable(actualProgression) === stable(progression), 'PROGRESSION_PATCH_MISMATCH');
  ensure(stable(progressionWithoutArc7(actualProgression)) === stable(progressionWithoutArc7(progressionRow.value)), 'UNRELATED_PROGRESSION_CHANGED');
  ensure(stable(untouchedHashes(nk,selected)) === stable(beforeHashes), 'UNRELATED_CONFIG_CHANGED');
  const current = nk.sqlQuery('SELECT * FROM remote_config_releases ORDER BY config_version DESC LIMIT 1', [])[0];
  ensure(current.config_version === publication.config_version && stable(current.snapshot) === stable(release.snapshot), 'PUBLICATION_SNAPSHOT_MISMATCH');
  console.log(JSON.stringify({...summary,status:'PASS',needs_sync:false,published:true,config_version:current.config_version,
    backup:path.relative(ROOT,backupFile).replaceAll('\\','/'),unrelated_config_preserved:true}));
}
main().catch(error => {
  console.error('FAIL C237 local sync: ' + (error.safeCode || 'LOCAL_TRANSPORT_OR_VALIDATION_FAILURE') + '; credentials and SQL were not logged.');
  process.exitCode = 1;
});
