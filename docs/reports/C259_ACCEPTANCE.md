# C259 local acceptance — 2026-11-04

## 1.1.4 seed readback and source-growth correction

The reported `Bundle readback mismatch: enemies` was a CLI protocol mismatch:
the server intentionally preserved C259 with inserted=0, while Python expected
the legacy JSON row count. Standalone/bundle readback now accepts only explicit
enemy preservation and still rejects malformed acks or any other table mismatch.
Global publication carries the active enemy version into bootstrap metadata.

Re-ran the user's exact local command `./server/deploylocal.ps1 seed --publish`:
PASS, config release **107**, enemy release **7**, draft revision **415** unchanged.
Canonical comparisons of the entire authoring state, enemy projections/framework,
all managed v2 stage headers and wave rows are identical before/after. No retired
species or elemental alias was reintroduced. 24 seed CLI tests PASS, including
flag-only older C259 compatibility, explicit publication after preservation,
malformed-count rejection and publication suppression on readback failure.

The stat dialog now shows all raw base/growth rows with actual saved values,
including overridden boss values marked read-only, rather than hiding them.
Hero growth notation is chosen by stat semantics, correcting additive crit/regen
being labeled as multiplication. All five Hero growth objects match DB/seed.
Ten UI tests PASS, including rendered saved growth inputs and Hero notation;
typecheck/scoped lint/build pass. No growth coefficients or formulas were changed.

## 1.1.3 preview and stat-dialog UI correction

Reported screenshot showed stale dragon preview under a different selected boss
and an excessively nested stat form with visually empty baseline inputs. DB
readback confirmed all 25 boss baseline values were present and distinct sprite
sources for Infernal Dragon and Bach Ho were correct.

The selected detail pane and active panel now have isolated mount identities;
image/frame callbacks are disposed and guarded, canvas source identity controls
painting, and handlers are installed before src for cached images. The on-page
editor is replaced by a dedicated stat dialog with a numeric element matrix,
readable linear rows, fixed header/footer and save/discard controls. Read-only
preview hides inactive legacy base/growth for the five overridden boss stats.

Initial eight Node regression tests PASS: delayed old-image/error delivery, immediate
cached-image completion, canceled queued animation callbacks, death-frame stop,
all 25 saved matrix values and field paths, effective boss inputs/multiple
elements, invalid baseline rejection and nonmutating form defaults. TypeScript,
scoped ESLint and Next production build PASS. Browser/native host remains
unavailable, so direct interactive Dark/Light visual verification is pending.
This patch performs no DB mutation and no gameplay formula changes. Local data
remain enemy release 7/config 106/draft 415.

## 1.1.2 Chu Tuoc runtime aliases

Current local runtime: enemy release **7**, config **106**, draft revision **415**.
The five obsolete arc7_chu_tuoc_nu_vuong_{metal,water,wood,fire,earth} runtime
definitions and legacy binding keys have been retired explicitly. Every
active/inactive species/entry/asset and runtime wave reference was checked first:
zero references. Metadata retirement is locked, CAS-checked, backed up and audited.
Snapshot comparison permits only those five projection/binding removals; the
42 canonical species, 9,766 stage entries and 149 skills are unchanged.

Authenticated readback PASS; database contains exactly one Chu Tuoc runtime
definition, arc7_chu_tuoc_nu_vuong, with no fixed element. Its stage still selects
level/elements/equipped skills. Audit before/after metadata verified and cleanup
rerun is a no-op. Prior sections below record historical local releases.
Post-retirement validation: 75 PostgreSQL integration checks, 223 client checks
across all 70 campaign stages/three difficulties, static checks, version gate
and lifecycle regressions all PASS.

## 1.1.1 species identity correction

1.1.1 local runtime: enemy release **6**, config **105**, draft revision **413**.
Authoring now has **42 species, all active**, and no archived original pilot
copies. The eight retired IDs are stone_ape, blood_lion, armored_rhino, venom_croc,
thunder_bear, shadow_leopard, bone_beast and tiger_king. All had zero active/inactive
entry references and zero runtime wave references; canonical campaign identities
exist and remain unchanged. The complete runtime projections compare equal after
excluding only the obsolete species definitions. No stage loadout/schedule,
canonical stat/growth/reward, asset or skill definition was changed.

The previous tiger_king auto-archive heuristic was a migration mistake and has
been removed from visual normalization. Generic normalization does not decide
species lifecycle, even for an unused same-name/same-visual species. Retirement
is a separate explicit manifest with backup, CAS, atomic deletion and audit.
The normalized graph remains compatible; prior acceptance below is historical.
Post-correction verification: 75 PostgreSQL integration checks PASS, including
retaining an unused species during visual normalization; 223 client checks PASS
over all 70 stages and all difficulties. Static checks, runtime packaging,
version gate, lifecycle and authenticated readback PASS. Cleanup rerun is a no-op;
authoring contains 42 rows, zero inactive pilot copies and unchanged 9,766 entries.

## 1.1 workspace and neutral visual normalization

