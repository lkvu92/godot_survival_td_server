from pathlib import Path
server=Path(__file__).resolve().parents[1];client=server.parent/'client'
p=client/'src/ui/CardChoiceOverlay.gd'
s=p.read_text(encoding='utf-8')
import re
s=re.sub(r'\n\t+print\("AUTO (?:schedule|wake|index)[^\n]*','',s)
s=re.sub(r'(\n\tchoices.clear\(\))+',r'\n\tchoices.clear()',s)
p.write_text(s,encoding='utf-8')
(client/'tests/test_auto_card_pick.gd').write_text((server/'tmp/test_auto_card_pick.gd').read_text(encoding='utf-8'),encoding='utf-8')
(client/'tests/TestAutoCardPick.tscn').write_text('[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://tests/test_auto_card_pick.gd" id="1"]\n[node name="TestAutoCardPick" type="Node"]\nscript = ExtResource("1")\n',encoding='utf-8')
print('Installed C223 regression scene and stale-offer guard')
for relative in ['docs/contracts/C223_AUTO_CARD_PICK.md','docs/contracts/C196_HERO4_SKILL_REBALANCE.md','docs/reports/AUTO_CARD_PICK_ACCEPTANCE.md']:
    (client/relative).write_text((server/relative).read_text(encoding='utf-8'),encoding='utf-8')
