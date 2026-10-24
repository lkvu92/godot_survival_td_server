from pathlib import Path
import json,hashlib,re
ROOT=Path(__file__).resolve().parents[2]
skills={s['id']:s for s in json.loads((ROOT/'server/data/skills.json').read_text(encoding='utf-8'))}
checked=0;links=0
for name in ['server','client']:
 repo=ROOT/name
 for number in range(1,6):
  p=repo/f'docs/heroes/HERO_{number}.md';text=p.read_text(encoding='utf-8')
  assert '\ufffd' not in text and 'Ã' not in text and 'â€' not in text,p
  sections=re.split(r'^## Skill \d+[^\n]*\n',text,flags=re.M)[1:]
  assert len(sections)==4
  for slot,section in enumerate(sections,1):
   sid=f'hero_{number}_skill_{slot}';s=skills[sid]
   actual=re.search(r'<!-- skill-stats-source '+sid+r' ([a-f0-9]+) -->',section)
   expected=hashlib.sha256(json.dumps([l['stats'] for l in s['levels']],sort_keys=True,separators=(',',':')).encode()).hexdigest()
   assert actual and actual[1]==expected,(p,sid,'stale stats fingerprint')
   for key in dict.fromkeys(k for l in s['levels'] for k in l['stats']):
    assert f'(`{key}`)' in section or f'| `{key}` |' in section,(p,key,'missing stat row')
   for field in ['hero_level_unlock','createria_unlock']:
    assert field in s
   checked+=1
  for target in re.findall(r'\]\(([^)]+)\)',text):
   if '://' in target or target.startswith('#'):continue
   assert (p.parent/target.split('#')[0]).resolve().exists(),(p,target)
   links+=1
  for asset in re.findall(r'`(res://assets/[^`]+)`',text):
   assert (ROOT/'client'/asset.removeprefix('res://')).exists(),asset
  # Five-level curves must not hide the incomplete HP term or the unusual gate.
  if number==5:assert 'rune_hp_percent' in text and '0,2/0,3/0,6/0,8/1%' in text and 'CHƯA CHỐT' not in text
  if number==4:assert 'Skill 4 Hero 4 hiện vẫn chọn trong trận từ **Lv10**' in text
 overview=repo/'docs/HERO_SKILLS_CURRENT.md'
 for target in re.findall(r'\]\(([^)]+)\)',overview.read_text(encoding='utf-8')):
  assert (overview.parent/target).exists(),(overview,target)
 registry=json.loads((repo/'docs/contracts/REGISTRY.json').read_text(encoding='utf-8'))
 for entry in registry['contracts']:
  if entry['id'].startswith(('C003_','C009_','C010_','C011_','C012_','C162_','C180_','C183_','C184_','C185_','C198_')):
   p=repo/entry['contract_file']
   if not p.exists():continue
   text=p.read_text(encoding='utf-8')
   m=re.search(r'(?:Current Version\*\* \| `|^Version: )([0-9.]+)',text,re.M)
   assert m and m[1]==entry['version'],(p,m[1] if m else None,entry['version'])
for path,digest in json.loads((ROOT/'server/tmp/hero_docs_source_hashes.json').read_text(encoding='utf-8')).items():
 if Path(path).name=='skills.json':continue # C197 v1.1.1 intentionally fills the confirmed HP curve.
 assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,(path,'gameplay source changed')
print(f'PASS current hero docs: {checked} skill sections across both repos; every stat row/fingerprint, {links} relative links, asset paths, contract versions and unchanged runtime code hashes verified')
