from pathlib import Path
import json, re, hashlib, os

ROOT = Path(__file__).resolve().parents[2]
SKILLS_PATH = ROOT/'server/data/skills.json'
HEROES_PATH = ROOT/'server/data/heroes.json'
SKILLS = {s['id']: s for s in json.loads(SKILLS_PATH.read_text(encoding='utf-8'))}
HEROES = {h['id']: h for h in json.loads(HEROES_PATH.read_text(encoding='utf-8'))}
MANIFEST = json.loads((ROOT/'client/data/atlas_registry.json').read_text(encoding='utf-8'))
SOURCE_FILES = [SKILLS_PATH, HEROES_PATH, ROOT/'client/src/managers/SkillManager.gd', ROOT/'client/src/actors/Player.gd', ROOT/'client/src/actors/Enemy.gd', ROOT/'client/src/combat/Projectile.gd', ROOT/'client/src/combat/PoisonTrap.gd', ROOT/'client/src/combat/BuddhaMark.gd']
BEFORE = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE_FILES}

def rel(target, origin):
    return os.path.relpath(target, origin).replace('\\','/')

def fmt(value):
    if value is None: return '—'
    if isinstance(value, bool): return 'Có' if value else 'Không'
    if isinstance(value, (int,float)): return f'{value:.8g}'
    if isinstance(value, (dict,list)): return '`'+json.dumps(value,ensure_ascii=False,separators=(',',':'))+'`'
    return str(value).replace('|','\\|').replace('\n',' ')

RATIOS = {'domain_slow_edge','domain_slow_center','impact_stun_chance','attack_speed_slow','def_reduction','freeze_chance','freeze_damage_multiplier','damage_falloff_per_20_pct','skill_1_cooldown_reduction','skill_2_cooldown_reduction','split_damage_multiplier','telegraph_max_hp_pct','wave_stun_chance','stack_size_bonus','same_target_damage_multiplier','stun_chance','crack_burn_hp_percent','rune_hp_percent'}
LABELS = {
 'damage_pct':'Sát thương (% ATK)', 'second_damage_pct':'Sát thương pha phụ (% ATK)',
 'final_damage_pct':'Sát thương kiếm cuối (% ATK)', 'cooldown':'Hồi chiêu (s)',
 'range':'Range cơ sở (px)', 'cast_range':'Tầm tìm mục tiêu để xuất skill (px)',
 'projectile_speed':'Tốc độ bay cố định (px/s)', 'speed_pct':'Tốc độ bay (% tốc độ di chuyển hero)',
 'projectile_count':'Số projectile', 'strike_count':'Số tia chính', 'radius':'Bán kính radius (px)',
 'aoe_radius':'Bán kính nổ (px)', 'explosion_damage_pct':'Sát thương nổ riêng (% ATK)',
 'flank_bolts':'Số tia băng phụ', 'impact_delay':'Độ trễ chạm đất (s)', 'above_height':'Độ cao rơi (px)',
 'domain_duration':'Thời gian băng giới (s)', 'domain_radius':'Bán kính băng giới (px)',
 'domain_cast_range':'Tầm chọn mục tiêu băng giới (px)', 'domain_slow_edge':'Chậm di chuyển ở biên (%)',
 'domain_slow_center':'Chậm di chuyển tại tâm (%)', 'impact_stun_chance':'Tỷ lệ choáng lúc tạo vùng (%)',
 'impact_stun_duration':'Thời gian choáng lúc tạo vùng (s)', 'attack_speed_slow':'Giảm tốc độ đánh quái (%)',
 'def_reduction':'Giảm giáp quái (%)', 'freeze_duration':'Thời gian đóng băng (s)',
 'freeze_chance':'Tỷ lệ đóng băng (%)', 'freeze_damage_multiplier':'Nổ phụ / sát thương tia chính (%)',
 'extra_beams':'Tia cộng thêm cho Skill 1', 'minimum_damage':'Sàn sát thương trực tiếp',
 'damage_falloff_per_20_pct':'Mức giảm mỗi chặng 20% tầm bay (%)',
 'angle_step':'Bước góc (độ)', 'fan_angle':'Bước góc quạt (độ)', 'fan_half_angle':'Giới hạn lệch mỗi bên (độ)',
 'pierce':'Số mục tiêu xuyên', 'knockback_distance':'Đẩy lùi (px)', 'knockback_duration':'Thời gian đẩy lùi (s)',
 'sequence_count':'Số kiếm thường', 'sequence_interval':'Khoảng cách giữa kiếm thường (s)',
 'final_delay':'Trễ thêm của kiếm cuối (s)', 'final_radius':'Bán kính kiếm cuối (px)',
 'wave_count':'Số sóng', 'wave_interval':'Khoảng cách giữa sóng (s)', 'wave_radius':'Bán kính sóng (px)',
 'wave_damage_pct':'Sát thương mỗi sóng (% ATK)', 'wave_stun_chance':'Tỷ lệ choáng mỗi sóng (%)',
 'wave_stun_duration':'Thời gian choáng mỗi sóng (s)', 'wave_duration':'Thời gian mỗi sóng (s)',
 'second_radius':'Bán kính AOE pha phụ (px)', 'move_speed_pct':'Tăng tốc độ di chuyển (%)',
 'dodge_pct':'Tổng né tránh cộng thêm (%)', 'skill_2_cooldown_reduction':'Giảm hồi chiêu Skill 2 (%)',
 'skill_3_crit_damage_bonus':'Cộng vào hệ số sát thương chí mạng Skill 3',
 'skill_1_cooldown_reduction':'Giảm hồi chiêu Skill 1 (%)', 'burn_total_damage_pct':'Tổng thiêu đốt (% ATK)',
 'split_damage_multiplier':'Sát thương mỗi tia tách / tia chính (%)',
 'telegraph_max_hp_pct':'Sát thương mỗi nhịp telegraph (% HP tối đa)',
 'volley_interval':'Khoảng cách giữa tiêu (s)', 'trigger_radius':'Bán kính kích hoạt bẫy (px)',
 'proximity_detonation_delay':'Thời gian ở trong vùng để kích hoạt (s)', 'trap_lifetime':'Tuổi thọ bẫy tối đa (s)',
 'max_traps':'Số bẫy tối đa / hero', 'place_offset':'Khoảng đặt bẫy về phía hero (px)',
 'explosion_duration':'Thời gian effect nổ (s)', 'explosion_loop':'Loop effect nổ',
 'needle_damage_pct':'Sát thương mỗi kim (% ATK)', 'needle_count':'Số kim', 'needle_range':'Tầm bay kim (px)',
 'needle_speed_pct':'Tốc độ kim (% tốc độ hero)', 'needle_delay':'Thời điểm kim đầu (s)',
 'needle_interval':'Khoảng cách giữa kim (s)', 'needle_radius':'Bán kính va chạm kim (px)',
 'needle_poison_atk_pct':'Độc DPS cộng mỗi kim (% ATK hero)', 'needle_poison_duration_extension':'Thời gian độc cộng mỗi kim (s)',
 'needle_poison_dps_cap':'Giới hạn tổng độc (DPS)', 'vortex_duration':'Tuổi thọ xoáy (s)',
 'vortex_tick_count':'Số nhịp sát thương xoáy', 'vortex_tick_interval':'Khoảng cách nhịp xoáy (s)',
 'vortex_spin_speed':'Tốc độ quay xoáy (độ/s)', 'formation_duration':'Thời gian tầng trận (s)',
 'formation_animation_duration':'Thời gian chạy một lượt frame trận (s)', 'rune_delay':'Trễ xuất hiện cổ ngữ (s)',
 'rune_duration':'Thời gian cổ ngữ (s)', 'rune_tick_interval':'Khoảng cách nhịp cổ ngữ (s)',
 'rune_damage_pct':'Mỗi nhịp cổ ngữ (% ATK)', 'rune_hp_percent':'Mỗi nhịp cổ ngữ (% HP tối đa)',
 'stun_chance':'Tỷ lệ choáng (%)', 'stun_duration':'Thời gian choáng (s)',
 'crack_duration':'Thời gian đất nứt (s)', 'crack_tick_interval':'Khoảng cách nhịp đất nứt (s)',
 'crack_burn_hp_percent':'Tổng đốt đất nứt trong 1s (% HP tối đa)',
 'golden_duration':'Thời gian ảnh kim thân (s)', 'protection_duration':'Miễn nhiễm và bất bại đầu chiêu (s)',
 'punch_count':'Số quyền', 'punch_interval':'Khoảng cách giữa quyền (s)', 'target_radius':'Bán kính tìm mục tiêu từ hero (px)',
 'same_target_damage_multiplier':'Sát thương hit lặp / hit đầu (%)', 'mark_pair_window':'Khoảng cách tối đa của 2 hit liên tiếp (s)',
 'mark_stun_window':'Cửa sổ 3 hit gây choáng (s)', 'mark_reset_gap':'Ngắt quá thời gian này reset count (s)',
 'mark_stun_hits':'Số hit liên tiếp để choáng', 'stack_size_bonus':'Tăng size mỗi hit nối tiếp (%)',
}

