from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C142_ADMIN_SKILL_TEST.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.1','Version: 1.0.2').replace('Status: IN_PROGRESS','Status: ACTIVE').replace('Updated: 2026-10-19','Updated: 2026-10-24').replace('equals `lkvu92@gmail.com`','equals either `lkvu92@gmail.com` or `lkvu921@gmail.com`');s=s.replace('| 1.0.1 |','| 1.0.2 | 2026-10-24 | Add lkvu921@gmail.com to database-verified access and stage-entry gates, including Test 2. |\n| 1.0.1 |',1);p.write_text(s,encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id'].startswith('C142'):c.update(version='1.0.2',status='ACTIVE',updated_at='2026-10-24')
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C142 v1.0.2: Test 2 account allowlist includes lkvu921@gmail.com.\n',encoding='utf-8')
for file in ['player_rpc.ts','resource_rpc.ts']:
 p=root/'server/nakama/data/modules'/file;s=p.read_text(encoding='utf-8').replace('LOWER(email)=LOWER($2)','LOWER(email) IN (LOWER($2),LOWER($3))')
 s=s.replace('[ctx.userId, "lkvu92@gmail.com"]','[ctx.userId, "lkvu92@gmail.com", "lkvu921@gmail.com"]').replace("[ctx.userId,'lkvu92@gmail.com']","[ctx.userId,'lkvu92@gmail.com','lkvu921@gmail.com']");p.write_text(s,encoding='utf-8')
p=root/'server/tests/test_admin_skill_test.cjs';s=p.read_text(encoding='utf-8').replace("assert.equal(args[1], 'lkvu92@gmail.com');","assert.deepEqual(args.slice(1), ['lkvu92@gmail.com','lkvu921@gmail.com']);\n    assert(sql.includes('LOWER($3)')); ").replace("return args[0] === 'admin-user-id' ? [{'?column?': 1}] : [];","const emails={'admin-user-id':'lkvu92@gmail.com','second-admin':'LKVU921@GMAIL.COM','other-user-id':'other@gmail.com','disabled-admin':'lkvu921@gmail.com'};\n    return args[0] !== 'disabled-admin' && args.slice(1).includes((emails[args[0]]||'').toLowerCase()) ? [{'?column?':1}] : [];")
s=s.replace("assert.equal(writes, 0);","assert.equal(JSON.parse(check({userId:'second-admin'}, {}, nk, '{}')).allowed,true);\nassert.equal(JSON.parse(check({userId:'disabled-admin'}, {}, nk, '{}')).allowed,false);\nassert.equal(JSON.parse(check({userId:'other-user-id'}, {}, nk, JSON.stringify({email:'lkvu921@gmail.com'}))).allowed,false);\nassert(resourceRuntime.includes(\"'lkvu921@gmail.com'\"));\nassert.equal(writes, 0);");p.write_text(s,encoding='utf-8')
