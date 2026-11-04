# C259 Enemy catalog authoring and admin RPC

Version: 1.2.0 | Status: ACTIVE | Updated: 2026-11-04

## Authority and scope

Supersedes JSON-first authoring for migrated enemy definitions, visuals, skills
and stage entries. Gameplay math/C240, rewards and existing IDs are preserved.
Enemy species have base_attributes/growth_per_level, no assigned elements or
skills. Stage entries select enemy, level, elements and equipped skill levels.
Bosses using C239 element_boss retain independent per-species element_baselines,
copied from the current baseline on import; editing these changes that species
only. Linear species retain base+(level-1)*growth. Hero authoring is out of scope.

## Tables

Five editable tables use id TEXT PK, data JSONB, active BOOLEAN, revision BIGINT,
created_at/updated_at UTC: enemy_catalog, enemy_visual_sets,
enemy_visual_assets, enemy_skill_catalog, enemy_stage_entries.

- catalog data: display_name, kind creep|boss, visual_set_id, base_attributes,
  growth_per_level, reward, optional role/presentation_variants/balance_profile
  and element_baselines. No element/skills fields.
- visual set data: display_name and presentation-only definition properties.
  Its ID is the existing visual_definition_id; presentation_variants reference
  other sets. Combat values remain exclusively in catalog/skill/entry data.
- visual asset data: visual_set_id, slot avatar|idle|run|attack|hit|die,
  source_id (registered AtlasRegistry source), optional fps. No arbitrary paths.
- skill data: existing C239 skill definition, fixed element, levels and executor.
- stage entry data: stage_id, wave_index, entry_index, enemy_id and C239 entry
  fields including explicit nonnegative integer exp. Runtime projection uses
  species_id, preserving IDs and wave metadata.

Support tables enemy_catalog_state (singleton draft revision, active release,
  import metadata and approved asset sources), enemy_catalog_releases (immutable
  version/snapshot/audit metadata), enemy_catalog_audit (append-only mutations).
Enemy revisions/versions are decimal strings in APIs; global config_version retains its existing numeric contract. Edits serialize on state,
use optimistic revision checks and audit in the same database transaction.
Referenced/in-use records cannot be deleted or disabled. Draft deletions never
alter previous immutable releases. Release/audit/state are read-only through
list/get/status RPCs; publish/rollback/import are their only supported mutations.

## RPC

All RPCs begin admin_, require isConfigAdmin(ctx) server-side, and reject missing
sessions. No client-supplied actor identity. Per editable table prefix:
admin_enemy_{catalog|visual_set|visual_asset|skill|stage_entry}_{list|get|save|delete}.

- list {limit:1..100,cursor?:id,search?:text,active?:boolean} ->
  {success:true,data:{rows:[{id,data,active,revision}],next_cursor,draft_revision}}
- get {id} -> {success:true,data:row}
- save {id,data,active,expected_revision:"0" for create or current row revision}
  -> {success:true,data:row,draft_revision}. IDs immutable; replacement payload.
- delete {id,expected_revision} -> {success:true,data:null,draft_revision}.
- admin_enemy_catalog_status {} -> draft revision, active release, counts,
  approved asset sources, migration status.
- admin_enemy_catalog_preview {enemy_id,level,elements} -> derived stats and
  referenced stages, no mutations.
- admin_enemy_catalog_validate {} -> errors/warnings plus counts.
- admin_enemy_catalog_migrate {dry_run:true|false,expected_revision,asset_sources}
  -> migration report. Reads current DB, not seed JSON. Apply only to an empty
  editor, no overwriting admin edits. Import preserves framework extra metadata,
  native bindings, templates, stage/wave headers and legacy projections.
- admin_enemy_catalog_publish {expected_revision,note} -> immutable version.
- admin_enemy_catalog_rollback {version,expected_revision,note} -> new immutable
  version pointing to the selected snapshot. Draft is unchanged; republish is
  explicit. All atomic and audited; concurrent editor/publish conflicts -> 409.
