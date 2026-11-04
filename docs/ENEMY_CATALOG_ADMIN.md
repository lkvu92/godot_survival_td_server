# Enemy catalog administration — C259

The editor is `/dashboard/enemies` in `web_client`. Database drafts replace manual
gameplay JSON authoring for migrated enemies. Hero authoring remains separate.
See [C259](contracts/C259_ENEMY_CATALOG_ADMIN.md) for the RPC contract.

## Species workspace (1.1)

Boss/Creep tabs use a searchable avatar list on the left and the selected
species on the right. Overview contains the shared animation player with action,
play/pause, zoom and background controls, plus server-derived level preview.
Stats are read-only on the page; the Edit stats button opens a bounded dialog
with a full-width five-element baseline matrix and separate linear-growth rows.
Visuals group set properties and all six animation
slots; usage shows referenced stage entries and opens a fully paginated filtered
stage workspace. Shared skills and unused visual sets have their own libraries.
Changing selection with unsaved edits asks whether to discard them. Publication,
rollback, audit, migration and normalization are under the Operations panel.
Characters' Boss/Creep buttons navigate to this DB workspace, including a category
query parameter; stale JSON elemental variants are no longer the management list.

Identical element-suffixed visual sets can be normalized via Operations. Dry-run
shows exact changes; apply uses a single audited, revision-checked transaction.
All presentation properties and all six asset slots must match; different
variants are retained. Bạch Hổ and Chu Tước now have neutral presentation IDs;
their element and actual skills are selected by stage. Visual normalization does
not archive or delete unused species. The original eight-species C239 pilot
fixture (including `tiger_king`) is obsolete; an explicit retirement migration
removes those records after checking all active/inactive entry and runtime wave
references. Their canonical campaign species retain every stat and growth value.
New species being prepared for future stages remain legitimate unused records.

Explicit legacy-pilot retirement, separate from visual normalization:

```powershell
node server/tools/remove_c259_pilot_local.cjs
node server/tools/remove_c259_pilot_local.cjs --apply --expected-revision=<current>
```

The script uses a fixed manifest of historical pilot IDs and verifies their
canonical species, references and projected runtime parity. It never discovers
deletion candidates by name, same sprite, level, element or lack of stage usage.
It backs up the draft and deletes the manifest records atomically with CAS/audit.
Validate and publish explicitly afterwards. Immutable release history is not an
extra authoring species and is retained only by the existing release lifecycle.

Chu Tuoc's five old elemental runtime aliases can be retired separately once
no legacy stage needs them:

```powershell
node server/tools/retire_c259_chu_tuoc_local.cjs
node server/tools/retire_c259_chu_tuoc_local.cjs --apply --expected-revision=<current>
```

This explicitly removes only those five keys from legacy enemy projections and
legacy skill bindings. It checks active/inactive species/entries, visual sets,
asset references and runtime waves, verifies projected parity, then updates
metadata and audit under a state lock/CAS with a backup. Publish to remove the
obsolete runtime rows. The neutral Chu Tuoc visual/species, all skill definitions
and stage-chosen elements/levels/loadouts remain unchanged. A rerun is a no-op.

## Stat display and preview correction (1.1.3)

Bosses with `balance_profile=element_boss` use HP/ATK/DEF baseline × level.
Attack/movement speed use the baseline unchanged. Multiple selected elements
take a separate maximum for each stat. Example: fire HP baseline 2,880 yields
28,800 HP at level 10, before skill/buff effects. Remaining attributes and linear
species use base + (level - 1) × growth. The page shows effective inputs rather
than legacy base/growth values that this boss profile overrides.

Baseline data were present in DB; the previous recursive multi-column editor
made number inputs too narrow to show their text. The dedicated dialog renders
25 labeled numeric inputs in a readable matrix with horizontal overflow on small
screens, fixed header/footer, close/Escape/discard handling and save confirmation.
Baseline schema validation matches server bounds and rejects missing/blank/NaN
values. Updates continue through the existing full-row/revision save RPC.

Species selection remounts the full detail pane. Source-keyed canvases clear old
pixels while loading; disposed image and frame callbacks cannot paint/reschedule
after selection changes. Level preview also matches the exact current query key.
No persisted baseline values or gameplay formulas are changed by this UI patch.

