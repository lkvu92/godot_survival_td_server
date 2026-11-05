// C269: Reduction of creep growth stats and boss baseline stats by 20%.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { database, runtime, literal } = require('./enemy_catalog_db.cjs');

const nk = database(), ctx = runtime(), draft = ctx.ecRead(nk);
if (draft.metadata.c269_growth_reduction) throw Error('C269 already applied; refusing to multiply twice');
if (draft.metadata.runtime_version !== `draft:${draft.revision}`) throw Error('Live draft revision is not current catalog; refuse to overwrite');

const previous = ctx.ecProject(draft);
if (previous.errors.length) throw Error(previous.errors.join('\n'));

const next = JSON.parse(JSON.stringify(draft));
const changes = [];
const elements = ['metal', 'water', 'wood', 'fire', 'earth'];

const scaleStat = (obj, key, factor) => {
  if (!Object.hasOwn(obj, key)) return;
  assert.equal(typeof obj[key], 'number');
  assert(Number.isFinite(obj[key]) && obj[key] >= 0);
  obj[key] = Number((obj[key] * factor).toFixed(6));
};

const scaleGrowth = obj => {
  scaleStat(obj, 'hp', 0.8);
  scaleStat(obj, 'atk', 0.8);
  scaleStat(obj, 'def', 0.8);
};

const bosses = next.catalog.filter(row => row.data.kind === 'boss' || row.data.balance_profile === 'element_boss');
const creeps = next.catalog.filter(row => row.data.kind === 'creep' && row.data.balance_profile !== 'element_boss');

assert(bosses.length > 0, 'No boss species found');
assert(creeps.length > 0, 'No creep species found');

// 1. Scale creeps growth_per_level
for (const row of creeps) {
  assert(row.data.growth_per_level, `${row.id}: missing growth_per_level`);
  scaleGrowth(row.data.growth_per_level);
  changes.push({table:'enemy_catalog', id:row.id, data:row.data, active:row.active, expected_revision:row.revision, operation:'save'});
}

// 2. Scale bosses growth and element_baselines
for (const row of bosses) {
  if (row.data.growth_per_level) scaleGrowth(row.data.growth_per_level);
  if (row.data.balance_profile === 'element_boss' && row.data.element_baselines) {
    for (const elem of elements) {
      if (row.data.element_baselines[elem]) {
        scaleGrowth(row.data.element_baselines[elem]);
      }
    }
  }
  changes.push({table:'enemy_catalog', id:row.id, data:row.data, active:row.active, expected_revision:row.revision, operation:'save'});
}

// 3. Scale shared boss element baselines
const shared = next.metadata.framework?.boss_element_baselines;
if (shared) {
  for (const elem of elements) {
    if (shared[elem]) scaleGrowth(shared[elem]);
  }
}

const projection = ctx.ecProject(next);
if (projection.errors.length) throw Error(projection.errors.join('\n'));

const report = {
  revision: draft.revision,
  creeps_scaled: creeps.length,
  boss_species: bosses.length,
  validation_errors: projection.errors.length,
  dry_run: !process.argv.includes('--apply')
};

if (report.dry_run) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const expected = process.argv.find(arg => arg.startsWith('--expected-revision='))?.split('=')[1];
assert.equal(expected, String(draft.revision), 'Explicit current revision required');

const out = path.join(__dirname, '../temp/enemy-catalog');
fs.mkdirSync(out, {recursive: true});
const backup = path.join(out, `before-c269-${Date.now()}.json`);
fs.writeFileSync(backup, JSON.stringify({draft, projection: previous.snapshot}, null, 2));

next.metadata.c269_growth_reduction = {
  creep_growth_factor: 0.8,
  boss_stat_factor: 0.8,
  applied_from_revision: draft.revision,
  timestamp: new Date().toISOString()
};

const sql = `BEGIN;
SELECT enemy_catalog_live_mutate('batch', ${literal(JSON.stringify(changes))}::JSONB, ${literal(JSON.stringify(projection.snapshot))}::JSONB, ${literal(expected)}::BIGINT, 'operator:c269-growth-reduction');
UPDATE enemy_catalog_state SET metadata = ${literal(JSON.stringify(next.metadata))}::JSONB || jsonb_build_object('runtime_version','draft:' || revision::TEXT) WHERE id=1;
COMMIT;`;

nk.run(sql);

const after = ctx.ecRead(nk);
const afterProjection = ctx.ecProject(after);
assert(after.metadata.c269_growth_reduction, 'Missing idempotency marker');
assert.equal(ctx.ecCanonical(afterProjection.snapshot), ctx.ecCanonical(projection.snapshot), 'Draft projection differs from validated result');

const live = nk.sqlQuery("SELECT value->'enemy_framework' AS framework FROM game_config WHERE key='progression'")[0].framework;
for (const elem of elements) {
  assert.equal(
    live.boss_element_baselines[elem].hp,
    next.metadata.framework.boss_element_baselines[elem].hp,
    `Mismatch in live boss baseline HP for ${elem}`
  );
}

console.log(JSON.stringify({
  ...report,
  revision_after: after.revision,
  runtime_version: after.metadata.runtime_version,
  backup,
  dry_run: false,
  readback: 'PASS'
}, null, 2));

