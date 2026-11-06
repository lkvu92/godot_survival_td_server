# Missing AdMob SSV callback — 2026-11-06

Status: INVESTIGATING. User explicitly requires verified Google SSV before any
production reward. No SDK-earned fallback or manual production grant authorized.
Source changes belong only to local repositories; VPS worktree remains clean.

## Confirmed observations

- Android package vn.lkvu92.survivaltd, installed Play build 1.0.37.
- Device Xiaomi 2312CRAD3C / Android 16. Poing integration 5.1.0 in source;
  installed Ad Inspector reports Google Mobile Ads SDK 1.4.0.
- Production rewarded unit ca-app-pub-2623237649967496/5496497462, explicitly
  rendered as Test Ad on the registered test device; this is not the Google demo
  unit. Do not confuse registered test devices with Google's shared demo IDs.
- Google Console callback verification succeeded: verifier event
  admob_ssv_probe_verified. User confirmed saving the verified URL.
- Callback endpoint https://api.lkvustudio.com/admob/ssv is reachable. Unsigned
  requests, including requests with URL-encoded custom_data and user_id, reach
  verifier and correctly fail MISSING_SIGNATURE (400). No AAAA destination was
  returned by the DNS check. Prior stale Nginx upstream was repaired by reload.
- Native plugin logged setServerSideVerificationOptions at 21:48:21 UTC+7,
  before native earned at 21:48:27 and dismissal earned=true at 21:48:30.
- Parsed native options were compared to PostgreSQL without printing raw IDs:
  session_found=true, native_user_matches=true, custom_user_matches=true,
  custom_session_matches=true; ledger status=prepared.
- GMA network diagnostic logs include a reward_granted interaction request to
  googleads.g.doubleclick.net/pagead/interaction/. That client-to-Google request
  is not the Google-to-game SSV callback and does not independently prove its
  HTTP success or server reward verification.
- Verifier log still contains no admob_ssv_received_verified or
  admob_ssv_reward_confirmed for observed videos at final inspection.
- Compiled RPC fixture test client/tests/test_rewarded_server.cjs PASS covers
  SSV, idempotency, quotas and mission recovery. This is fixture evidence and
  does not establish production multi-server reward settlement.

## Remaining uncertainty

Evidence places the missing event after native SSV metadata configuration and
before receipt by the game verifier. It does not establish a specific Google
SDK defect, propagation delay, or that every test-device ad omits SSV. The
capacitor-community integration's own testing guide says test ads do not invoke
SSV, but that is not authoritative proof of this Poing/Next-Gen SDK scenario.
Google documents Console testing and signature validation; signed Console
setup probe acceptance is distinct from an actual reward callback.

References:
- https://developers.google.com/admob/android/next-gen/ssv
- https://poingstudios.github.io/godot-admob-plugin/5.1/advanced_topics/ssv/
- https://github.com/capacitor-community/admob/blob/main/docs/testing.md

## Prepared provider investigation request (not sent)

Please confirm whether the GMA Next-Gen SDK 1.4.0 should dispatch rewarded SSV
for a production AdMob unit served to a registered test device (Test Ad label).
Signed Console verification reaches our endpoint, but after complete rewarded
views the SDK invokes earned while no reward SSV reaches our verifier. Native
user_id/custom_data are set before show and match the prepared server session.
Is additional test-device setup needed, or is there a known Next-Gen/test
traffic restriction? Which Ad Inspector response ID/network tracing evidence
is required to trace the reward callback at Google's side?

Do not send raw logcat or full GMA URLs: they can contain account identifiers,
ad request tokens, session metadata and unrelated application traffic. Obtain
the specific Ad Inspector troubleshooting output / response ID for one fresh
rewarded request and review it before sharing. No support request has been sent.

Acceptance remains OPEN until a genuine signed reward callback is validated,
the authoritative server ledger grants exactly once, and the UI reflects the
grant. No need for a client rebuild has been proven to repair the missing SSV.

## Newly built APK on physical device

Built/installed local release code as vn.lkvu92.survivaltd.ssvtest to preserve the
Google Play installation (different signing certificates prevent update install).
Actual native rewarded load succeeded through AdMobAdapter, response ID
E-3tavXrH4ukjuMPpKjboA0. User logged in to the designated S1 account.
Daily mission session created at 22:10:10 UTC+7, earned at 22:10:25, dismissed
earned=true at 22:10:59. At final inspection no reward SSV had arrived, ledger
remained prepared and UI 0/3. A subsequent explicit retry did not show another
video or create another session (new client retry behavior works on device).
No crash recorded for the test package during this run. Different package and
signing limit exact Play-production equivalence; no provider-side root cause
is claimed. Original Play package had independently shown the same missing SSV.

## Direct grant and signed callback tests on actual local runtime

User requested that grant execution and callback dispatch be tested separately.
Added tests/test_admob_reward_callback_runtime.cjs and ran after npm run build.
Used isolated local PostgreSQL 16 and Nakama 3.24.2 containers, seeded catalog,
production reward policy and MULTI_SERVER_ENABLED=true. Only local fixture users
and data were modified. Test containers/network were removed after execution.

