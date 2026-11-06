# C252 production LoadingScreen timeout — 2026-11-06

The client log contained `RPC get_game_config failed: HTTPRequest failed!`. Nakama remained healthy. The authenticated complete production catalog (config version 21, 72 stages, ~7.9 MB RPC envelope) passed the actual Godot CatalogLoadJob/DataRegistry validation.

Native Godot public HTTPS probe reproduced RESULT_TIMEOUT (13) with the existing 5-second request deadline twice; the same request with 30 seconds returned HTTP 200 in ~7 seconds. The project adapter previously inherited the ordinary SDK timeout for this bulk request.

## Changes and deployment

- Client ResponsiveNakamaHTTPAdapter gives get_game_config at least 30 seconds. Other RPC timeout/retry/cancel behavior stays unchanged. No local gameplay fallback or skipped validation.
- Server version gate appends small version/current-character feature metadata to its already valid serialized all-catalog object, avoiding a full bulk parse/stringify round-trip. Existing active-release race and force-update checks remain.
- Wave SQL selects only required columns plus entries::TEXT; SELECT * no longer also materializes the original JSONB entries.
- Runtime deployed and healthy. Latest backup: `/opt/backups/c252-catalog-timeout-20261106T104158Z` (runtime files and DB dump). No gameplay data migration or config publication; version remains 21.

## Verification and limits

- Complete decoded production catalog before/after matches, excluding independently changing per-player feature metadata. No gameplay/catalog values were altered.
- Server metadata/query regressions, runtime build and full server static suite: PASS. Client static suite: PASS.
- Real HTTP fixture delayed 6 seconds, adapter ordinary timeout set to 5: PASS in 6.71 seconds, ~22 ms maximum main-frame gap. This verifies the bulk deadline without extending other RPC deadlines.
- Actual patched project adapter over production HTTPS: PASS in 4.62 seconds; schema 2, version 21, all 72 stages returned. Complete production catalog worker validation: PASS, ~3.82 seconds, ~7.5 ms maximum main-frame gap in desktop headless harness.
- Server optimization reduced observed request time from ~5.5–7 seconds to ~4–4.6 seconds, but direct 5-second probes still timed out under some runs. It does not guarantee old APK recovery on slow networks. The 30-second deadline requires rebuilding/reinstalling the client APK; updated desktop source must be rerun. No APK/Play release was built or published in this incident.
- Measurements do not certify Android rendering or full login/gameplay acceptance. Credentials remained in transient process memory; no auth tokens were saved in reports.
