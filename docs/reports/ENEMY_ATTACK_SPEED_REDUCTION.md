# Enemy attack speed — 03/11/2026

Requested balance: all creep and boss attack speed reduced by 30%, new rate = previous rate × 0.7. This scales attack frequency, not damage per hit. Attack interval becomes 1/0.7 of the previous interval. Skill cooldowns and movement speed are not changed.

Updated authored role and elemental boss baselines, 99 legacy enemy definitions, the framework seed generator and seven reproducible arc migration catalogs; regenerated progression.enemy_framework. The runtime continues to use one effective stat source, with no additional runtime multiplier. Boss elemental baselines override species speed as before.

Before/after validation: 99 legacy definitions; 50 species × 5 elements × 5 levels = 1,250 effective-speed comparisons. Strip attack_speed fields and compare whole framework, legacy definitions and migration catalogs to confirm all other data unchanged. Machine-readable evidence: [ENEMY_ATTACK_SPEED_REDUCTION.json](ENEMY_ATTACK_SPEED_REDUCTION.json).

Examples: damage creep 0.725→0.5075, ranger 1.5→1.05, wood boss 2.34→1.638 attacks per second. Local installer updates enemy attributes and framework metadata with backup, concurrent-edit checks, post-readback equality and a new catalog version. Latest local release: 88. Existing spawned enemies need a new gameplay session to receive new definitions. Production not deployed.

Additional validation: client TestEnemyFramework 1,191 checks PASS; Arc 7 legacy generator updated and materialization/idempotence test PASS; running the local installer again returns ALREADY_INSTALLED.
