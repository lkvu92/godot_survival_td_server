// Read-only migration planner. Source edits are emitted as an apply_patch diff.
const fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const curves = {
  hero_1_skill_1:{damage_pct:[75,95,120,150,185]},
  hero_1_skill_2:{damage_pct:[50,65,85,110,140],second_damage_pct:[0,0,0,0,0]},
  hero_1_skill_3:{damage_pct:[10,15,20,25,30]},
  hero_2_skill_1:{damage_pct:[70,90,115,145,180]},
  hero_2_skill_2:{damage_pct:[30,40,51.25,63.75,80]},
  hero_2_skill_3:{burn_total_damage_pct:[5,10,15,20,25]},
  hero_2_skill_4:{damage_pct:[100,135,175,210,250]},
  hero_3_skill_1:{damage_pct:[85,110,140,175,215]},
  hero_3_skill_2:{damage_pct:[110,145,185,235,300],second_damage_pct:[60,75,95,120,150]},
  hero_3_skill_3:{damage_pct:[30,38,48,60,75],final_damage_pct:[95,125,160,205,260]},
  hero_4_skill_1:{damage_pct:[35,46,58,72,90]},
  hero_4_skill_2:{damage_pct:[60,78,100,125,155]},
  hero_4_skill_3:{damage_pct:[77,102,130,165,210]},
  hero_4_skill_4:{damage_pct:[90,120,155,200,250],needle_damage_pct:[60,80,105,138,180]},
  hero_5_skill_1:{damage_pct:[65,82,98,114,130]},
  hero_5_skill_2:{damage_pct:[42,56,70,84,98]},
  hero_5_skill_3:{damage_pct:[100,125,155,190,235]},
  hero_5_skill_4:{damage_pct:[30,40,50,60,70]}
};
const poison = {hero_4_skill_1:[36,50,68,92,124],hero_4_skill_3:[30,42,58,80,110]};
const presentationTuning = {
  hero_1_skill_4:['cooldown','domain_duration','domain_radius','domain_cast_range','domain_slow_edge','domain_slow_center','impact_stun_chance','impact_stun_duration'],
  hero_2_skill_2:['speed_pct','knockback_distance','knockback_duration','vfx_alpha'],
  hero_2_skill_4:['charge_time','telegraph_radius','telegraph_max_hp_pct','telegraph_tick_interval','telegraph_tick_count','telegraph_vfx_scale']
};
const value = (base,old) => Math.round((base * 1.3 + (old-base) * 0.3) * 10000) / 10000;
const number = n => String(n);
function descriptions(skill,level) {
  const s=level.stats, id=skill.id;
  let rows=(level.description_rows||[]).map(row=>{
    let text=row.replace(/((?:Damage|Sát thương(?: AOE)?|Hit) )\d+(?:\.\d+)?(% ATK)/g,(_,prefix,suffix)=>prefix+number(s.damage_pct)+suffix);
    if(id==='hero_3_skill_2')text=text.replace(/(Wave )\d+(?:\.\d+)?(% ATK)/,(_,p,q)=>p+number(s.second_damage_pct)+q);
    if(id==='hero_3_skill_3') {
      if(/^\d+x /.test(text))text=s.sequence_count+'x '+number(s.damage_pct)+'% ATK';
      text=text.replace(/(Stronger final )\d+(?:\.\d+)?(% ATK)/,(_,p,q)=>p+number(s.final_damage_pct)+q);
    }
    if(id==='hero_1_skill_3'&&text.startsWith('Tăng '))text='Tăng '+number(s.damage_pct)+'% DMG, +'+number(s.speed_pct)+'% SPD';
    if(id==='hero_2_skill_3')text=text.replace(/(Thiêu đốt tổng )\d+(?:\.\d+)?(% ATK)/,(_,p,q)=>p+number(s.burn_total_damage_pct)+q);
    if(id==='hero_2_skill_4'&&(text.startsWith('Tiễn chính ')||text.startsWith('Tổng 3 tiễn:')))text='Tiễn chính '+number(s.damage_pct)+'%, mỗi tiễn phụ '+number(s.damage_pct*0.5)+'% ATK';
    if(poison[id]) {
      const effect=(level.effects||[]).find(e=>e.id==='poison');
      text=text.replace(/(Poison )\d+(?:\.\d+)?(% ATK\/s)/,(_,p,q)=>p+number(effect.dps_pct)+q);
    }
    if(id==='hero_4_skill_4')text=text.replace(/(Needles \d+x )\d+(?:\.\d+)?(% ATK)/,(_,p,q)=>p+number(s.needle_damage_pct)+q);
    return text;
  });
  if(id==='hero_5_skill_4')rows.splice(1,0,'Mỗi quyền gây '+number(s.damage_pct)+'% ATK trước hệ số đánh trùng mục tiêu');
  return rows;
}
function maskedHash(catalog) {
  const masked=JSON.parse(JSON.stringify(catalog));
  for(const skill of masked)if(curves[skill.id])for(const level of skill.levels){
    for(const key of Object.keys(curves[skill.id]))delete level.stats[key];
    delete level.description_rows;
    if(poison[skill.id])for(const effect of level.effects||[])if(effect.id==='poison')delete effect.dps_pct;
  }
	for(const skill of masked)if(presentationTuning[skill.id]){
		if(skill.id==='hero_1_skill_4') {
			delete skill.vfx_frames;
			for(const level of skill.levels) {
				delete level.stats.domain_coverage;
				delete level.description_rows;
			}
		}
		if(skill.id==='hero_2_skill_4')delete skill.telegraph_vfx_frames;
		for(const level of skill.levels)for(const key of presentationTuning[skill.id])delete level.stats[key];
	}
	for(const skill of masked)if(skill.id==='hero_1_skill_2'&&skill.flank_bolt_config)delete skill.flank_bolt_config.speed;
  return crypto.createHash('sha256').update(JSON.stringify(masked)).digest('hex');
}
function patch(source) {
  const catalog=JSON.parse(source), chunks=[];
  for(const skill of catalog)if(curves[skill.id]) {
    const original=JSON.parse(JSON.stringify(skill));
    assert.equal(skill.levels.length,5);
    for(let i=0;i<5;i++){
      const level=skill.levels[i];
      for(const [key,old] of Object.entries(curves[skill.id])) {
        assert.equal(level.stats[key],old[i],skill.id+': stale original '+key);
        level.stats[key]=value(old[0],old[i]);
      }
      if(poison[skill.id]) {
        const effect=(level.effects||[]).find(e=>e.id==='poison');
        assert(effect);assert.equal(effect.dps_pct,poison[skill.id][i]);
        effect.dps_pct=value(poison[skill.id][0],poison[skill.id][i]);
      }
      level.description_rows=descriptions(skill,level);
    }
    const block=v=>JSON.stringify(v,null,2).split('\n').map(line=>'  '+line).join('\n');
    const suffix=source.replace(/\r/g,'').includes(block(original)+',')?',':'';
    const oldBlock=block(original)+suffix,newBlock=block(skill)+suffix;
    assert(source.replace(/\r/g,'').includes(oldBlock),'Original formatting mismatch '+skill.id);
    chunks.push('@@\n'+oldBlock.split('\n').map(line=>'-'+line).join('\n')+'\n'+newBlock.split('\n').map(line=>'+'+line).join('\n'));
  }
  return '*** Begin Patch\n*** Update File: server/data/skills.json\n'+chunks.join('\n')+'\n*** End Patch';
}
module.exports={curves,poison,presentationTuning,value,maskedHash,descriptions};
if(require.main===module){
  const source=fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8');
  if(process.argv.includes('--patch'))process.stdout.write(JSON.stringify(patch(source)));
  else if(process.argv.includes('--hash'))process.stdout.write(maskedHash(JSON.parse(source)));
  else throw Error('Use --patch (prints JSON-encoded apply_patch diff) or --hash');
}