NOTES = {
 'hero_1_skill_1': 'Băng Luân Song Hành là projectile tuyến tính. Các tia chính theo cấp là 1/1/2/2/3; Hàn Băng Thấu Thể ở slot 4 mới là nội tại cường hóa tia. Không dùng lại mô tả cũ gọi nội tại là Skill 3.',
 'hero_1_skill_2': 'Băng thạch rơi trong 0,35s, tầm chọn mục tiêu 600px. Tia phụ gây **40% sát thương chính**, tốc độ 540px/s; mỗi tia làm chậm 30% trong 2s, áp dụng từ cấp có tia phụ (Lv2). Bốn tia ở Lv5 hiện dùng xoay vòng ba spawn offset cấu hình, nên tia thứ tư dùng lại offset đầu. Không có sát thương pha hai (`second_damage_pct=0`).',
 'hero_1_skill_3': 'Skill hỗ trợ, **không gây sát thương trực tiếp**. Mỗi lần tạo vùng mới đều thu hồi vùng và modifier cũ của chính caster; vùng của caster khác không bị xóa. Giảm tốc độ di chuyển tăng tuyến tính từ biên 10% tới tâm 50%; choáng lúc tạo vùng là 50% trong 0,1s. Cả 5 cấp có chỉ số riêng như bảng dưới.',
 'hero_1_skill_4': 'Nội tại cường hóa Skill 1: `damage_pct` là **bonus sát thương**, `speed_pct` là **bonus tốc độ bay**, không phải tốc độ bay độc lập. Tăng sát thương 12,5/15/17,5/20/22,5%; tốc độ bay +15/20/25/30/35%. Mỗi mục tiêu trúng có 30% cơ hội đóng băng 0,2s. Nổ phụ bán kính 48px gây 25% sát thương tia chính; nổ không phụ thuộc việc proc đóng băng. Giữ xuyên 999, tia cộng thêm và suy giảm theo khoảng bay như config.',
 'hero_2_skill_1': 'Bắn 1/1/2/2/3 tia. Bước lệch tia hiện tại là **10°** theo runtime; không dùng thông số góc rộng trước đây. Nội tại Skill 3 điều chỉnh hồi chiêu, thiêu đốt và tia tách.',
 'hero_2_skill_2': 'Phải tách rõ **cast_range=700px** (tầm xuất skill/tìm mục tiêu) và **range=1024px** (tầm bay). Bán kính 100/115/130/145/160px và VFX đã được chỉnh tương ứng. Chu Tước dùng artwork không phủ alpha tùy chỉnh và chỉ đẩy lùi nhẹ 24/27/30/33/36px trong 0,15s.',
 'hero_2_skill_3': 'Nội tại yêu cầu đã có Skill 1. Giảm hồi chiêu Skill 1, thêm tổng thiêu đốt theo % ATK và tia tách; mỗi tia tách gây 35% sát thương chính, tầm 360px. Không cộng bonus phần trăm của các cấp cũ lần nữa khi lên cấp.',
 'hero_2_skill_4': 'Khóa vị trí mục tiêu trong 2s. Telegraph bán kính 96px gây 4 nhịp cách 0,5s, mỗi nhịp 0,5% HP tối đa. Sau đó bắn tiễn chính và hai tiễn phụ; mỗi tiễn phụ có hệ số sát thương 50% tiễn chính. Đọc `side_delay`, `side_spacing` và các hệ số hiển thị theo cấp bên dưới.',
 'hero_3_skill_1': 'Kiếm Phiến có tốc độ cố định **320px/s**, không nhân tốc độ di chuyển và không tăng khi Thất Tinh Trận buff chạy. Đẩy lùi cố định 35px; hướng quạt theo bước 10°. Với 5 kiếm, các góc là −20/−10/0/10/20°. Không xuyên (`pierce=0`).',
 'hero_3_skill_2': 'Kiếm lớn gây một hit lên mục tiêu đã khóa; tám kiếm là **một lần sát thương AOE**, không phải 8 lần hệ số đó. Thêm 3 sóng lan ở thời điểm impact +0/+0,3/+0,6s, mỗi sóng gây một phần ba hệ số AOE và chỉ trúng một lần/mục tiêu/sóng. Mỗi sóng có 30% choáng 0,2s; không còn choáng chắc chắn từ kiếm lớn/AOE. Hồi chiêu mới 8/7,5/7/6,5/6s trước giảm từ Skill 4.',
 'hero_3_skill_3': 'Phóng 6/8/10/12/14 kiếm thường cách nhau 0,1s rồi thêm kiếm cuối. Kiếm thường gây 12,5/15/17,5/20/25% ATK, kiếm cuối 100/130/140/150/160%. Xuyên 999; hiệu ứng đẩy lùi cấu hình được áp dụng cho kiếm cuối, còn kiếm thường đặt `effects=[]`. Hồi chiêu 12/11/10/9/8s.',
 'hero_3_skill_4': 'Nội tại: giảm hồi chiêu Skill 2 là 15/20/25/30/35%; cộng **0,10/0,15/0,20/0,25/0,30 vào hệ số chí mạng** của Skill 3. Tốc độ di chuyển tổng thêm 0/5/10/15/20%; bonus phần trăm cấp mới thay cấp cũ, không cộng dồn 5+10+15+20. Né tránh tổng thêm 10/15/20/25/30%; `stat_flat` bên dưới là phần tăng ở từng lần nhận cấp (10% rồi +5% mỗi cấp).',
 'hero_4_skill_1': 'Mỗi tiêu gây sát thương trực tiếp và đặt độc 25/30/35/40/45% ATK **mỗi giây**, luôn trong 2s. Số tiêu 1/2/2/3/3, bắn nối tiếp theo `volley_interval`; không mặc định nhân toàn bộ độc với số tiêu vì độc thường dùng max potency/refresh.',
 'hero_4_skill_2': 'Độc luân xuyên, bay đi rồi quay lại; hệ số bảng là **mỗi lần trúng**, không phải tổng cả đi/về. Bước góc 10°, giới hạn ±20°. Làm chậm 15/17,5/20/22,5/25%; thời gian chậm và tốc độ bay giữ theo từng cấp.',
 'hero_4_skill_3': 'Giới hạn 3/4/5/6/9 bẫy **riêng mỗi caster**; đặt vượt giới hạn thu hồi bẫy đang sống cũ nhất, không cho bẫy đó nổ. Bẫy hết hạn/đã nổ không chiếm slot. Creep phải ở trong vùng kích hoạt đủ 1s. Effect nổ tăng size 30% so với bản cũ, loop **1,5s**, nhưng sát thương và trạng thái chỉ áp dụng **một lần**. Phân biệt bán kính kích hoạt với bán kính nổ. Các dòng mô tả radius cũ không còn là nguồn thông số.',
 'hero_4_skill_4': 'Xoáy tồn tại **2,5s**, loop artwork chu kỳ 1s và quay **400°/s**. Tổng sát thương được chia 5 nhịp tại 0/0,5/1/1,5/2s; mỗi nhịp/mục tiêu độc lập có 20% choáng 0,1s. Kim bắt đầu 0,5s, cách 0,1s, hướng ngẫu nhiên độc lập. Mỗi kim cộng **5% ATK hero vào độc DPS hiện có** và cộng **0,5s thời gian độc còn lại**; chưa có độc thì bắt đầu 0,5s. Tổng độc bị giới hạn **5.000 DPS** trong thời gian hiệu ứng, tương đương tối đa 2.500 sát thương thô mỗi tick 0,5s. Độc thường nhận thêm trong thời gian này không vượt cap. Hết độc hoặc reset actor sẽ xóa cap. Đã bỏ độc cộng dồn theo % HP của bản cũ.',
 'hero_5_skill_1': 'Tia chính gây **60/75/85/100/120% ATK**, khi trúng nổ riêng **25/30/35/40/45% ATK**. Không còn chia hệ số tia chính thành 50% direct +50% nổ. Nếu cùng mục tiêu nhận đủ hai phần, tổng hệ số cơ sở là 85/105/120/140/165% ATK trước phòng thủ/buff. Số tia 1/1/2/2/3, bước góc 10°. Nổ dùng đúng `hero_5_skill1_effect1.png` (3×3, 9 frame), một lần trong 0,4s tại điểm trúng, alpha 0,7.',
 'hero_5_skill_2': '**CHƯA CHỐT PHẦN % HP:** người dùng mới cung cấp bốn mốc `0,2 | 0,3 | 0,6 | 1%` cho năm cấp. Chưa suy đoán vị trí mốc thiếu; config hiện **chưa có `rune_hp_percent`**, nên runtime hiện dùng **0** cho phần cộng % HP này. Không coi Skill 2 là hoàn tất và không publish như bản đã chốt.\n\nTầng 1: trận xuất hiện tại tâm mục tiêu đã khóa, gây AOE ban đầu, phát animation một lượt trong 1s rồi giữ frame cuối tới đủ 2s, không loop/không fade frame giữ. Tầng 2: cổ ngữ xuất hiện tại **t=1s**, loop 1,5s; 3 nhịp sát thương tại **t=1,5/2/2,5s**. Mỗi nhịp gây 25/30/35/40/45% ATK **cộng** phần % HP còn chờ. Mỗi hit gây sát thương có 35% cơ hội choáng theo cấp. Không còn đặt burn 3s như phiên bản cũ.',
 'hero_5_skill_3': 'Tầng 1: chưởng rơi sau 0,35s, không loop; bán kính 70/75/80/85/90px, sprite đã giảm theo cùng tỷ lệ, gây 100/110/120/130/140% ATK. Tầng 2 bắt đầu ngay lúc impact: đất nứt không loop trong 1s, kiểm tra mục tiêu trong AOE tại hai nhịp impact +0,5/+1s; tổng đốt là 0,5/0,6/0,7/0,8/1% HP tối đa. Không còn hit phụ 35% sát thương chưởng. Tầng 3 cũng bắt đầu lúc impact: 1/2/2/3/3 sóng, cách 0,2s; mọi sóng cùng bán kính cuối 100/110/120/130/140px, lan theo vành khuyên, **không gây AOE toàn vùng ngay lập tức**. Mỗi sóng đánh một lần/mục tiêu với 30/40/50/60/70% ATK và 20% choáng 0,1/0,15/0,2/0,25/0,3s. Sóng không còn gây % HP.',
 'hero_5_skill_4': 'Tầng 1: ảnh kim thân dùng `hero_5_skill4_sprite.png`, cố định tại điểm tung chiêu trong 2s, không loop, không đi theo hero. Xóa debuff có hại khi cast; miễn nhiễm trạng thái có hại và **không chịu sát thương cùng trong 0,5s đầu**. Sau 0,5s không còn giảm 50% sát thương như logic cũ.\n\nTầng 2: quyền dùng `hero_5_skill1_effect1.png`, xuất từ **vị trí hero hiện tại mỗi lần phát**, cách nhau 0,2s, chọn ngẫu nhiên mục tiêu còn sống trong bán kính 700/730/760/790/820px từ hero. Số quyền 12/14/16/18/20 nên burst dài hơn ảnh kim thân: quyền cuối xuất ở 2,2/2,6/3,0/3,4/3,8s. Sát thương 40/40/50/55/60% ATK; trong cùng cast, hit **thực sự** đầu tiên lên mỗi mục tiêu đủ lực, hit sau còn 50%. Quyền bay hụt không tăng count hay làm giảm quyền tiếp theo.\n\nTầng 3: khi trúng tạo ấn ở tâm mục tiêu bằng `hero_5_skill4_effect2.png`, đi theo mục tiêu. Count tổng và count liên tiếp riêng từng caster; hai hit cách nhau ≤0,5s mới nối chuỗi. Ba hit liên tiếp trong ≤1s gây một lần choáng 0,5s cho chuỗi; hit thứ tư/thứ năm không tăng thời gian choáng. Mỗi hit nối tiếp sau hit đầu tăng size ấn thêm 5% (hit 2: +5%, hit 3: +10%). Ngắt >0,5s nhưng ≤1s chỉ ngắt chuỗi, còn count tổng; ngắt >1s reset cả hai và ẩn ấn. Pool generation mới không kế thừa count/sát thương giảm của actor cũ. Không còn bonus tăng damage theo ấn hay range theo kích thước map.',
}

