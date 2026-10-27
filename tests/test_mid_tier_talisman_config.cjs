const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'data',n+'.json'),'utf8'));
const skills=read('skills'),talismans=read('talismans'),items=read('items'),effects=read('effects');
const atlas=JSON.parse(fs.readFileSync(path.join(root,'../client/data/atlas_registry.json'),'utf8'));
const elements=['water','wood','water','fire','earth','metal','wood','water','fire','earth'];
let files=0,frames=0;
for(let id=16;id<=25;id++) {
 const skill=skills.find(x=>x.id===`skill_talisman_${id}`);
 const tal=talismans.find(x=>x.id===id),item=items.find(x=>x.id===`talisman_${id}`);
 assert.equal(skill.element,elements[id-16]); assert.equal(tal.element,skill.element);assert.equal(item.attributes.element,skill.element);
 assert.equal(skill.skill_type,'layered_talisman');assert.equal(tal.skill_id,skill.id);assert.equal(item.attributes.skill_id,skill.id);
 assert.equal(tal.skill,skill.description); assert.equal(item.attributes.skill_description,skill.description);
 assert.equal(item.attributes.skill_name,skill.display_name);
 const layers=skill.cast_config.layers;assert.equal(Object.keys(layers).length,id===16?4:3);
 const folder=path.join(root,`../client/assets/skill_vfx/skill_phap_bao/skill_talisman_${id}`);
 const actual=fs.readdirSync(folder).filter(x=>x.endsWith('.png')).sort();
 const used=[];
 for(const layer of Object.values(layers)) {
  assert.ok(layer.frames.length===9 || (id===16&&layer.frames.length===1));
  const key=layer.frames[0].replace(/_0$/,'');const sheet=atlas.spritesheet_vfx[key];assert.ok(sheet);
  const filename=path.basename(sheet.path);used.push(filename);files++;frames+=layer.frames.length;
  assert.ok(actual.includes(filename),`${id}: exact file incl trailing spaces`);
  const image=fs.readFileSync(path.join(folder,filename));
  const width=image.readUInt32BE(16),height=image.readUInt32BE(20);
  assert.equal(width,layer.frames.length===9?1200:256);assert.equal(height,width);
  assert.equal(sheet.frame_count,layer.frames.length);
  assert.ok(layer.pivot.length===2 && layer.scale.every(v=>Number.isFinite(v)&&v>0));
 }
 assert.deepEqual(used.sort(),actual,`all files mapped once for ${id}`);
 assert.equal(skill.levels.length,5);
 for(const level of skill.levels) {
  const cfg={...skill.cast_config,...level.cast_config};
  assert.equal(cfg.damage_pct,level.stats.damage_pct);
  assert.ok(level.description_rows.some(row=>row.includes('Hồi chiêu')));
  if(cfg.damage_pct>0)assert.ok(level.description_rows.some(row=>row.includes(`${cfg.damage_pct}%`)),'description matches damage at every level');
  if(id!==16)assert.equal(level.stats.cooldown,31-level.level);
  for(const binding of cfg.effect_bindings||[]) {
   assert.ok(effects.some(x=>x.id===binding.id));assert.ok(layers[binding.layer]);
   assert.ok(binding.chance>=0&&binding.chance<=1&&binding.duration>0);
  }
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'skill_components.json'),'utf8'));
 assert.equal(manifest.element,skill.element);assert.equal(manifest.components.length,id===16?4:3);
 for(const component of manifest.components)assert.ok(actual.includes(component.file));
 if(id===19)assert.equal(skill.cast_config.effect_bindings[0].damage_budget_ratio,1);
 if(id===21)assert.equal(skill.cast_config.effect_bindings[0].id,'poison');
 if(id===22)assert.equal(skill.display_name,'Thần Mộc Long Hộ');
}
assert.equal(files,31);assert.equal(frames,271);
console.log('PASS C230: 10 skills, 31 actual images, 271 frames, elements, descriptions, five levels and effect budgets');