1.1 baseline local runtime: enemy release **5**, config **104**, draft revision **404**.
49 active species plus the archived unused tiger_king pilot; 63 visual sets and
378 slots replace 99 sets/594 slots. All 9,766 entries and 1,385 waves remain.
Bạch Hổ/Chu Tước each have one active species and a neutral visual-set ID.
Normalization changes 398 draft records atomically, with backup and per-row audit.
Species stats/growth/rewards and entry schedules/elements/loadouts were compared
before/after and are unchanged. A second normalization produces zero changes.

The master-detail UI reuses Characters' animation player, provides inline stats,
server level preview, grouped visual slots, contextual stage references, shared
skill library, cursor filters and guarded unsaved navigation. Characters routes
Boss/Creep navigation to the DB workspace; hero navigation remains unchanged.

Evidence: 74 PostgreSQL checks PASS, including filtered pagination, normalization
dry-run/CAS/atomic rollback/idempotence, nonidentical variant retention, neutral
compatibility bindings and rollback orphan cleanup. Candidate snapshot preflight
passed before final publication. Published client snapshot: 223 checks PASS across
70 stages × 3 difficulties, neutral animation resolution and legacy Arc 7 gate
regressions. C239 1,191 checks PASS; C237 backend, version gate, lifecycle and client
static checks PASS. Web typecheck/feature ESLint and Next/OpenNext build PASS;
Cloudflare local preview starts on 8787. Interactive browser host remains unavailable.
Preview requests to both category URLs return the expected unauthenticated 307
login redirect. Generated Wrangler output is excluded from source lint. Full
repository lint currently has 6 errors/5 warnings in unrelated server administration
and pack files; scoped lint for every file changed by this workspace passes.

Compatibility regression found during preflight: legacy native bindings and the
old exact-45 Arc 7 gate rejected neutral presentation IDs; the active baseline was
restored during correction. New neutral IDs now receive empty bindings and the
legacy gate is scoped to legacy stages. Managed orphan projections are removed
on rollback. Older client builds require updating with these admission changes.

The following section records the original 1.0 baseline acceptance.

## 1.0 baseline

Implemented five DB authoring entities, 20 entity CRUD RPCs, six lifecycle/preview
RPCs, four release/audit read RPCs, authenticated web admin and client consumption.
Migration is local only; no VPS deployment was performed.

Local baseline: 50 species, 99 visual sets, 594 asset slots, 149 shared skills,
9,766 stage entries, 1,385 waves across 70 v2 campaign stages. Two legacy stages
remain explicit compatibility consumers. Imported draft revision 1; published
enemy version 1 / global config version 100 / draft revision 2. Backup files and
migration reports are in ignored `server/temp/enemy-catalog`.

Evidence:

- Runtime build and packaging checks PASS.
- PostgreSQL disposable-database integration: 61 checks PASS, including all five
  create/get/list/update/delete paths, actual admin authorization helper,
  reference rejection, CAS conflicts, immutable releases, rollback and an induced
  late publication failure that leaves runtime/state/releases unchanged.
- Migration compares every framework parameter and exact entries of all 1,385
  managed waves against the current DB; no balance, EXP, timing or difficulty changes.
- Authenticated local Nakama readback PASS after restarting only local Nakama.
  Readback covers all 70 campaign stages, six presentation slots per visual and
  a genuine normal-player session being denied the new admin RPC. Version-gate
  tests separately verify missing/stale requests never reach run/resource mutation.
- C259 Godot scene: 218 checks PASS; all 70 stages compile at normal/epic/legend,
  unknown asset sources reject admission, boss-specific baseline changes are
  independent, changed enemy versions block resume.
- C239 Godot regression: 1,191 checks PASS. Backend C239 and run lifecycle PASS.
- Client static checks and headless editor parser PASS.
- Web TypeScript, feature ESLint and production build PASS. Full repository ESLint
  currently reports three pre-existing prefer-const findings in the servers API.
  Zod response/editor schemas also pass against current PostgreSQL RPC payloads
  for status, validation and all five entity lists.

Limitations: browser/native automation host was unavailable, so interactive
Dark/Light, responsive layout and animated asset previews were not visually
verified in this session. No Android performance or combat rebalance claim.
Existing application version controls must exclude older client builds before
publishing C259-specific boss baseline or presentation changes.

Technical acceptance: 8/10 based on migration parity, transaction/security tests,
runtime client validation and build checks; interactive visual QA remains open.

## C260 local live authoring ? 2026-11-04

- Runtime build/package verification PASS.
- `test_enemy_catalog_live.cjs`: disposable PostgreSQL fixture PASS; live save
  updates framework stats without enemy/config release creation; stale CAS,
  invalid references, forced late projection failure, production isolation and
  explicit checkpoint identity verified.
- `test_runtime_secrets.py`: 10 tests PASS, including develop/production/missing
  flag matrix. `test_enemy_catalog_version_gate.cjs` and operator publication PASS.
- Full server static suite is blocked by `ReferenceError: talismanItemQuantity
  is not defined` in the gift-code test harness (outside this change).
- Local runtime regenerated/restarted; healthcheck PASS; SQL helper installed.
  Enemy/config release counts remain 7/107 before and after restart.
- Production was not deployed. Existing loaded matches retain their snapshot;
  reload authenticated game data to consume subsequent local saves.

C259 PostgreSQL regression PASS: 75 checks, 9766 stage entries / 1385 waves;
explicit publication/rollback, normalization and failure atomicity preserved.
