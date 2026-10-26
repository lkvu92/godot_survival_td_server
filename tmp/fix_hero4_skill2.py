from pathlib import Path
import json
server = Path(__file__).resolve().parents[1]
client = server.parent / 'client'
def edit(relative, old, new):
    p = client / relative
    s = p.read_text(encoding='utf-8')
    assert s.count(old) == 1, (relative, old[:60], s.count(old))
    p.write_text(s.replace(old, new), encoding='utf-8')

# Contract is copied before implementation; preserve the existing client edits.
for relative in ['docs/contracts/C196_HERO4_SKILL_REBALANCE.md']:
    (client / relative).write_text((server / relative).read_text(encoding='utf-8'), encoding='utf-8')
p = client / 'docs/contracts/REGISTRY.json'
s=p.read_text(encoding='utf-8')
import re
s=re.sub(r'("id": "C196_HERO4_SKILL_REBALANCE",\s*"version": )"[^"]+"',r'\1"1.2.0"',s)
p.write_text(s,encoding='utf-8')
p=client / 'docs/INDEX.md'
p.write_text(p.read_text(encoding='utf-8')+'\n- C196 v1.2.0: Hero4 Skill2 swept piercing and100%–30% spatial damage falloff.\n',encoding='utf-8')

edit('src/combat/Projectile.gd', 'var distance_damage_falloff_per_20_pct := 0.0',
     'var distance_damage_falloff_per_20_pct := 0.0\nvar damage_min_range_multiplier := 1.0\nvar damage_launch_origin := Vector2.ZERO')
edit('src/combat/Projectile.gd', '\t_apply_options(options)\n\t_present_visual',
     '\t_apply_options(options)\n\tdamage_launch_origin = global_position\n\t_present_visual')
edit('src/combat/Projectile.gd', '\tskill_id = str(options.get("skill_id", ""))',
     '\tskill_id = str(options.get("skill_id", ""))\n\tdamage_min_range_multiplier = clampf(float(options.get("damage_min_range_multiplier", 1.0)), 0.0, 1.0)')
edit('src/combat/Projectile.gd', '\t\tvar step: Vector2 = line_direction * speed * delta',
     '\t\tvar step: Vector2 = line_direction * minf(speed * delta, maxf(max_distance - distance_travelled, 0.0))')
edit('src/combat/Projectile.gd', '\t\t_hit_line_targets_segment(previous_position, global_position)\n\t\tif distance_travelled >= max_distance:',
     '\t\t_hit_line_targets_segment(previous_position, global_position)\n\t\tif released:\n\t\t\treturn\n\t\tif distance_travelled >= max_distance:')
edit('src/combat/Projectile.gd', '\tif dist <= maxf(hit_distance, step_dist):\n\t\t_release()',
     '\tif dist <= maxf(hit_distance, step_dist):\n\t\tglobal_position = return_target\n\t\t_hit_line_targets_segment(previous_position, global_position)\n\t\t_release()')
edit('src/combat/Projectile.gd', '\t\tif not continue_to_max_distance_on_hit and hit_targets.size() > pierce:',
     '\t\tif travel_mode != "boomerang" and not continue_to_max_distance_on_hit and hit_targets.size() > pierce:')
edit('src/combat/Projectile.gd', '\t\tvar resolved_direct_damage := _distance_scaled_damage(direct_damage)',
     '\t\t# Spatial falloff is independent of frame step and hit order, on both legs.\n\t\tif damage_min_range_multiplier < 1.0 and max_distance > 0.0:\n\t\t\tvar ratio := clampf(damage_launch_origin.distance_to(impact_position) / max_distance, 0.0, 1.0)\n\t\t\tdirect_damage *= lerpf(1.0, damage_min_range_multiplier, ratio)\n\t\tvar resolved_direct_damage := _distance_scaled_damage(direct_damage)')
edit('src/combat/Projectile.gd', '\tdistance_travelled = 0.0\n\tcontinue_to_max_distance_on_hit = false',
     '\tdistance_travelled = 0.0\n\tdamage_min_range_multiplier = 1.0\n\tdamage_launch_origin = Vector2.ZERO\n\tcontinue_to_max_distance_on_hit = false')
edit('src/managers/SkillManager.gd', '\tif str(skill.get("id", "")) == "hero_3_skill_1":\n\t\toptions["vfx_hold_last_frame"] = true',
     '\tif str(skill.get("id", "")) == "hero_4_skill_2":\n\t\toptions["damage_min_range_multiplier"] = float(SkillValueServiceScript.get_fixed(level_data, "damage_min_range_multiplier", 1.0))\n\tif str(skill.get("id", "")) == "hero_3_skill_1":\n\t\toptions["vfx_hold_last_frame"] = true')

p=server / 'data/skills.json'
data=json.loads(p.read_text(encoding='utf-8'))
skill=next(s for s in data if s['id']=='hero_4_skill_2')
skill['description']='Piercing boomerang glaives hit each enemy once per outward/return leg. Damage decreases linearly from100% near launch to30% at maximum range.'
for level in skill['levels']:
    level['stats']['damage_min_range_multiplier']=0.3
    level['description_rows'].append('Distance damage100% to30% at max range')
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Updated Hero4 Skill2 data, client combat and contracts')
