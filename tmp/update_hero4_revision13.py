from pathlib import Path
import json
import sys
root=Path(__file__).resolve().parents[1]

def docs(base):
    p=base/'docs/contracts/REGISTRY.json'
    s=p.read_text(encoding='utf-8')
    start=s.index('"id": "C196_HERO4_SKILL_REBALANCE"')
    end=s.index('}',start)
    part=s[start:end].replace('"1.2.0"','"1.3.0"').replace('"ACTIVE"','"IN_PROGRESS"').replace('2026-10-24','2026-10-27')
    s=s[:start]+part+s[end:];p.write_text(s,encoding='utf-8')
    p=base/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C196 v1.3.0: halve Skill1 poison, Skill2 art +30%, Skill4 combat unlock15 and ground vortex below hero.\n',encoding='utf-8')

if sys.argv[1]=='server':
    docs(root)
    p=root/'data/skills.json'; skills=json.loads(p.read_text(encoding='utf-8'))
    for skill in skills:
        if skill['id']=='hero_4_skill_1':
            for level in skill['levels']:
                for effect in level.get('effects',[]):
                    if effect['id']=='poison':effect['dps_pct']/=2
                level['description_rows']=[row.replace(f'Poison {old}% ATK/s',f'Poison {old/2:g}% ATK/s') for row in level['description_rows'] for old in [25+5*(level['level']-1)]]
        if skill['id']=='hero_4_skill_2':
            for level in skill['levels']:level['stats']['vfx_scale']=round(level['stats']['vfx_scale']*1.3,6)
        if skill['id']=='hero_4_skill_4':skill['createria_unlock']['level']=15
    p.write_text(json.dumps(skills,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
elif sys.argv[1]=='client_docs':
    c=root.parent/'client'
    (c/'docs/contracts/C196_HERO4_SKILL_REBALANCE.md').write_text((root/'docs/contracts/C196_HERO4_SKILL_REBALANCE.md').read_text(encoding='utf-8'),encoding='utf-8')
elif sys.argv[1]=='client_test':
    c=root.parent/'client'
    (c/'tests/test_hero4_revision13.gd').write_text((root/'tmp/test_hero4_revision13.gd').read_text(encoding='utf-8'),encoding='utf-8')
    (c/'tests/TestHero4Revision13.tscn').write_text('[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://tests/test_hero4_revision13.gd" id="1"]\n\n[node name="TestHero4Revision13" type="Node"]\nscript = ExtResource("1")\n',encoding='utf-8')
else:
    c=root.parent/'client'
    (c/'docs/contracts/C196_HERO4_SKILL_REBALANCE.md').write_text((root/'docs/contracts/C196_HERO4_SKILL_REBALANCE.md').read_text(encoding='utf-8'),encoding='utf-8')
    docs(c)
    p=c/'src/managers/SkillManager.gd';s=p.read_text(encoding='utf-8')
    old='vortex_duration, spin, 1.0, 65, true, animation_duration)'
    assert s.count(old)==1
    s=s.replace(old,'vortex_duration, spin, 1.0, 4, true, animation_duration)')
    p.write_text(s,encoding='utf-8')
