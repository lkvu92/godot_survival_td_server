// C261: one-time, local-only, revision-checked migration of live catalog and metadata.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { database, runtime, literal } = require('./enemy_catalog_db.cjs');

const nk = database(), ctx = runtime(), draft = ctx.ecRead(nk);
if (draft.metadata.c261_boss_speed_reduction) throw Error('C261 already applied; refusing to multiply twice');
if (draft.metadata.runtime_version !== `draft:${draft.revision}`) throw Error('Live draft revision is not the current catalog; refuse to overwrite other work');
const previous = ctx.ecProject(draft);
if (previous.errors.length) throw Error(previous.errors.join('\n'));
const next = JSON.parse(JSON.stringify(draft));
const changes = [], elements = ['metal', 'water', 'wood', 'fire', 'earth'];
const scale = (object, key, factor) => {
  if (!Object.hasOwn(object, key)) return;
  assert.equal(typeof object[key], 'number');
  assert(Number.isFinite(object[key]) && object[key] >= 0);
  object[key] = Number((object[key] * factor).toFixed(9));
};
const speeds = object => { scale(object, 'attack_speed', 0.7); scale(object, 'move_speed', 0.6); };
const bosses = next.catalog.filter(row => row.data.kind === 'boss' || row.data.balance_profile === 'element_boss');
assert(bosses.length > 0, 'No boss species found');
for (const row of bosses) {
  speeds(row.data.base_attributes);
  speeds(row.data.growth_per_level);
  if (row.data.balance_profile === 'element_boss') {
    for (const element of elements) {
      assert(row.data.element_baselines && row.data.element_baselines[element], `${row.id}: missing ${element} baseline`);
      speeds(row.data.element_baselines[element]);
    }
  }
  changes.push({table:'enemy_catalog', id:row.id, data:row.data, active:row.active, expected_revision:row.revision, operation:'save'});
}
let legacyCount = 0;
for (const enemy of Object.values(next.metadata.legacy_enemies || {})) {
  if (enemy.is_boss) { assert(enemy.attributes, 'Boss lacks legacy attributes'); speeds(enemy.attributes); legacyCount++; }
}
const shared = next.metadata.framework.boss_element_baselines;
if (shared) for (const element of elements) { assert(shared[element], `Shared baseline missing ${element}`); speeds(shared[element]); }
const invalidOverrides = next.stage_entry.filter(row => row.active && row.data.boss && !bosses.some(boss => boss.id === row.data.enemy_id));
assert.equal(invalidOverrides.length, 0, 'Boss override of non-boss species needs separate handling');
const projection = ctx.ecProject(next);
if (projection.errors.length) throw Error(projection.errors.join('\n'));
// Restore only the intended fields in a copy, then require exact identity with the original.
const restored = JSON.parse(JSON.stringify(next));
for (const row of restored.catalog) {
  const original = draft.catalog.find(item => item.id === row.id);
  if (bosses.some(boss => boss.id === row.id)) row.data = original.data;
}
restored.metadata.legacy_enemies = draft.metadata.legacy_enemies;
restored.metadata.framework.boss_element_baselines = draft.metadata.framework.boss_element_baselines;
assert.equal(ctx.ecCanonical(restored), ctx.ecCanonical(draft), 'Unexpected change outside boss speed fields');
const report = {revision:draft.revision, boss_species:bosses.length, boss_element_rows:bosses.filter(x => x.data.balance_profile === 'element_boss').length * elements.length, legacy_bosses:legacyCount, shared_elements:shared ? elements.length : 0, validation_errors:projection.errors.length, dry_run:!process.argv.includes('--apply')};
if (report.dry_run) { console.log(JSON.stringify(report)); process.exit(0); }
const expected = process.argv.find(arg => arg.startsWith('--expected-revision='))?.split('=')[1];
assert.equal(expected, draft.revision, 'Explicit current revision required');
const out = path.join(__dirname, '../temp/enemy-catalog'); fs.mkdirSync(out, {recursive:true});
const backup = path.join(out, `before-c261-${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify({draft, projection:previous.snapshot}));
next.metadata.c261_boss_speed_reduction = {attack_factor:0.7, movement_factor:0.6, applied_from_revision:draft.revision};
const sql = `BEGIN;
SELECT enemy_catalog_live_mutate('batch', ${literal(JSON.stringify(changes))}::JSONB, ${literal(JSON.stringify(projection.snapshot))}::JSONB, ${literal(expected)}::BIGINT, 'operator:c261-boss-speed');
UPDATE enemy_catalog_state SET metadata = ${literal(JSON.stringify(next.metadata))}::JSONB || jsonb_build_object('runtime_version','draft:' || revision::TEXT) WHERE id=1;
COMMIT;`;
nk.run(sql);
const after = ctx.ecRead(nk), afterProjection = ctx.ecProject(after);
assert(after.metadata.c261_boss_speed_reduction, 'Missing idempotency marker');
assert.equal(ctx.ecCanonical(afterProjection.snapshot), ctx.ecCanonical(projection.snapshot), 'Draft projection differs from validated result');
const live = nk.sqlQuery("SELECT value->'enemy_framework' AS framework FROM game_config WHERE key='progression'")[0].framework;
for (const boss of bosses) for (const element of elements) if (boss.data.balance_profile === 'element_boss') {
  assert.deepEqual(JSON.parse(JSON.stringify(live.species[boss.id].element_baselines[element])), boss.data.element_baselines[element]);
}
console.log(JSON.stringify({...report, revision_after:after.revision, runtime_version:after.metadata.runtime_version, backup, dry_run:false, readback:'PASS'}));