| Test | Actual native runtime result |
|---|---|
| Direct admob_ssv_confirm -> grantPreparedReward | Stamina 10 -> 25; SQL ledger granted |
| Repeat same direct grant | Stamina remains 25; no second reward |
| Signed HTTP callback -> processAdmobCallback -> trusted bridge -> admob_ssv_confirm | Handler and bridge invoked; exact user/session preserved |
| Daily mission callbacks 1 / 2 / 3 | Ledger granted each time; inventory quantities 0 / 0 / 1 |
| Fragment catalog readback | Selected item's quality is low; exactly one fragment |
| Replay signed callback | Inventory remains one; no duplicate fragment |
| Wrong unit / conflicting user metadata / tampered signature | HTTP 400 before bridge invocation |
| Consistently signed metadata for wrong ledger owner | Bridge called, grant rejected; original session stays prepared |
| Other user / other server / legacy unscoped storage | All balances and inventory unchanged |
| Callback reward_item=forged-gems / reward_amount=999 | Ignored for reward selection; stored session/config choose daily fragment, gems unchanged |

Callback carries user_id, ad_session_id (inside custom_data), transaction_id and
ad_unit. Backend looks up reward_type/reward_amount/placement/server/generation
from monetization_ad_rewards, and item definitions/limits from authoritative
config/catalog. A callback therefore identifies an existing prepared grant,
instead of choosing arbitrary rewards from client-provided fields.

This closes the local execution question: direct grant and verified-callback
dispatch both work against actual Nakama/SQL. Signatures are generated using an
isolated test key injected only into the test harness. This is NOT a Google
production callback and does not close the missing provider callback issue.

## Android request-to-ingress trace — 22:33–22:36 UTC+7

New stamina session in diagnostic Android package, selected account/S1, amount
+15; existing stamina 138. App was reopened to obtain a fresh prepared session
and new native response ID _fLtao_rCa6a4vEPvNPRsQI (AdMobAdapter, Test Ad label).

| Observation | Result |
|---|---|
| Native SSV metadata configured | 22:34:13.485; user/session match stored SQL session |
| Fresh SQL session | 22:34:13.477; expiry 23:04:13; placement stamina_dialog_ad |
| SDK native earned callback | 22:34:28.298 |
| SDK reward_granted interaction to Google | HTTP 200 at timestamp 1793979268364; no associated network error |
| Dismissal | earned=true at 22:35:10.405 |
| SQL after observation | prepared, still unexpired |
| UI after bounded confirmation | stamina stays 138; 3/3 quota unchanged |

To distinguish absence of application logging from absence of incoming requests,
ran a temporary in-memory AF_PACKET observer on the VPS. It filtered only HTTP
traffic to/from the existing verifier container port 8080, emitted only SSV
field names/presence flags/hash values and HTTP response codes, and stored no raw
packets, full URLs, signatures, tokens or account IDs. No service source/config
was changed. An initial observer failed its positive control and was discarded.
The corrected observer used ETH_ALL and successfully observed the unsigned
public control request and its expected HTTP 400 response before video show.

Validated observation window 22:33:30–22:35:05 (95 seconds): exactly one SSV-path
request, the unsigned diagnostic control (query field diagnostic only), zero
signed reward requests. It covers native show, earned and 37 seconds after
earned; it ends five seconds before the recorded dismissal. Verifier application
logs inspected after dismissal also contain no reward callback success/reject
event, aside from known unsigned diagnostic requests. This is not an indefinite
network capture and does not prove what happened inside Google or before proxy.

The Android-to-Google reward report receives HTTP 200, but that HTTP 200 does not
prove Google's generation or delivery of an SSV request. No reward callback
payload arrived at the verifier to inspect, so there is no evidence of a wrong
user, incorrect reward mapping, quota rejection or grant exception in this run.
The grant handler remains uninvoked for this session because verified SSV is
missing. Provider/test-traffic/internal-dispatch root cause remains unresolved.

Sanitized evidence: C104_ANDROID_INGRESS_20261106.jsonl and
C104_ANDROID_NETWORK_20261106.txt in this report directory. VPS git worktree
remained clean. Original Play installation and strict SSV policy were preserved.

## Retest 2026-11-07 after user linked Google Ads accounts

User screenshots show Google Ads account linking in AdMob and Play Console;
they do not demonstrate AdMob app store listing linkage. Retest still performed
on connected Android diagnostic package after fresh application start.

Capture interval 00:03:27–00:05:37 UTC+7 (130 seconds), validated by unsigned
control request and HTTP 400 response. Fresh stamina session created 00:04:10,
expires 00:34:10. Native earned at 00:04:42; Google reward_granted interaction
received HTTP 200. Native user/session matched the SQL session.

Exactly two requests entered verifier during capture: the known unsigned
diagnostic, and a Google-signed Console probe with ad_unit=1234567890 and no
user_id/custom_data, answered 200. User explicitly confirmed clicking Verify
URL during the test. Thus that signed callback is not attributable to the video.
No signed reward callback with game user/session arrived. SQL remains prepared;
stamina remains 138. Linking Google Ads accounts did not resolve this observed
reward flow. No source/config/reward writes were made on the VPS.

Evidence: C104_ANDROID_INGRESS_20261107.jsonl,
C104_ANDROID_NETWORK_20261107.txt. Strict SSV acceptance remains open.