- admin_enemy_release_{list|get}, admin_enemy_audit_{list|get}: read-only records.

Errors {success:false,code:400|403|404|409|422|500,message,errors?}; do not leak SQL.
Server limits body size, field lengths, IDs, numeric ranges, references and levels.
Stage validation covers every difficulty/loadout branch, fixed skill element
compatibility, single-element Arcs 1-5, valid schedules and no legacy multipliers.
Difficulty overrides accept level and equipped loadout fields only; spawn counts,
timing and EXP remain common to the wave entry.
Mutations must not be callable through public HTTP-key auth or normal players.

## Publication/runtime and migration

Catalog publications are complete immutable enemy snapshots. The active enemy
version accompanies config bootstrap/admission; existing config RPC all/enemies/
progression/stages reads the published projection from runtime tables. Draft
writes do not affect gameplay. Publish atomically materializes framework,
presentation projections and managed wave entries into existing runtime tables,
creates an immutable enemy release and advances the global config release.
Once migrated, generic seed operations cannot replace catalog-managed enemies,
framework or waves. Other gameplay/config modules remain independently managed.

Client builds compile from a captured snapshot for the current match. New entry
uses newest published enemy snapshot; saved runs carry the enemy catalog version
and may only resume under that version (otherwise return a clear retry/new-run
error, never mix changed stats). Server-issued runs freeze the stage base EXP ceiling for settlement, so later enemy publications cannot change that ceiling. New stage requests with stale global config_version are rejected before charging stamina. No extra per-spawn requests and no local gameplay
JSON fallback. Version switches participate in the existing config compatibility
mechanism. Visual source IDs must be supported by the current client manifest;
new image files require a client build, not a DB-only change.

Migration: inventory -> dry-run -> backup -> transactional import -> projection
parity -> local publish -> authenticated readback -> client compile/spawn/resume/
pooling regression. No automatic production deployment or player/finance writes.
Legacy non-v2 stages/modes remain explicitly identified compatibility consumers;
their skill/presentation projections remain available, not silently converted to
different level math. All current v2 campaign stages are imported exactly.

## Admin UI

Dedicated enemies dashboard with searchable paginated tabs, create/edit/delete,
stats/growth forms, level preview and references, visual set/asset editor,
skill levels and stage entry editor, dry-run migration, validation, release
history, publish/rollback and audit. RHF/Zod schemas match contract; ConfirmDialog
for mutations, abortable requests, server-side admin session + CSRF proxy.

### 1.1 workspace and redundant elemental visuals

The primary UI is a Boss/Creep master-detail workspace. The selected species
owns the stats preview, animation preview, visual set editor and stage references.
Shared skills and stage entries remain separate workspaces; release/audit/import
are secondary operator panels. Elements and equipped skills belong to entries,
never to the species. Existing executor payloads remain available in advanced forms.
`/dashboard/enemies?category=boss|creep` selects the initial species group.
Characters routes its Boss/Creep navigation here instead of exposing stale
element-suffixed JSON records. Hero navigation is unchanged.

Entity list accepts optional kind creep|boss (catalog only), enemy_id/stage_id
(stage_entry only), visual_set_id (visual_asset only), and active filters.
Filters apply before cursor pagination; changing filters resets the cursor.

`admin_enemy_catalog_normalize {dry_run:boolean,expected_revision}` reports
`{changes:[{entity,id,operation}],draft_revision,applied:boolean}`. It coalesces
element-suffixed visual sets only when all presentation properties and six asset
slots are identical, into a neutral ID. Species/presentation references are
remapped atomically with audit and optimistic revision checks. Nonidentical
variants remain separate. Normalization never archives/deletes a species merely
because no stage currently uses it or its name/visual matches another species.
The obsolete original eight-species pilot fixture (including tiger_king) is
removed by an explicit audited retirement manifest after checking all
active/inactive entry and runtime wave references; these are not level/element
variants. Unused authoring records outside that manifest are unaffected.
No skill elements,
stats, rewards, spawn schedules or published runtime change until publication.
Legacy runtime enemy IDs remain compatibility projections for non-v2 consumers.
New neutral presentation IDs receive empty legacy native-binding records; actual
v2 skills still come exclusively from stage loadouts. The C237 Arc 7 legacy gate
applies only when legacy Arc 7 stages exist, after normal v2 admission validation.
Publication removes managed runtime projection rows absent from the target
snapshot so rollback does not leave incompatible orphan definitions.