The dialog retains the complete base/growth source table, including boss rows
overridden by baselines. Those rows show their real DB coefficients read-only
with an explicit marker; they are not dropped or replaced with zero. Optional
unconfigured growth is labeled as default zero. Hero presentation remains based
on `level_up_stats` and stat-specific multiplicative/additive rules (C238), not
the enemy additive-growth formula.

## Generic seed after migration (1.1.4)

`deploylocal.ps1 seed --publish` preserves the published C259 enemy catalog.
The explicit result `inserted=0,preserved_catalog=true` is intentional; the CLI
reports preservation rather than requiring the old enemies.json row count.
It accepts this marker only for enemies, requires zero writes, and validates
enemy_catalog_version when provided. Unmarked count mismatches and malformed
acks still stop publication. The earlier C259 flag-only runtime response remains
supported so upgrading the Python CLI does not require a simultaneous runtime restart.

Generic global config publication retains the active enemy catalog version in
bootstrap metadata. It does not publish enemy drafts or reintroduce retired
pilot/elemental aliases. The runtime already commits the complete seed bundle
atomically before Python readback; the former readback error did not imply a
partial bundle commit. No partial-seed retry fallback is added.

CLI alternative, with backup before apply:

```powershell
node server/tools/enemy_catalog_db.cjs --normalize
node server/tools/enemy_catalog_db.cjs --normalize --apply --expected-revision=<current>
```

Apply edits only the draft. Validate the normalized client snapshot before
publishing. New presentation IDs have empty compatibility skill bindings, so
no fixed elemental skills are introduced. Rollback removes managed projection
rows absent from the selected snapshot while preserving legacy compatibility IDs.

## Data model

| Table | Meaning | Admin RPC prefix |
|---|---|---|
| enemy_catalog | Species name, stats, growth, rewards and visual-set reference | admin_enemy_catalog |
| enemy_visual_sets | Reusable presentation variants | admin_enemy_visual_set |
| enemy_visual_assets | Six avatar/animation slots, registered source ID, optional FPS | admin_enemy_visual_asset |
| enemy_skill_catalog | Shared fixed-element skill definitions and levels | admin_enemy_skill |
| enemy_stage_entries | Stage/wave position, species, level, elements, equipped skills and timing | admin_enemy_stage_entry |

Each prefix provides `_list`, `_get`, `_save`, `_delete`. Records have immutable
string IDs, validated JSONB data, active status, row revision and timestamps.
JSONB preserves existing skill executor payloads; relationships are separated
into the five entities and checked by the server across the complete draft.
Mutations serialize through the state row, so concurrent operations cannot
invalidate previously checked references. Direct SQL edits bypass these checks
and are unsupported. Support state, releases and audit tables have dedicated
status/list/get APIs; only import/publish/rollback can mutate their lifecycle.

Species do not own elements or equipped skill lists. A stage entry chooses
enemy_id + level + elements/random pool + skill IDs/levels/slots. Arcs 1–5
remain single-element. Difficulty overrides and every possible elemental
loadout are validated. Existing `element_boss` species retain their formula:
HP/ATK/DEF = per-species element baseline × level; speed is the baseline speed.
For these bosses, edit `element_baselines` to tune effective stats. Linear
species use `base + (level - 1) × growth`. Import copies old global boss baselines
into each boss, preserving all previous values while making later edits independent.

## Editing and publishing

1. Open the relevant tab, search by ID/name and edit the structured fields.
   Sources are selected from the approved client manifest; preview uses local
   installed spritesheets. New files still require shipping a client build.
2. Save the draft using the displayed row revision. Creating uses revision `"0"`.
   A 409 means another admin changed the record: reload before retrying.
3. Check level preview and referenced stages; run catalog validation.
4. Enter a release note and publish using the current **draft** revision.
   This atomically materializes runtime framework, enemy presentation and managed
   waves, records the immutable release and advances global config_version.
5. Release history supports rollback: select an old version and enter a note.
   Rollback creates a new release, restores its runtime snapshot and keeps the
   draft unchanged. Publishing that draft again deliberately reapplies it.

Deleting/disabling referenced records is rejected. Inactive complete records
can be prepared before linking them. A visual set used by a species requires
all six slots; create the set/assets before linking the species. Stage waves
must retain at least one entry. New stages/wave headers are authored through
the existing stage workflow; this editor manages entries in registered waves.

Every RPC checks the authenticated configured admin user. HTTP-key/anonymous
and ordinary player callers are rejected. The web proxy adds the existing
admin session and enforces same origin. Audit actor IDs come from the session.
No player, inventory or financial records are edited by this migration.