def label(sid, key):
    if sid=='hero_1_skill_4' and key=='damage_pct': text='Tăng sát thương Skill 1 (%)'
    elif sid=='hero_1_skill_4' and key=='speed_pct': text='Tăng tốc độ bay Skill 1 (%)'
    elif sid=='hero_4_skill_4' and key=='damage_pct': text='Tổng sát thương xoáy (% ATK)'
    elif sid=='hero_5_skill_1' and key=='damage_pct': text='Sát thương tia trực tiếp (% ATK)'
    else: text=LABELS.get(key,key)
    return f'{text} (`{key}`)' if text!=key else f'`{key}`'

def render_value(key,value):
    return fmt(value*100) if key in RATIOS and isinstance(value,(int,float)) and not isinstance(value,bool) else fmt(value)

def rows_table(sid, levels, keys):
    varying=[];constant=[]
    for key in keys:
        values=[l.get('stats',{}).get(key) for l in levels]
        (constant if all(v==values[0] for v in values) else varying).append((key,values))
    out=[]
    if varying:
        out+=['| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |','|---|---:|---:|---:|---:|---:|']
        out += ['| '+label(sid,k)+' | '+' | '.join(render_value(k,v) for v in vals)+' |' for k,vals in varying]
    if constant:
        out+=['','Thông số cố định cho cả 5 cấp:','','| Thông số | Giá trị |','|---|---:|']
        out += ['| '+label(sid,k)+' | '+render_value(k,vals[0])+' |' for k,vals in constant]
    return '\n'.join(out)+'\n'

