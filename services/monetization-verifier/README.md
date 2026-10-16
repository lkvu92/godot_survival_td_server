# Monetization verifier

HTTP bridge for Google Play purchase verification, AdMob SSV and Google Play RTDN.
The public routes and trust boundaries are defined in
[`C104_MONETIZATION.md`](../../docs/contracts/C104_MONETIZATION.md).

## Local checks

```sh
npm ci
npm run check
npm start
```

Copy `.env.example` into your secret manager or runtime configuration. Do not
commit the service-account JSON, Nakama HTTP key, or verifier secret.

Set only `APP_ENVIRONMENT=develop|production` when switching environments. The
service then selects `NAKAMA_DEVELOP_URL|NAKAMA_PRODUCTION_URL` and the matching
`ADMOB_REWARDED_UNIT_ID_*` automatically. AdMob production SSV must target a
public HTTPS `/admob/ssv` endpoint; a LAN Godot `develop_host` is not reachable
from Google's callback infrastructure.

## Container

```sh
docker build -t survival-td-monetization-verifier .
docker run --rm -p 8080:8080 --env-file .env survival-td-monetization-verifier
```

Mount the Google service-account file read-only at the path configured by
`GOOGLE_APPLICATION_CREDENTIALS`. In production, expose `/admob/ssv` and
`/google-play/rtdn` through HTTPS. Keep `/google-play/verify` reachable only by
Nakama or protect it with the configured bearer secret.

The repository's local stack includes this service. From `nakama/`, run
`docker compose up -d --build`; its health endpoint is then available at
`http://localhost:8082/health`. The checked-in secret is local-development only.
