// Explicit retirement manifest for the original C239 pilot fixture, not an unused-species policy.
const fs=require('node:fs'),path=require('node:path');
const {database,runtime}=require('./enemy_catalog_db.cjs');
const retired={stone_ape:'a7_arc7_pha_son_cu_vien',blood_lion:'a7_arc7_huyet_man_cuong_su',armored_rhino:'a7_arc7_co_giap_long_te',venom_croc:'a7_arc7_doc_tich_man_ngac',thunder_bear:'a7_arc7_loi_trao_hung_bi',shadow_leopard:'a7_arc7_huyen_lan_long_bao',bone_beast:'a7_arc7_man_cot_toan_nghe',tiger_king:'a7_arc7_bach_ho_yeu_vuong'};
const nk=database(),ctx=runtime(),draft=ctx.ecRead(nk),changes=[];
for(const [id,target] of Object.entries(retired)){
 const row=draft.catalog.find(r=>r.id===id);if(!row)continue;
 const canonical=draft.catalog.find(r=>r.id===target&&r.active);
 if(!canonical||row.data.visual_set_id!==canonical.data.visual_set_id)throw Error('Canonical identity must be verified: '+id);
 const refs=draft.stage_entry.filter(r=>r.data.enemy_id===id);
 const runtimeRefs=nk.sqlQuery("SELECT stage_id,wave_index FROM game_stage_waves WHERE entries @> $1::JSONB OR entries @> $2::JSONB",[JSON.stringify([{species_id:id}]),JSON.stringify([{enemy_id:id}])]);
 if(refs.length||runtimeRefs.length)throw Error('Referenced pilot must be resolved explicitly first: '+id);
 changes.push({table:'enemy_catalog',id,operation:'delete',expected_revision:row.revision});
}
const next=JSON.parse(JSON.stringify(draft));next.catalog=next.catalog.filter(r=>!changes.some(change=>change.id===r.id));
const previous=ctx.ecProject(draft),projection=ctx.ecProject(next);
if(projection.errors.length)throw Error(projection.errors.join('\n'));
// The only runtime difference permitted is removal of those obsolete, unreferenced species.
for(const change of changes)delete previous.snapshot.framework.species[change.id];
if(ctx.ecCanonical(previous.snapshot)!==ctx.ecCanonical(projection.snapshot))throw Error('Unexpected runtime change outside retired pilot definitions');
const apply=process.argv.includes('--apply'),expected=process.argv.find(a=>a.startsWith('--expected-revision='))?.split('=')[1];
const report={dry_run:!apply,retired:changes.map(r=>r.id),draft_revision:draft.revision,references:0,remaining_species:next.catalog.length};
if(apply&&changes.length){
 if(expected!==draft.revision)throw Error('Explicit current --expected-revision is required');
 const out=path.join(__dirname,'../temp/enemy-catalog');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'before-remove-pilot-'+Date.now()+'.json'),JSON.stringify(draft,null,2));
 const result=nk.sqlQuery('SELECT enemy_catalog_batch($1::JSONB,$2::BIGINT,$3) AS result',[JSON.stringify(changes),expected,'operator:explicit-pilot-retirement'])[0].result;
 Object.assign(report,result);
}
console.log(JSON.stringify(report));
