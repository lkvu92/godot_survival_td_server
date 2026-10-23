# C177 Server-admin tower test entries

Version: 1.0.0
Status: ACTIVE

Server-owned player_trial_tower state may contain admin_test_ticket_cap=100.
Only a protected database/admin write can set this field; no RPC accepts it.
It allows the single administratively granted balance up to 100. Daily recovery
still stops at 20 and never reduces an existing above-cap grant. Other accounts
retain validation/cap 20. Status reports the applicable cap. All start/spend,
server/generation scoping, CAS and rewards remain unchanged. No offline fallback.
Authorized grant: lkvu92@gmail.com, VPS s001/g1, set balance to 100 (not +100).

| Version | Change |
|---|---|
| 1.0.0 | Admin-only test capacity and one account test grant. |