def asset_path(frame):
    for key,conf in sorted(MANIFEST['spritesheet_vfx'].items(),key=lambda p:-len(p[0])):
        if frame==key or frame.startswith(key+'_'):
            return conf.get('path')
    return None

def hero_doc(repo,number):
    hid=f'hero_{number}';hero=HEROES[hid];folder=repo/'docs/heroes'
    source_link=rel(SKILLS_PATH,folder)
    out=[f'# Hero {number} — {hero["display_name"]}', '', 'Version: 1.0.0  ', 'Cập nhật: 2026-10-24', '',
         '[Danh sách 5 hero](../HERO_SKILLS_CURRENT.md) · [Config skill nguồn]('+source_link+')', '',
         'Tài liệu phản ánh **source hiện tại**, không xác nhận config đang chạy trên local/VPS. Giá trị là cơ sở trước buff trang bị, giảm hồi chiêu chung, phòng thủ và chí mạng. Gameplay vẫn cần snapshot server hợp lệ; không dùng tài liệu làm fallback.', '',
         'Các cột Lv1–Lv5 là **cấp skill trong trận**. Level hero mở skill và level trong trận để chọn thẻ là hai điều kiện riêng. `speed_pct` là % tốc độ di chuyển của hero, ngoại trừ bonus tốc độ của nội tại Hero 1 Skill 4; `projectile_speed` là px/s cố định. Hệ số phần trăm dạng 0–1 được đổi sang % khi nhãn ghi (%); raw key giữ trong ngoặc để đối chiếu JSON.', '',
         '| Slot | Skill | Level hero mở | Level trong trận | Loại |', '|---|---|---:|---:|---|']
    for slot in range(1,5):
        s=SKILLS[f'{hid}_skill_{slot}'];out.append(f'| {slot} | {s["display_name"]} | {s.get("hero_level_unlock")} | {s["createria_unlock"]["level"]} | `{s.get("skill_type")}` / `{s.get("skill_class")}` |')
    if number==4:out+=['','**Lưu ý:** Skill 4 Hero 4 hiện vẫn chọn trong trận từ **Lv10** theo config, khác Lv15 của các hero còn lại. Đây là ghi nhận hiện trạng, không tự đổi yêu cầu mở khóa.']
    for slot in range(1,5):
        sid=f'{hid}_skill_{slot}';skill=SKILLS[sid];levels=skill['levels']
        out+=['',f'## Skill {slot} — {skill["display_name"]}', '',NOTES[sid], '']
        required=skill.get('createria_unlock',{}).get('required_skill')
        if required:out += [f'Yêu cầu thêm: đã học `{required}`.','']
        keys=list(dict.fromkeys(k for l in levels for k in l['stats']))
        visual=[k for k in keys if any(word in k for word in ['vfx','animation','radius_progress','collision_padding','ring_width','tick_count']) and k!='vortex_tick_count']
        gameplay=[k for k in keys if k not in visual]
        out+=['### Chỉ số gameplay','',rows_table(sid,levels,gameplay)]
        effect_keys=list(dict.fromkeys((effect['id'],key) for l in levels for effect in l.get('effects',[]) for key in effect if key!='id'))
        if effect_keys:
            out+=['### Hiệu ứng theo cấp','', '| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |','|---|---:|---:|---:|---:|---:|']
            for eid,key in effect_keys:
                values=[next((e.get(key) for e in l.get('effects',[]) if e['id']==eid),None) for l in levels]
                out.append('| `'+eid+'.'+key+'` | '+' | '.join(fmt(v) for v in values)+' |')
            out += ['', 'Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.']
        if any(l.get('passive_effects') for l in levels):
            out += ['','### Passive effect khi nhận từng cấp','', '| Type / stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |','|---|---:|---:|---:|---:|---:|']
            groups=list(dict.fromkeys((e['type'],e.get('stat','')) for l in levels for e in l.get('passive_effects',[])))
            for kind,stat in groups:
                values=[next((e.get('value') for e in l.get('passive_effects',[]) if (e['type'],e.get('stat',''))==(kind,stat)),None) for l in levels]
                out.append('| `'+kind+'/'+stat+'` | '+' | '.join(fmt(v) for v in values)+' |')
            out += ['','`stat_percent` dùng giá trị của **cấp hiện tại thay cấp cũ**; `stat_flat` trong bảng này là phần tăng khi nhận từng cấp.']
        if visual:out+=['','### Thông số hiển thị và đồng bộ va chạm','',rows_table(sid,levels,visual)]
        frames=[(k,v) for k,v in skill.items() if k.endswith('frames') and isinstance(v,list)]
        if isinstance(skill.get('flank_bolt_config'),dict):
            frames.append(('flank_bolt_config.vfx_frames',skill['flank_bolt_config'].get('vfx_frames',[])))
        if frames:
            out+=['','### Frame/asset qua AtlasRegistry','', '| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |','|---|---:|---|---|']
            for key,ids in frames:
                first=str(ids[0]) if ids else '—';path=asset_path(first) if ids else None
                out.append(f'| `{key}` | {len(ids)} | `{first}` | '+('`'+path+'`' if path else 'Tra theo ID trong AtlasRegistry')+' |')
        out+=['','<!-- skill-stats-source '+sid+' '+hashlib.sha256(json.dumps([l['stats'] for l in levels],sort_keys=True,separators=(',',':')).encode()).hexdigest()+' -->']
    out+=['','## Nguồn triển khai','']
    for path in [ROOT/'client/src/managers/SkillManager.gd',ROOT/'client/src/services/SkillValueService.gd',ROOT/'client/src/combat/Projectile.gd']:
        out.append('- ['+path.name+']('+rel(path,folder)+')')
    if number==4:
        for name in ['PoisonTrap.gd']:
            path=ROOT/'client/src/combat'/name;out.append('- ['+name+']('+rel(path,folder)+')')
    if number==5:
        path=ROOT/'client/src/combat/BuddhaMark.gd';out.append('- [BuddhaMark.gd]('+rel(path,folder)+')')
    out+=['','## Changelog','','| Version | Ngày | Thay đổi |','|---|---|---|','| 1.0.0 | 2026-10-24 | Tổng hợp đầy đủ config và hành vi sau các thay đổi trong phiên; tách thông số hiện tại khỏi thiết kế lịch sử. |','']
    folder.mkdir(parents=True,exist_ok=True);(folder/f'HERO_{number}.md').write_text('\n'.join(out),encoding='utf-8')

