# C269 Stage Designer and server-generated encounter plans

Version: 1.1.0 | Status: ACTIVE | Updated: 2026-11-05

## Authority and lifecycle
Extends C259/C260, not a second publication track. Campaign documents live in enemy_catalog_state.metadata.campaign_stages, share the global draft revision, audit and immutable release snapshots. Runtime stage headers/waves are projected atomically with enemy/skill content. Draft stage edits do not affect gameplay except explicitly enabled develop live mode. Legacy stages are unchanged until explicitly saved through the designer. No local gameplay fallback.

## StageDocument
{id,arc_id,display_name,stage_rules,waves:[{id,display_name,element_rates?:Rates,entries:[Entry]}]}.
Rates has exactly metal,water,wood,fire,earth in percent, each >=0, <=100, precision 0.01; sum=100. stage_rules.enemy_visual_scale_multiplier and boss_visual_scale_multiplier are explicit 0.1..5 presentation multipliers. stage_rules.element_rates is mandatory for designer stages. stage_rules.spawn_pacing={batch_size:1..16,batch_growth_every:0..100,batch_max:1..16,batch_delay:seconds,jitter:seconds,max_alive:1..200,lane_count:2..16}; wave_transition={warning_sec,grace_sec,next_wave_delay}; progression={start_wave:1..100,every:1..100,level_step:0..100,max_bonus:0..10000}. stage_rules.stage_designer_version=1, enemy_framework_version=2.
Entry preserves C239 data with stable id, species_id, count, level, exp, interval,start_delay,boss,skills,optional loadout_template_id/skills_by_element,difficulty_overrides. Creeps use stage/wave rates (no authored fixed elements). Boss elements, when nonempty, override rates; otherwise boss rolls independently. Each individual has one primary element; existing explicit multi-element bosses are allowed only in Arc 6+. Fixed-element skill definitions never change element. Every possible positive-rate branch must have compatible equipped skills. Arc order comes from authoritative game_arcs, never a stage ID prefix. No automatic migration/rebalancing of existing campaign.

## Resolve and plan
Server resolves difficulty then adds progression bonus: wave_number>=start ? min(max_bonus,(1+floor((wave_number-start)/every))*level_step) : 0. Bounds are checked; no silent clipping. Largest-remainder allocation across ALL creeps of a wave uses integer basis points, tie order metal,water,wood,fire,earth; shuffle with dedicated seeded RNG. Bosses sample rates separately, excluding fixed bosses from creep allocation. Counts and explicit EXP are seed-independent. Total stage individuals <=10000, waves <=100, groups/wave <=100, document <=1 MiB.
EncounterPlan={version:1,stage_id,difficulty_id,content_version,seed,stage:resolved StageDocument,total_count,total_exp}. Entries retain one group with resolved_elements:string[][] (one array per individual). ID=(wave.id,entry.id,individual_index). No per-spawn RPC. Client recomputes stats/skills from validated content, never trusts serialized save stats.

## RPC
admin_campaign_overview {} -> {arcs:[{id,display_name,order}],stages:[{id,arc_id,display_name,managed}],draft_revision,active_release,enemies:[{id,display_name,kind}],loadout_templates:[{id,label}],visuals:Record<visual_set_id,{path,columns,rows,frame_count}>}.
admin_campaign_stage_get {id} -> {document,revision,draft_revision}; revision is document revision (0 before first designer save).
admin_campaign_stage_save {document,expected_revision,expected_draft_revision} -> same envelope. Full document transaction, audit, stage CAS and global CAS. C260 applies same projection within transaction.
admin_campaign_stage_resolve {document,difficulty_id,seed} -> EncounterPlan. Read-only, no run or resource debit. Default seed 269.
All return {success,data} or {success:false,code,message,errors?}; admin session and isConfigAdmin required. Existing C259 publish/validate/releases/rollback APIs are the SINGLE lifecycle. Stage save replaces that stage's legacy authoring entries atomically; enemy entry API must not edit designer-managed stages. No new public or HTTP-key admin access.
start_stage adds request_id for idempotency, enemy_catalog_version for snapshot admission and stage_plan_version:1 capability. Stale content (including C260 live draft identity changes without a global release) is rejected before debit with CONFIG_UPDATED; client returns to authenticated loading. Designer stages reject old clients before debit. Response includes encounter_plan, stored with the run. Same request_id/stage/difficulty returns same active run and plan without debit. get_stage_plan {run_id} returns stored active plan only to its owner, checks current content version and expiry; resume never trusts a plan from local save. New plans require matching catalog identity before storing run. Existing settlement freezes max_stage_base_exp; designer uses plan.total_exp.

## Engine and UI
One group queue per entry; individual compiled descriptors are not independent spawners. Dedicated seeded runtime RNG state is saved as decimal strings. Backlog prioritizes oldest ready wave, then fair group order. Interval gates the next group dispatch; a global batch can emit several individuals of one ready group. Jitter applies only to the global batch delay. No drops on capacity/timeout; final victory waits for all queues and actors. Config read happens before v2 return. New scheduler path is opt-in by designer version. Existing modes retain compatibility behavior.
Independent /dashboard/campaign feature, Arc/stage selector, wave groups, five percentages, fixed/random boss, bounded advanced pacing/transition/progression controls, template dropdown, animated schedule preview x1/x2/x3 (planned timing, not combat or capacity prediction). Forms RHF/Zod, abortable services, semantic theme tokens, four UI states, ConfirmDialog for save/publication. Unsaved selection prompts; errors show paths. Lifecycle panel reuses shared catalog endpoints via shared utility rather than duplicate service definitions.

## Validation
Server unit/property tests for rates, allocation, boss override, loadouts, progression and bounded payload; PostgreSQL transaction tests for save/CAS/publish/rollback/live projection; authenticated HTTP smoke on disposable fixtures. Godot runtime tests for grouped queues, descriptors, capacity and JSON resume. Web lint/typecheck/build and browser checks in light/dark. Never claim mobile performance or combat balance from headless tests.

## Changelog
|Version|Date|Change|
|---|---|---|
|1.0.0|2026-11-05|Stage documents and server encounter allocation, shared lifecycle, grouped client spawning and independent dashboard.|

## Serial batches - 1.1.0 (2026-11-05)

Optional `spawn_pacing.individual_delay` is 0.05..120 game seconds. Presence enables serial batches; absence preserves v1.0 simultaneous batches for existing published plans. Newly converted stages default to 0.4 seconds. Dashboard explicitly enables/disables serial spawning and edits this field. No automatic DB migration or gameplay fallback.

One global scheduler reserves at most batch_size eligible actors (oldest ready wave, then fair queue order). Dispatch at most one actor per physics tick, with individual_delay after each successful non-final dispatch. Start batch_delay plus seeded jitter only after the last reserved actor actually spawns. Group interval is measured from its last actual dispatch. Capacity/failure defers the pending actor without consuming it or accumulating catch-up credit. New groups cannot enter a pending batch. Timeout wave transitions preserve pending batch and cooldown; JSON resume saves stable wave/entry reservations and cooldown, never queue object references. All delays use game seconds; wall-clock seconds equal game seconds divided by battle speed.

The preview uses the same reservation/order/timing rules with zero jitter (earliest schedule), without combat/capacity or cross-wave overlap prediction. UI describes group eligibility versus individual spacing, post-final cooldown, batch growth and x1/x2/x3 wall time. Existing RPC envelopes and publication lifecycle are unchanged.

|Version|Date|Change|
|---|---|---|
|1.1.0|2026-11-05|Opt-in serial batches, cooldown after final actual spawn, persistent reservations, pacing UI and scheduler preview.|
