# C124 Public proxy network

Version: 1.0.0  
Status: ACTIVE  
Date: 2026-10-16

The existing shared Nginx proxy and the game HTTP services must share the
external Docker network `source_truyen24h-net`. Nakama has the stable alias
`survival-td-nakama`; the verifier has `survival-td-monetization-verifier`.
Both services retain their private Compose default network for database and
internal calls. PostgreSQL is never attached to the public proxy network.

## Interface and failure behavior

The public `/v2/` API, WebSocket route and verifier callbacks use the existing
Nginx routes. No RPC payload or gameplay schema changes. If the upstream is
unavailable, the client remains blocked under C121; no offline fallback.
Deployment must validate `nginx -t` before reloading Nginx, then probe an
authentication endpoint and verify that the response is JSON rather than HTML.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-16 | Attach Nakama and verifier to the proxy network with stable aliases. |