overview='''# Skill hero — thông số source hiện tại

Version: 1.0.0
Cập nhật: 2026-10-24

Đây là điểm vào tài liệu kỹ năng hiện hành của **cả 5 hero**. Các bảng được
đối chiếu từ server/data/skills.json và hành vi client, thay thế thông số cũ
trong snapshot 2026-10-13 hoặc bảng thiết kế lịch sử nếu có mâu thuẫn.
Tài liệu không phải gameplay config và không chứng minh bản local/VPS đã publish.

| Hero | Tài liệu | Các thay đổi hiện hành |
|---|---|---|
| 1 — Băng Tuyết Thánh Nữ | [Hero 1](heroes/HERO_1.md) | Slot 3 băng giới hỗ trợ; slot 4 cường hóa Skill 1; tia băng phụ 40%, đóng băng 30%/0,2s, nổ phụ 25%. |
| 2 — Liệt Diễm Tiễn Tôn | [Hero 2](heroes/HERO_2.md) | Bước góc 10°; Chu Tước radius 100–160px, cast range 700px khác tầm bay 1024px. |
| 3 — Vô Cực Kiếm Tôn | [Hero 3](heroes/HERO_3.md) | Kiếm Phiến 320px/s cố định; chuỗi kiếm mới cách 0,1s; Thất Tinh Trận thêm tốc độ di chuyển. |
| 4 — U Ảnh Độc Tôn | [Hero 4](heroes/HERO_4.md) | Mốc damage/độc mới, giới hạn bẫy theo hero; xoáy 2,5s/5 nhịp, độc kim cộng ATK và cap 5.000 DPS. |
| 5 — Vạn Tượng Quán Âm | [Hero 5](heroes/HERO_5.md) | Tia/nổ riêng, cổ ngữ trễ, chưởng/đất nứt/sóng lan; kim thân đứng yên, bảo vệ 0,5s, ấn ký tính từ hit thật. |

## Cách đọc và quyền dữ liệu

- Lv1–Lv5 trong bảng là cấp skill; level hero mở skill khác level trong trận để chọn thẻ.
- Level hero mở skill của cả 5 hero là 1/10/20/30. Level trong trận là 1/5/10/15,
  **riêng Hero 4 Skill 4 hiện còn Lv10 theo config**; tài liệu không tự sửa gate.
- Damage % ATK, damage % HP, bonus chí mạng dạng cộng vào hệ số và độc DPS
  là các đại lượng khác nhau. Các số là cơ sở trước buff, DEF/crit và giảm hồi chiêu.
- `speed_pct` thường phụ thuộc tốc độ hero; Hero 3 Skill 1 dùng `projectile_speed=320px/s`.
- `cast_range` là tầm chọn mục tiêu để xuất skill; `range`/`needle_range` có thể là tầm bay.
- Dữ liệu balance thuộc Nakama DB; seed JSON ở server là đầu vào phiên bản hóa.
  Client chỉ có manifest hiển thị. C121 yêu cầu auth/config snapshot đầy đủ,
  không có local gameplay/reward/profile fallback.

## Phần còn chờ chốt — Hero 5 Skill 2

Phần % HP mỗi đợt của tầng cổ ngữ mới có **4 mốc** `0,2 | 0,3 | 0,6 | 1%`
cho **5 cấp**. Chưa tự suy đoán mốc còn thiếu. `rune_hp_percent` hiện chưa có
trong source config nên runtime dùng **0** cho phần % HP này. C197 vẫn
`IN_PROGRESS`; các phần timing, % ATK và Skill 4 đã triển khai/kiểm thử.

## Timeline dễ nhầm

| Skill | Timeline hiện tại |
|---|---|
| Hero 4 Skill 4 | Xoáy 0–2,5s; damage tại 0/0,5/1/1,5/2s; kim từ 0,5s, cách 0,1s. |
| Hero 5 Skill 2 | Trận 0–2s; cổ ngữ 1–2,5s; damage cổ ngữ tại 1,5/2/2,5s. |
| Hero 5 Skill 3 | Impact 0,35s; crack tới 1,35s; sóng bắt đầu từ impact, cách 0,2s và lan theo vành khuyên. |
| Hero 5 Skill 4 | Ảnh kim thân 0–2s cố định; bảo vệ 0–0,5s; quyền xuất mỗi 0,2s, quyền cuối ở 2,2–3,8s tùy cấp. |

## Contract triển khai liên quan

- [C162 — các đường cong damage và override](contracts/C162_HERO_SKILL_DAMAGE_CURVES.md).
- [C180 — băng giới Hero 1](contracts/C180_HERO_1_ICE_DOMAIN_LAYERS.md).
- [C189 — thứ tự skill/gate và nội tại Hero 1](contracts/C189_HERO_1_SKILL_ORDER.md).
- [C187 — góc Hero 2](contracts/C187_HERO_2_SKILL1_SPREAD.md), [C188 — Chu Tước](contracts/C188_HERO_2_PHOENIX_RANGE.md).
- [C195 — Hero 3](contracts/C195_HERO3_SKILL_REBALANCE.md).
- [C196 — Hero 4](contracts/C196_HERO4_SKILL_REBALANCE.md).
- [C197 — Hero 5 và mục chưa chốt](contracts/C197_HERO5_SKILL_REBALANCE.md).
- [C198 — hợp nhất tài liệu hiện hành](contracts/C198_HERO_SKILL_DOCS_CURRENT.md).

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.0 | 2026-10-24 | Hợp nhất thông số, cơ chế, asset và các mục chờ chốt của 5 hero theo source hiện tại. |
'''

