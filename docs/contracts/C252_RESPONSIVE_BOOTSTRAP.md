# C252 — Responsive catalog bootstrap

Version 1.1.0 · ACTIVE (desktop scoped) · 2026-11-03.

55% LoadingScreen maps to ConfigService.load_all_config: network response, JSON parsing, full DataRegistry validation including all stages/difficulties, copies/indexes. Diagnose using the authenticated remote catalog fixture and monotonic stage timing/frame gaps, never gameplay fallback.

Heavy parse/validation/copy preparation executes in a privately owned worker job. Worker must not access SceneTree, live autoload state, textures or shared mutable static combat tables. Capture immutable presentation binding metadata on main thread. Main thread polls completion with process_frame and only joins once is_alive=false. Recheck account/runtime/server context/config version before atomic main-thread installation; failed/stale jobs cannot publish readiness or overwrite newer data. Existing synchronous validation entry remains for tests/compatibility, same acceptance rules.

A project-owned NakamaHTTPAdapter subclass also offloads the large RPC HTTP JSON envelope decode for get_game_config; other requests delegate unchanged to the SDK. It reuses SDK AsyncRequest retry/cancel/timeout behavior, main-thread HTTPRequest lifetime and private immutable byte input. No vendored SDK modifications. A config version mismatch is detected immediately after worker parse and gets at most one fresh bootstrap/retry before rejection.

Loading stage progress reflects real phases, not fake completion. Frame animation/input remains active during CPU preparation; network and CPU timings exposed without tokens/PII. Shared transport must avoid redundant main-thread decoding of this bulk catalog; errors/version checks remain after worker parse. No offline/local JSON or cached stale gameplay fallback. No unbounded busy-wait or thread join on UI while active. Stale job lifecycle/ownership and concurrent reload calls explicitly guarded.

Tests: before/after wall time and main frame gaps on same fixture; invalid stage and malformed payload rejected, same catalog contents, stale/cancelled context never ready, repeated loading safe; client static and framework regressions. Headless timings do not certify Android smoothness. Contract remains IN_PROGRESS until measurements and validation pass. Changelog 1.0.0: diagnose 55% CPU stall and move catalog preparation off UI thread.

Actual battle compilation remains unchanged and always builds full descriptors/counts. Worker uses pure matrix validation and suppresses compile_stage's optional live matchup preparation side effect.


Acceptance 2026-11-03: measured baseline ~8.26s synchronous UI CPU work; worker/context/HTTP-envelope tests PASS, frame gap ~10ms in isolated desktop harness, main install ~3ms; framework1191/native1209/damage611 PASS, client static PASS. Android profiling pending; no claim of reduced total validation time. Details: client/docs/reports/C252_LOADING_PROFILING.md from workspace.

Live-local acceptance follow-up: real SDK/auth/RPC and LoadingScreen presentation on a dedicated acceptance device, no saved tokens: ~12.36s total, 1782 frames, max gap19.51ms without screenshot I/O. Visual capture verifies progress during validation. Source report C252_LIVE_LOCAL_NOCAPTURE.json; Android remains pending.

## 1.1.0 ? 2026-11-04 loading latency

Catalog admission validates all stage difficulties, schedules and references,
but does not construct per-spawn wave output. A job-local cache shares identical
compile_entry validation across stages/difficulties; keys include species,
presentation, elements, skills and boss. Level/stat overflow and EXP are checked
independently on every entry, including cache hits. Visual admission copies only
the already validated visual ID, not animation metadata. Cache never survives a
snapshot. Actual selected-stage compilation, RNG, spawn counts and resume stay
unchanged. Admission still validates every random primary loadout and samples
its seeded descriptor as before. No schema-only admission or validation bypass.

Server loads stage waves in one ordered query, casts entries JSONB to text at
the SQL boundary and groups by stage ID. The RPC response schema and complete
catalog are unchanged. No data publication/release creation is required.

Validation: compare full RPC payload before/after, query-count regression,
malformed schedule/reference/override/skill rejection, unchanged seeded battle
compile, worker/context regressions and before/after local timing.
