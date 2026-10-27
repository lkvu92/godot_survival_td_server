// Exercise CLI selection/resume without launching Godot or modifying files.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), workspace = path.dirname(root);
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8'));
const sourcePath = path.join(root, 'tools/godot_campaign_recommender.cjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const model = 'godot_runtime_neutral_mortal_checkpoints_v4';
const policy = 'guaranteed_ordered_skill_atk_cdr_accuracy_as_def_heal_v2';
const fingerprint = crypto.createHash('sha256').update(JSON.stringify({model, policy, seeds:[218,219,220,221,222], threshold:.8, stages:read('stages'), levels:read('stage_levels'), heroes:read('heroes')})).digest('hex');
function execute(args) {
 const memory = new Map(), printed = [];
 for (const arc of read('arcs').filter(a => a.order >= 1 && a.order <= 6)) {
  const hero = {fire:'hero_2',water:'hero_1',wood:'hero_4',metal:'hero_5',earth:'hero_3'}[arc.element];
  const rows = arc.stage_ids.flatMap(stage_id => ['normal','epic','legend'].map(level_id => ({stage_id,level_id,status:'PASS',recommended_power:1000,recommended_hero_level:60,reference_hero:{hero_id:hero}})));
  memory.set(path.join(workspace,'.tmp/c218-recommendations',String(arc.order).padStart(2,'0')+'_'+arc.id+'.json'), JSON.stringify({arc_id:arc.id,reference_hero_id:hero,fingerprint,status:'COMPLETE',rows}));
 }
 const fakeFs = {...fs, mkdirSync(){}, existsSync(file){return file === '/fake/Godot.exe' || memory.has(file);},
  readFileSync(file, encoding){return memory.has(file) ? memory.get(file) : fs.readFileSync(file, encoding);},
  writeFileSync(file, content){assert(!file.endsWith('stage_levels.json'), 'analysis must not write catalog');memory.set(file,content);},
  renameSync(from,to){memory.set(to,memory.get(from));memory.delete(from);}};
 const context = vm.createContext({__dirname:path.dirname(sourcePath), require(name){
  if(name==='node:fs')return fakeFs;
  if(name==='node:child_process')return {spawnSync(){throw Error('Unexpected benchmark launch');}};
  return require(name);
 }, process:{argv:['node',sourcePath,'--godot=/fake/Godot.exe',...args],env:{},pid:99999,stdout:{write(){}}}, console:{log(value){printed.push(JSON.parse(value));}}});
 vm.runInContext(source,context);
 return printed.at(-1);
}
const explicit = execute(['--arc=6']);
assert.equal(explicit.status,'PASS');assert.equal(explicit.rows,30);
assert.deepEqual(explicit.arcs.map(a=>a.arc_id),['arc_ngu_to_quy_khu']);
assert.equal(execute(['--arc=arc_ngu_to_quy_khu']).rows,30);
const defaults = execute([]);
assert.equal(defaults.rows,150);assert.equal(defaults.arcs.length,5);
assert(!defaults.arcs.some(a=>a.arc_id==='arc_ngu_to_quy_khu'));
assert.throws(()=>execute(['--arc=6','--write']),/requires complete Arc 1-5 without filters/);
assert.throws(()=>execute(['--arc=7']),/No matching Arc 1-6/);
console.log('PASS C218 Arc6: order/ID selection, 30 cached rows, default Arc1-5 boundary and filtered-write rejection; no Godot/data writes');
