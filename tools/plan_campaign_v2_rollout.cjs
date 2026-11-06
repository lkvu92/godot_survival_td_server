// C239 1.7.1: target-derived, offline plan. This tool never connects to production.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {runtime,literal}=require('./enemy_catalog_db.cjs');
function plan(p,sources){
 const ctx=runtime(),copy=x=>structuredClone(x);
 assert.equal(p.state.revision,0,'Initial import only');assert.equal(p.state.active_release,null);
 for(const k of ['catalog','skill','visual_set','visual_asset','stage_entry'])assert.equal((p[k]||[]).length,0,'Target catalog must be empty');
 const canonical=Array.from({length:7},(_,i)=>require('../data/c239_arc'+(i+1)+'_migration.json')).flatMap(m=>m.stages);
 assert.equal(canonical.length,70);assert.equal(new Set(canonical.map(s=>s.id)).size,70);
 const stages=copy(p.stages),waves=copy(p.waves),changes=[];
 for(const s of canonical){
  const t=stages.find(t=>t.id===s.id);assert(t&&t.arc_id===s.arc_id,'Stage identity '+s.id);
  const old=p.stages.find(t=>t.id===s.id);assert.notEqual(old.stage_rules?.enemy_framework_version,2);
  const arc=p.arcs.find(a=>a.id===s.arc_id);assert.equal(arc.sort_order,s.stage_rules.campaign_arc_order);
  const ws=waves.filter(w=>w.stage_id===s.id);assert.equal(ws.length,s.waves.length);
  for(const [i,w] of ws.entries()){
   assert.equal(w.wave_index,i);const desired=s.waves[i];assert.equal(w.entries.length,desired.entries.length);
   for(const [j,e] of desired.entries.entries()){
    const before=w.entries[j],enemy=p.enemies.find(e=>e.id===before.enemy_id);
    assert.equal(before.count,e.count);assert.equal(before.interval,e.interval);assert.equal(before.start_delay||0,e.start_delay);
    assert.equal(before.modifiers?.exp??before.exp??enemy?.reward?.exp??enemy?.exp,e.exp,'EXP preservation');
    const visual=e.presentation_id||p.progression.enemy_framework.species[e.species_id]?.visual_definition_id;
    const allowed=[visual];if(s.stage_rules.campaign_arc_order===7){const stem=visual.replace(/_(metal|water|wood|fire|earth)$/,'');for(const element of ['metal','water','wood','fire','earth'])allowed.push(stem+'_'+element);}
    assert(allowed.includes(before.enemy_id),'Species mapping '+s.id+'/'+before.enemy_id);
   }
   w.entries=copy(desired.entries);
  }
  t.stage_rules={...copy(s.stage_rules)};
  if(old.stage_rules?.required_user_level!==undefined)t.stage_rules.required_user_level=old.stage_rules.required_user_level;
  t.boss_skill_ids=[];t.boss_skill_entry_indexes=[];
  changes.push({id:t.id,arc_id:t.arc_id,stage_rules:t.stage_rules,boss_skill_ids:[],boss_skill_entry_indexes:[]});
 }
 const nk={sqlQuery(q){if(q.includes('game_config'))return [{value:copy(p.progression)}];if(q.includes('game_enemies'))return copy(p.enemies);if(q.includes('game_stage_waves'))return copy(waves);if(q.includes('game_stages'))return copy(stages);throw Error(q);}};
 const draft=ctx.ecMigration(nk,sources),projected=ctx.ecProject(draft);
 assert.deepEqual(Array.from(projected.errors),[]);
 // Target gameplay species and skill definitions are retained exactly, except per-boss baseline normalization.
 for(const [id,before] of Object.entries(p.progression.enemy_framework.species)){
  const after=projected.snapshot.framework.species[id];
  for(const key of Object.keys(before))assert.deepEqual(JSON.parse(JSON.stringify(after[key])),before[key],id+'/'+key);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(projected.snapshot.framework.skill_atlas)),p.progression.enemy_framework.skill_atlas);
 const bundle={metadata:draft.metadata};for(const [kind,table] of Object.entries({catalog:'enemy_catalog',visual_set:'enemy_visual_sets',visual_asset:'enemy_visual_assets',skill:'enemy_skill_catalog',stage_entry:'enemy_stage_entries'}))bundle[table]=draft[kind];
 const j=x=>literal(JSON.stringify(x))+'::jsonb';
 const actor='operator:production-c239-70-stage-rollout';
 let sql="BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'; LOCK TABLE game_stages,game_stage_waves,game_config,game_enemies,enemy_catalog_state,enemy_catalog,enemy_skill_catalog,enemy_visual_sets,enemy_visual_assets,enemy_stage_entries,remote_config_releases IN SHARE ROW EXCLUSIVE MODE;\n";
 sql+=`DO $$ BEGIN IF (SELECT to_jsonb(s) FROM enemy_catalog_state s WHERE id=1) IS DISTINCT FROM ${j(p.state)} OR (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM game_stages t) IS DISTINCT FROM ${j(p.stages)} OR (SELECT jsonb_agg(to_jsonb(t) ORDER BY stage_id,wave_index) FROM game_stage_waves t) IS DISTINCT FROM ${j(p.waves)} OR (SELECT value FROM game_config WHERE key='progression') IS DISTINCT FROM ${j(p.progression)} OR (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM game_enemies t) IS DISTINCT FROM ${j(p.enemies)} OR (SELECT to_jsonb(t) FROM remote_config_releases t ORDER BY config_version DESC LIMIT 1) IS DISTINCT FROM ${j(p.release)} THEN RAISE EXCEPTION 'ROLLOUT_TARGET_CHANGED'; END IF; END $$;\n`;
 sql+=`SELECT enemy_catalog_import(${j(bundle)},0,${literal(actor)});\n`;
 for(const c of changes)sql+=`UPDATE game_stages SET stage_rules=${j(c.stage_rules)},boss_skill_ids='[]'::jsonb,boss_skill_entry_indexes='[]'::jsonb,updated_at=NOW() WHERE id=${literal(c.id)};\n`;
 sql+=`SELECT enemy_catalog_publish(${j(projected.snapshot)},1,${literal(actor)},'C239: migrate 70 campaign stages to v2; preserve production catalog and progression');\n`;
 sql+="DO $$ BEGIN IF (SELECT count(*) FROM game_stages WHERE stage_rules->>'enemy_framework_version'='2')<>70 OR (SELECT count(*) FROM enemy_stage_entries)=0 THEN RAISE EXCEPTION 'ROLLOUT_POSTCHECK'; END IF; END $$;\nCOMMIT;\n";
 const legacy={framework:p.progression.enemy_framework,enemies:p.enemies.map(e=>{const v=copy(e);delete v.catalog_projection;return v;}),campaign_stages:[],waves:p.waves.filter(w=>changes.some(s=>s.id===w.stage_id)).map(w=>({stage_id:w.stage_id,wave_index:w.wave_index,entries:w.entries}))};
 let rollback="BEGIN; SET LOCAL lock_timeout='10s'; LOCK TABLE enemy_catalog_state,game_stages,game_stage_waves IN SHARE ROW EXCLUSIVE MODE;\n";
 rollback+=`DO $$ BEGIN IF (SELECT revision FROM enemy_catalog_state WHERE id=1)<>2 OR (SELECT metadata FROM enemy_catalog_state WHERE id=1) IS DISTINCT FROM ${j(draft.metadata)} OR (SELECT count(*) FROM game_stages WHERE stage_rules->>'enemy_framework_version'='2')<>70 THEN RAISE EXCEPTION 'ROLLBACK_TARGET_CHANGED'; END IF; END $$;\n`;
 rollback+=`SELECT enemy_catalog_publish(${j(legacy)},2,${literal(actor)},'Rollback C239 70-stage rollout to pre-migration production content');\n`;
 for(const c of changes){const before=p.stages.find(s=>s.id===c.id);rollback+=`UPDATE game_stages SET stage_rules=${j(before.stage_rules)},boss_skill_ids=${j(before.boss_skill_ids)},boss_skill_entry_indexes=${j(before.boss_skill_entry_indexes)},updated_at=NOW() WHERE id=${literal(c.id)};\n`;}
 rollback+=`DELETE FROM enemy_stage_entries; DELETE FROM enemy_visual_assets; DELETE FROM enemy_catalog; DELETE FROM enemy_visual_sets; DELETE FROM enemy_skill_catalog; UPDATE enemy_catalog_state SET metadata=${j(p.state.metadata)} WHERE id=1; INSERT INTO enemy_catalog_audit(actor,operation,entity,entity_id,before_data,after_data,draft_revision) VALUES(${literal(actor)},'rollback_initial_import','catalog','all',${j(bundle)},'{}'::jsonb,3); COMMIT;\n`;
 return {draft,projected,changes,bundle,sql,rollback,report:{stages:70,waves:projected.snapshot.waves.length,groups:draft.stage_entry.length,legacy_stage_ids:draft.metadata.legacy_stage_ids,counts:projected.counts,source_config_version:p.release.config_version,expected_revision:0}};
}
module.exports={plan};
if(require.main===module){const p=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),sources=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),out=process.argv[4];fs.mkdirSync(out,{recursive:true});const result=plan(p,sources);for(const [name,value]of Object.entries(result))fs.writeFileSync(path.join(out,name+(['sql','rollback'].includes(name)?'.sql':'.json')),['sql','rollback'].includes(name)?value:JSON.stringify(value));console.log(JSON.stringify(result.report));}