Example save (replacement payload, not a partial patch):

```json
{"id":"species_id","data":{"display_name":"Enemy","kind":"creep","visual_set_id":"visual_id","base_attributes":{"hp":100,"atk":10,"def":1,"move_speed":60,"attack_speed":1,"attack_range":100},"growth_per_level":{"hp":10,"atk":1,"def":0,"move_speed":0,"attack_speed":0,"attack_range":0},"reward":{"exp":1,"gold":0}},"active":true,"expected_revision":"0"}
```

Publish: `admin_enemy_catalog_publish {"expected_revision":"2","note":"Balance adjustment"}`.
Rollback: `admin_enemy_catalog_rollback {"version":"1","expected_revision":"3","note":"Restore baseline"}`.
History pagination uses `{limit:20,cursor?:last_id}`; entity pagination uses ID
cursors, never fabricated page counts. All enemy IDs/revisions/versions remain strings.

## First migration and deployment

Deploy the updated runtime and compatible client/admin code together. Ship the
client before publishing changed boss baselines/assets; use existing application
minimum-version settings to retire old builds that do not understand C259.
Do not copy the local Nakama database to VPS: import the target's current data.

From the workspace, export client-supported presentation sources:

```powershell
& $Godot --headless --path client --script res://tools/export_enemy_asset_sources.gd -- res://temp/enemy-asset-sources.json
node server/tools/enemy_catalog_db.cjs --asset-sources=client/temp/enemy-asset-sources.json
node server/tools/enemy_catalog_db.cjs --asset-sources=client/temp/enemy-asset-sources.json --apply --expected-revision=0
node server/tools/enemy_catalog_db.cjs --publish --expected-revision=1 --note="Initial baseline"
```

The CLI targets the local Docker PostgreSQL container by default. An operator
must explicitly set the target container/database to use a different environment.
It reads the current DB, validates references, refuses nonempty import, requires
revision checks and writes backups/reports under `server/temp/enemy-catalog`.
Publish backup includes runtime tables and the previous global config release.
Back up the target DB using normal operational procedures before first rollout.
Alternatively upload the exported manifest in the admin migration panel, dry-run,
apply, validate and publish. Import itself does not change gameplay.

Generic seed preserves published catalog enemies/framework/managed v2 stages.
Other seed modules remain independent. Explicit SQL migration tools must honor
C259 separately. Do not run old C239 installers over a managed catalog.
Legacy `stage_0_1` and `stage_0_admin_test` remain compatibility consumers locally.

New matches use published data; current compiled matches retain their stats.
Saved runs carry enemy_catalog_version and cannot resume with a different
version. The server freezes the base EXP ceiling in new run records. Bootstrap
detects publication during reads and requests retry rather than installing a
mixed catalog. No per-spawn RPC and no client gameplay JSON fallback is added.

## Validation

```powershell
cd server/nakama
npm run build
cd ..
node tests/test_enemy_catalog_admin.cjs
node tests/test_enemy_catalog_version_gate.cjs
node tests/test_enemy_framework.cjs
node tests/test_run_lifecycle.cjs
node tools/verify_c239_arc1_local_rpc.cjs
node tools/verify_enemy_catalog_local_rpc.cjs
```

The PostgreSQL test requires local Docker and the exported asset manifest. It
creates/drops only its own `c259_test_<pid>` database, tests all five CRUD APIs,
authorization, stale revisions, reference rejection, draft isolation, publication,
immutable snapshots, rollback and late-failure transaction rollback. It also
asserts exact framework and managed wave parity before import.

After authenticated readback, run client scene `res://tests/TestEnemyCatalog.tscn`:
it validates asset admission, compiles all 70 campaign stages at three difficulties,
checks independent boss tuning and changed-version resume rejection.
The normal C239 harness still covers spawn/cast/resume/pooling behavior.

## Local live development

Local Compose defaults `CONFIG_DRAFT_LIVE_ENABLED=true`; regenerate the private
runtime config and restart local Nakama after changing this flag. It is honored
only with `APP_ENVIRONMENT=develop`. Saving validated drafts applies the game DB
projection immediately, atomically, without adding release history. Reload the
game data through authenticated loading to consume the new runtime snapshot.
Use Ph?t h?nh only to create a checkpoint. Production retains draft isolation.
Set `CONFIG_DRAFT_LIVE_ENABLED=false` locally to restore draft isolation.
