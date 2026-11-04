// Explicit Chu Tuoc legacy projection retirement; canonical species and stage loadouts are untouched.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {database,runtime,literal}=require('./enemy_catalog_db.cjs');
const nk=database(),ctx=runtime(),draft=ctx.ecRead(nk),root='arc7_chu_tuoc_nu_vuong';
const ids=['metal','water','wood','fire','earth'].map(element=>root+'_'+element);
assert(draft.catalog.some(r=>r.id==='a7_arc7_chu_tuoc_nu_vuong'&&r.active&&r.data.visual_set_id===root),'Canonical species is required');
assert(draft.visual_set.some(r=>r.id===root&&r.active),'Neutral visual is required');
for(const id of ids){
 assert(!draft.catalog.some(r=>r.data.visual_set_id===id||(r.data.presentation_variants||[]).includes(id)),'Referenced species visual: '+id);
 assert(!draft.stage_entry.some(r=>r.data.enemy_id===id||r.data.presentation_id===id),'Referenced entry: '+id);
 assert(!draft.visual_set.some(r=>r.id===id)&&!draft.visual_asset.some(r=>r.data.visual_set_id===id),'Normalize authoring visuals first: '+id);
 const refs=nk.sqlQuery('SELECT stage_id,wave_index FROM game_stage_waves WHERE entries @> $1::JSONB OR entries @> $2::JSONB OR entries @> $3::JSONB',[JSON.stringify([{enemy_id:id}]),JSON.stringify([{species_id:id}]),JSON.stringify([{presentation_id:id}])]);
 assert.equal(refs.length,0,'Referenced runtime alias: '+id);
}
const next=JSON.parse(JSON.stringify(draft));
const retired=ids.filter(id=>next.metadata.legacy_enemies[id]||next.metadata.framework.enemy_skill_bindings[id]);
for(const id of ids){delete next.metadata.legacy_enemies[id];delete next.metadata.framework.enemy_skill_bindings[id];}
const before=ctx.ecProject(draft),after=ctx.ecProject(next);assert.deepEqual(Array.from(after.errors),[]);
before.snapshot.enemies=before.snapshot.enemies.filter(row=>!ids.includes(row.id));
for(const id of ids)delete before.snapshot.framework.enemy_skill_bindings[id];
assert.equal(ctx.ecCanonical(before.snapshot),ctx.ecCanonical(after.snapshot),'Only obsolete projection/binding removal is allowed');
const apply=process.argv.includes('--apply'),expected=process.argv.find(arg=>arg.startsWith('--expected-revision='))?.split('=')[1];
const report={dry_run:!apply,retired,draft_revision:draft.revision,canonical_species:'a7_arc7_chu_tuoc_nu_vuong',references:0};
if(apply&&retired.length){
 assert.equal(expected,draft.revision,'Explicit current --expected-revision is required');assert(/^[0-9]{1,18}$/.test(expected));
 const out=path.join(__dirname,'../temp/enemy-catalog');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'before-retire-chu-tuoc-'+Date.now()+'.json'),JSON.stringify(draft,null,2));
 const keys=ids.map(literal).join(','),runtimeGuards=ids.map(id=>['enemy_id','species_id','presentation_id'].map(key=>`entries @> ${literal(JSON.stringify([{[key]:id}]))}::JSONB`).join(' OR ')).join(' OR ');
 // Lock/CAS and recheck references in the same transaction as metadata and audit writes.
 nk.sqlExec(`BEGIN;
 SELECT id FROM enemy_catalog_state WHERE id=1 FOR UPDATE;
 DO $retire$ BEGIN
 IF (SELECT revision FROM enemy_catalog_state WHERE id=1)<>${expected} THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM enemy_stage_entries WHERE data->>'enemy_id' IN (${keys}) OR data->>'presentation_id' IN (${keys})) OR EXISTS(SELECT 1 FROM game_stage_waves WHERE ${runtimeGuards}) THEN RAISE EXCEPTION 'EC_REFERENCED'; END IF;
 END $retire$;
 WITH previous AS (SELECT metadata FROM enemy_catalog_state WHERE id=1),changed AS (
 UPDATE enemy_catalog_state SET metadata=$1::JSONB,revision=revision+1 WHERE id=1 RETURNING revision)
 INSERT INTO enemy_catalog_audit(actor,operation,entity,entity_id,before_data,after_data,draft_revision)
 SELECT 'operator:explicit-chu-tuoc-retirement','retire_legacy_visuals','metadata','chu_tuoc',previous.metadata,$1::JSONB,changed.revision FROM previous CROSS JOIN changed;
 COMMIT;`,[JSON.stringify(next.metadata)]);
 report.draft_revision=ctx.ecRead(nk).revision;
}
console.log(JSON.stringify(report));
