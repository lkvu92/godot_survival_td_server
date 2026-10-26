from pathlib import Path
server=Path(__file__).resolve().parents[1]
client=server.parent/'client'
s=(server/'tmp/test_hero4_piercing.gd').read_text(encoding='utf-8')
s=s.replace('extends SceneTree','extends Node',1).replace('func _initialize()', 'func _ready()')
s=s.replace('func run() -> void:\n', 'func run() -> void:\n\tvar root := get_tree().root\n',1)
s=s.replace('\tquit(0)', '\tget_tree().quit(0)')
(client/'tests/test_hero4_piercing.gd').write_text(s,encoding='utf-8')
(client/'tests/TestHero4Piercing.tscn').write_text('[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://tests/test_hero4_piercing.gd" id="1"]\n[node name="TestHero4Piercing" type="Node"]\nscript = ExtResource("1")\n',encoding='utf-8')
print('Installed persistent Godot regression scene')
