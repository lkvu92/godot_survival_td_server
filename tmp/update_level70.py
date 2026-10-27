from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]

def replace(path, old, new):
    text = path.read_text(encoding='utf-8')
    assert old in text, (path, old)
    path.write_text(text.replace(old, new), encoding='utf-8')

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

def server():
    replace(root/'data/progression.json', '"max_user_level": 50', '"max_user_level": 70')
    replace(root/'data/progression.json', '"max_hero_level": 50', '"max_hero_level": 70')
    replace(root/'nakama/data/modules/progression_rpc.ts', 'const PROGRESSION_MAX_LEVEL = 50;', 'const PROGRESSION_MAX_LEVEL = 70;')
    p=root/'data/tribulation_config.json'; c=json.loads(p.read_text(encoding='utf-8'))
    for level,hp,atk in [(59,222222,1354),(69,493827,2112)]:
        c['boss_profiles'].append(dict(c['boss_profiles'][-1],user_level=level,base_hp=hp,base_atk=atk))
    save(p,c)
    p=root/'data/realm_milestones.json'; r=json.loads(p.read_text(encoding='utf-8'))
    r['milestones']['50']['body']='Chúc mừng đạo hữu đột phá thành công! Tiên lộ tiếp tục rộng mở tới Độ Kiếp và Bán Tiên. Hãy tiếp tục tích lũy căn cơ, chuẩn bị cho những tầng thiên kiếp tiếp theo.'
    for level,title in [('60','Độ Kiếp kỳ'),('70','Bán Tiên')]:
        r['milestones'][level]={'title':f'Chúc mừng đột phá — Lv.{level} — {title}', 'body':f'Chúc mừng đạo hữu vượt thiên kiếp, đạt cấp {level} {title}! Hãy giữ vững đạo tâm và tiếp tục tôi luyện căn cơ.'}
    save(p,r)
    p=root/'nakama/data/modules/feature_unlocks.ts'; s=p.read_text(encoding='utf-8')
    start=s.index('const REALM_MILESTONE_DEFAULTS:'); end=s.index('\n',s.index('}};',start))
    s=s[:start]+'const REALM_MILESTONE_DEFAULTS:any='+json.dumps(r,ensure_ascii=False,indent=2)+';'+s[end:]
    s=s.replace('f.required_user_level>50','f.required_user_level>70').replace("['10','20','30','40','50']","['10','20','30','40','50','60','70']")
    p.write_text(s,encoding='utf-8')

def client():
    c=root.parent/'client'
    # Contract first, before any GDScript changes.
    (c/'docs/contracts/C225_LEVEL_70.md').write_text((root/'docs/contracts/C225_LEVEL_70.md').read_text(encoding='utf-8'),encoding='utf-8')
    if 'const MAX_USER_LEVEL := 70' in (c/'src/core/UserContext.gd').read_text(encoding='utf-8'):
        return
    p=c/'docs/contracts/REGISTRY.json'; s=p.read_text(encoding='utf-8'); s=s.replace('"contracts": [','"contracts": [\n    {"id":"C225_LEVEL_70","version":"1.0.0","status":"IN_PROGRESS","updated_at":"2026-10-27","contract_file":"docs/contracts/C225_LEVEL_70.md"},',1); p.write_text(s,encoding='utf-8')
    p=c/'docs/INDEX.md'; p.write_text(p.read_text(encoding='utf-8')+'\n- [C225 Level 70](contracts/C225_LEVEL_70.md): persistent levels and seven realm avatar/rank frames.\n',encoding='utf-8')
    replace(c/'src/core/UserContext.gd','const MAX_HERO_LEVEL := 50','const MAX_HERO_LEVEL := 70')
    replace(c/'src/core/UserContext.gd','const MAX_USER_LEVEL := 50','const MAX_USER_LEVEL := 70')
    replace(c/'src/actors/Player.gd','clampi(int(hero_state.get("level", 1)), 1, MAX_HERO_LEVEL)','clampi(int(hero_state.get("level", 1)), 1, UserContext.MAX_HERO_LEVEL)')
    replace(c/'src/services/FeatureUnlockService.gd','int(required) > 50','int(required) > 70')
    replace(c/'src/services/FeatureUnlockService.gd','["10", "20", "30", "40", "50"]','["10", "20", "30", "40", "50", "60", "70"]')
    replace(c/'src/tribulation/TribulationBalance.gd','profiles.size() != 5','profiles.size() != 7')
    replace(c/'src/tribulation/TribulationBalance.gd','for index in range(5):','for index in range(7):')

if __name__=='__main__':
    import sys
    {'server':server,'client':client}[sys.argv[1]]()