Explicit Chu Tuoc legacy alias retirement removes the five obsolete elemental
enemy projections and their legacy binding keys only after proving no active or
inactive species/entry, visual asset or runtime wave references them. The neutral
visual and the canonical species remain; fixed-element skill definitions and
stage-selected elements/levels/loadouts are unchanged. Metadata retirement is
atomic, audited and revision-checked; runtime removal requires publication.

## Changelog

1.1.4 seed readback: an enemy seed acknowledged with success/table=enemies,
inserted=0 and preserved_catalog=true means the published DB catalog was
preserved intentionally. The CLI accepts this explicit result for enemies only,
reports preservation instead of claiming rows were seeded, and continues to
explicit publication. Other tables and unmarked count mismatches still fail.
New runtimes include enemy_catalog_version as a positive decimal string;
older C259 runtimes with the explicit preservation flag remain supported.
Failed seed/readback validation never triggers publication or partial retry.

1.1.3 UI correction: changing selected species remounts its detail panel and
invalidates pending sprite/image/frame callbacks. Only the current source may
paint a preview. Stats are read-only on the page and edited in a dedicated
bounded dialog through the existing catalog save RPC, with revision checks and
confirmation. Boss element baselines use a labeled matrix with visible numeric
values; full DB base/growth values remain visible, with the five overridden boss
rows marked read-only rather than hidden or shown as effective gameplay inputs.
Missing optional growth is labeled default zero and never replaces a configured
coefficient. HP/ATK/DEF use per-stat maximum
of selected element baselines multiplied by level; attack/move speeds use the
maximum baseline without level scaling. Other attributes retain linear growth.
No runtime formula or persisted balance data changes.

| Version | Date | Change |
|---|---|---|
| 1.1.4 | 2026-11-04 | Align standalone/bundle seed CLI readback with explicit published-catalog preservation. |
| 1.1.3 | 2026-11-04 | Isolated preview lifecycle, dedicated stat dialog and readable validated boss baseline matrix. |
| 1.1.2 | 2026-11-04 | Retire unreferenced Chu Tuoc elemental runtime aliases and their obsolete bindings. |
| 1.1.1 | 2026-11-04 | Remove automatic pilot archival heuristic; explicitly retire the unreferenced obsolete pilot from authoring. |
| 1.1.0 | 2026-11-04 | Species-centered workspace, contextual editors and atomic redundant visual normalization. |
| 1.0.0 | 2026-11-04 | DB-first enemy authoring, per-table admin RPC, immutable publication, migration and admin UI. |

## Local live authoring (C260)

Only `APP_ENVIRONMENT=develop` plus `CONFIG_DRAFT_LIVE_ENABLED=true` enables
live materialization. After schema/reference validation, admin save/delete,
normalization and initial import atomically apply the projected runtime tables
with the authoring mutation. CAS conflicts or projection errors roll back both.
No enemy/config release is inserted. Missing flags and production retain draft
isolation, including when a production flag is forged or misconfigured.

Runtime `catalog_version`/`enemy_catalog_version` becomes `draft:<revision>`;
active_release continues to identify the last explicit checkpoint. Bootstrap
cross-read and resume identity guards use the runtime identity. Publishing or
rolling back explicitly still creates a release and restores release identity.
Clients reload runtime data through the existing authenticated loading flow.
An already loaded match keeps its compiled snapshot.

| 1.2.0 | 2026-11-04 | Validated atomic local live drafts without releases; strict production isolation and explicit checkpoints. |