contract='''# C198 Current hero skill documentation

Version: 1.0.0
Status: IN_PROGRESS

## Scope and interfaces
Documentation-only consolidation for all five heroes. Canonical entry point is
docs/HERO_SKILLS_CURRENT.md with docs/heroes/HERO_1.md through HERO_5.md,
mirrored in client/server repositories. Tables derive from current server
skills.json, while behavior is checked against client implementation.
Existing JSON schemas, seed/auth/config RPC request/response payloads, methods
and gameplay values are unchanged. C121 online-only/no-fallback rules remain.
Assets are only documented through existing AtlasRegistry IDs/manifest paths;
no textures, UiSkin styling or signal wiring change.

## Precedence and incomplete configuration
Older design contracts and dated snapshots point to the current pages and
explicitly retain their historical role. Update hero contract patch versions,
Changelog, contract registry and docs index. Reconcile stale fixed-domain,
HP-poison, hero skill slot and golden-body immunity claims.
Hero4 skill4 combat gate remains10 in the docs because config is unchanged.
Hero5 skill2 rune_hp_percent remains absent: user supplied four values for five
levels. Runtime currently uses0 for that term; C197 stays IN_PROGRESS. Never
invent the missing value or state that server publication has occurred.

## Acceptance
Check per-skill stat table fingerprints against all20 authoritative rows,
verify links/assets/metadata and mirrored current pages. Run both repository
static suites. Source hashes before/after must prove no gameplay edits.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Consolidate current hero stats/behavior and distinguish historical docs and pending HP curve. |
'''

def add_notice(p,text):
    s=p.read_text(encoding='utf-8');parts=s.split('\n',1)
    p.write_text(parts[0]+'\n\n'+text+'\n'+(parts[1] if len(parts)>1 else ''),encoding='utf-8')

def add_changelog(s,version,message):
    row=f'| {version} | 2026-10-24 | {message} |'
    match=re.search(r'(?im)^#{1,6}[^\n]*Changelog[^\n]*$',s)
    if match:
        sep=re.search(r'(?m)^\|[- :|]+\|\s*$',s[match.end():])
        if sep:
            pos=match.end()+sep.end();n=s[match.end()+sep.start():pos].strip().count('|')-1
            vals=[version,'2026-10-24']+['Documentation']*max(0,n-3)+[message]
            return s[:pos]+'\n| '+' | '.join(vals)+' |'+s[pos:]
    return s+'\n\n## Documentation Changelog\n\n| Version | Date | Change |\n|---|---|---|\n'+row+'\n'

BASE=[('C003_HERO_1_ICE_DEMONESS',1,'1.7.1'),('C009_HERO_2_FLAME_ARCHER',2,'2.2.1'),('C010_HERO_3_BLADE_SENTINEL',3,'1.4.4'),('C012_HERO_4_VENOM_SHADE',4,'1.5.1'),('C011_HERO_5_AVALOKITESHVARA',5,'1.6.1')]
for name in ['server','client']:
    repo=ROOT/name
    (repo/'docs/HERO_SKILLS_CURRENT.md').write_text(overview,encoding='utf-8')
    (repo/'docs/contracts/C198_HERO_SKILL_DOCS_CURRENT.md').write_text(contract,encoding='utf-8')
    for i in range(1,6): hero_doc(repo,i)
    registry_path=repo/'docs/contracts/REGISTRY.json';registry=json.loads(registry_path.read_text(encoding='utf-8'))
    entries={x['id']:x for x in registry['contracts']}
    for cid,i,version in BASE:
        p=repo/'docs/contracts'/f'{cid}.md'
        if not p.exists(): continue
        s=p.read_text(encoding='utf-8')
        s=re.sub(r'^> \*\*Thông số hiện hành:\*\*[^\n]*\n?', '', s, flags=re.M)
        s=re.sub(r'(\| \*\*Current Version\*\* \| `)[^`]+',lambda m:m[1]+version,s,count=1)
        s=re.sub(r'(\| \*\*Last Updated\*\* \| `)[^`]+',lambda m:m[1]+'2026-10-24',s,count=1)
        lines=s.split('\n',1);notice=f'> **Thông số hiện hành (2026-10-24):** [Hero {i} — bảng và cơ chế hiện tại](../heroes/HERO_{i}.md), [mục lục 5 hero](../HERO_SKILLS_CURRENT.md). Các phần đặc tả/bảng balance bên dưới là lịch sử thiết kế; khi có mâu thuẫn, dùng trang hiện hành và config server. C121 thay mọi quy tắc offline cũ.'
        s=lines[0]+'\n\n'+notice+'\n'+lines[1]
        s=add_changelog(s,version,'Đối chiếu config/runtime mới, chuyển nguồn thông số hiện hành sang tài liệu từng hero; giữ rõ phần lịch sử.')
        p.write_text(s,encoding='utf-8')
        if cid in entries:entries[cid].update(version=version,updated_at='2026-10-24')
    # Mark older analyses as dated rather than silently changing old findings.
    for filename in ['HERO_BALANCE_SNAPSHOT_2026-10-13.md','HERO_SKILLS_AOE_REVIEW.md']:
        p=repo/'docs'/filename
        if p.exists():
            s=p.read_text(encoding='utf-8').replace('Tài liệu này là snapshot cân bằng và hành vi runtime hiện hành cho 5 hero. Khi có khác biệt với các bảng cũ trong contract `C003`, `C009`, `C010`, `C011`, hoặc `C012`, tài liệu này và dữ liệu runtime là nguồn ưu tiên.','Tài liệu này lưu snapshot lịch sử, không còn là nguồn thông số hiện hành. Dùng [Skill hero hiện tại](HERO_SKILLS_CURRENT.md) để xem các thay đổi sau snapshot.')
            p.write_text(s,encoding='utf-8');add_notice(p,'> **Tài liệu lịch sử:** số liệu bên dưới thuộc thời điểm ghi nhận. Thông số và cơ chế hiện hành: [Skill hero — 2026-10-24](HERO_SKILLS_CURRENT.md).')
    for feature in ['F001_HERO_SYSTEM.md','F002_SKILL_COMBAT.md']:
        p=repo/'docs/features'/feature
        if p.exists():add_notice(p,'> **Thông số skill hiện hành:** [Mục lục đủ 5 hero](../HERO_SKILLS_CURRENT.md). Các bảng balance cũ trong feature/contract không ghi đè trang hiện hành; riêng Hero 5 Skill 2 còn chờ một mốc % HP.')
    p=repo/'docs/INDEX.md';add_notice(p,'- [Skill hero — thông số hiện hành 2026-10-24](HERO_SKILLS_CURRENT.md): đủ 5 hero, 20 skill; bảng level, cơ chế/asset và phần % HP Hero 5 còn chờ chốt.\n- [C198 Current hero documentation](contracts/C198_HERO_SKILL_DOCS_CURRENT.md) v1.0.0: đối chiếu source và thay đường dẫn ưu tiên khỏi snapshot cũ.')
    s=p.read_text(encoding='utf-8');s=s.replace('four-stage impact, 10s field / 15s cooldown, centred slow gradient and authored VFX parsing.','slot 3 support field, level-scaled duration/cooldown/radius/debuffs and owner-specific replacement (C189).')
    s=s.replace('skills 2/3/4 require persistent hero levels 5/10/15.','historical gate change; superseded by C189: persistent levels 1/10/20/30, combat levels 1/5/10/15.')
    s=s.replace('hero skill 1 stops on hit unless hero 1 passive 3 is learned.','hero skill 1 stops on hit unless Hero 1 mastery (now slot 4 under C189) is learned.')
    p.write_text(s,encoding='utf-8')
    if 'C198_HERO_SKILL_DOCS_CURRENT' not in entries:
        registry['contracts'].insert(0,dict(id='C198_HERO_SKILL_DOCS_CURRENT',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C198_HERO_SKILL_DOCS_CURRENT.md'))
    registry_path.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest for path,digest in BEFORE.items()),'Documentation work must not change gameplay source'
(ROOT/'server/tmp/hero_docs_source_hashes.json').write_text(json.dumps(BEFORE,indent=2),encoding='utf-8')
print('Generated 5 hero pages + overview in both repos; patched hero contracts, old snapshot notices and indexes. Gameplay source hashes unchanged.')
