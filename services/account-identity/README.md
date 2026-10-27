# C232 Account identity — Gmail SMTP

Implements verified email registration, restricted legacy verification, Google reauthentication and durable deletion across all servers. See `../../docs/contracts/C232_ACCOUNT_IDENTITY.md`. Source changes do not activate production automatically.

## Gmail settings

Keys are in `../../nakama/.env.example` and `.env.local.example`; missing names and independent random bridge/encryption keys were added to existing ignored `.env` / `.env.local` without displaying credentials. Fill the private env file on the deployment host, never commit it:

```dotenv
ACCOUNT_IDENTITY_ENABLED=true
ACCOUNT_IDENTITY_PUBLIC_URL=https://api.lkvustudio.com
ACCOUNT_IDENTITY_SECRET=<64 hex characters; independent random value>
ACCOUNT_IDENTITY_OUTBOX_KEY=<64 hex characters; independent random value>
GOOGLE_WEB_CLIENT_IDS=<the game's allowed Google WEB OAuth client ID>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your Gmail or Workspace sender account>
SMTP_PASSWORD=<Google App Password>
SMTP_FROM=<same account or a Gmail-authorized Send As alias>
SMTP_REPLY_TO=admin@lkvustudio.com
```

Use a Google **App Password** with 2-Step Verification, not the normal Google password. [Google instructions](https://support.google.com/mail/answer/185833?hl=en). Workspace/admin policy may prohibit App Passwords. `SMTP_FROM` is a plain email address, not `Name <address>`; display name is set by the service. Gmail may rewrite an unauthorized sender; contact email does not automatically authorize sending as that address.

Port 587 requires STARTTLS and valid certificates; 465 uses implicit TLS. There is no insecure TLS flag. Service starts only with valid secret/mail configuration. Successful request acceptance means queued, not confirmed inbox delivery. SMTP failures retry for the remaining link lifetime and redact expired payloads. A final deployment smoke must verify delivery/spam and replies using an address owned by the operator; do not bulk-send to players as a test.

SMTP credentials only enter the identity container. Only the separate bridge secret enters Nakama through `configure_runtime.py`; changing Docker env alone does not update Nakama `ctx.env` until private runtime config is regenerated and Nakama restarted. Outbox uses AES-256-GCM; rotate the encryption key only after draining/redacting pending mail. Rotating bridge secret also changes derived deletion recovery receipts; preserve it during active deletion requests.

Test TLS/auth without sending an email, using private Compose env (after building the image):

```powershell
docker compose -f docker-compose.local.yml --env-file .env.local --profile identity run --rm --no-deps account-identity node src/verify-smtp.js
```

`EAUTH`/535 means Gmail rejected authentication. Check that SMTP_USER is the actual Gmail/Workspace login and SMTP_PASSWORD is its permitted App Password. Do not paste the password into chat or command arguments.

## Run / reverse proxy

From `server/nakama` (production values must already exist privately):

```powershell
python configure_runtime.py
docker compose --profile identity up -d --build
```

Local equivalent:

```powershell
python configure_runtime.py --compose-file docker-compose.local.yml --env-file .env.local --output runtime.local.secret.yml
docker compose -f docker-compose.local.yml --env-file .env.local --profile identity up -d --build
```

Compose includes both production and local services, loopback port `18083` by default. Production joins the existing proxy network as `survival-td-account-identity`. Proxy **all `/account/` paths**, unchanged, to `http://survival-td-account-identity:8080`; other Nakama paths keep their current upstream. Browser public base URL must match the configured origin. Permit HTTPS POST bodies; do not cache, log request bodies, Authorization headers or fragments/tokens. Service uses socket IP and does not trust forwarded-IP headers by default; requests behind a shared proxy share its IP rate bucket. Adjust edge rate limits for production traffic; do not simply trust arbitrary client X-Forwarded-For.

Example Nginx locations inside the existing HTTPS virtual host (adapt to its existing configuration, not a replacement server block):

```nginx
location ^~ /account/internal/ { return 404; }
location /account/ {
    proxy_pass http://survival-td-account-identity:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    client_max_body_size 16k;
}
```

Nakama accesses internal Google verification routes directly through the Docker service name, not through this public proxy. Internal routes require the separate bridge secret and do not share public IP throttling.

Client defaults to production `https://api.lkvustudio.com/account` and development `http://<Nakama host>:18083/account`. Override origin with project setting `account_identity/production_url` or `account_identity/develop_url` when necessary. Confirmation pages use the same origin. Static policy/deletion pages are mounted read-only at `/account/privacy-policy/` and `/account/delete-account/`.

Do not enable enforcement until SMTP/proxy/backend/client are ready. With the flag disabled, old email authentication behavior remains; the new client registration path still requires this service. Do not ship the new client before preparing the backend.

## Support and operational recovery

Device-only/lost-access users can email `admin@lkvustudio.com` without reinstalling the game. Verify ownership with established evidence, document the support case, and use the operator CLI from an authorized host with private PG environment. A display name, screenshot, newly supplied email or device ID alone is not sufficient proof.

```text
node src/operator.js --user=<account UUID> --confirm=<same UUID> --case=<verified-case-reference>
```

This command schedules irreversible deletion across every server and must only run after verification. It is not an HTTP endpoint and is never invoked automatically by this change. Record the job ID/case reference in the restricted support system, pass the status receipt to the requester securely, and retain no credentials in the case notes.

Worker retries every 30 seconds after failures; repeated failure moves the job to `manual_review`. Inspect data/FK failures and active account leases. Do not reset `active_requests` blindly: first ensure the process holding the lease is gone and no mutation can still commit. After fixing the cause, authorized operators may set that job to `queued`, `attempts=0` to retry; never mark completed by hand. Logs omit recipient, password, token and SQL payload.

Identity proof links expire after 15 minutes. Expired challenge rows are purged after one day; sent/expired outbox bodies are redacted promptly. Internal abandoned creation markers reconcile after one hour. A pending address is never reserved. Receipt hashes, job user IDs/tombstones and minimal purchase replay records remain restricted for restoration/replay protection; the operator must establish a justified production retention schedule. No arbitrary financial/backup deletion deadline is claimed.

On backup restore keep service closed, restore the current deletion/tombstone ledger from its protected backup, reapply completed deletions (including alias accounts), reconcile identity markers, and audit before opening login. Restoring an old DB alone is insufficient. Keep the ledger backup independent of the restored snapshot. Email verification does not constitute legal consent to unrelated processing.

## Transactional email design

`src/mail-template.js` renders three purpose-specific HTML + plain-text messages. It uses the game's jade/gold visual language, ivory reading surface, 600px presentation tables and inline essential styles. No remote images/fonts, trackers, scripts or forms are included. Outlook VML button fallback and visible copyable URL accompany the normal CTA. Expiry is the challenge's actual timestamp in GMT+7; delivery does not restart its 15-minute lifetime. Deletion email opens a review page and never implies a click immediately deletes an account.

Automated contrast checks cover every authored text/background pair at WCAG AA 4.5:1. Browser previews check 760px and 375px layouts and the matching confirmation page. These checks do not certify every inbox client or forced dark-mode transformation; final acceptance must include Gmail mobile/web and the Outlook versions in the supported device matrix.

Generate and inspect local dummy-link previews (no SMTP):

```powershell
node tools/build-mail-preview.js
node tools/check-mail-browser.js
```

Open `../../docs/reports/account_mail_preview/index.html`. The optional browser checker uses installed Windows Edge; set `EDGE_EXE` for a different executable location. It emits screenshots and geometry checks alongside the preview. Preview links are deliberately invalid. Mail is delivered as multipart HTML/text through the existing authenticated SMTP transport; automatic-message headers suppress reply loops. No unsubscribe/marketing features are added to these account-security messages.

References: [Gmail supported CSS](https://developers.google.com/workspace/gmail/design/css), [W3C minimum text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum).

## Validation commands

```powershell
# Rebuild runtime first from server/nakama: npm run build
docker compose -p c232-test -f test/compose.yml up -d --wait
$env:C232_INTEGRATION='true'
npm test
docker compose -p c232-test -f test/compose.yml down
```

The isolated compose stack uses ephemeral PostgreSQL on `25432` and actual Nakama 3.24.2 on `27350`. Tests inject a mail transport (no external delivery) and Google verifier (real production code uses Google's library/audience/freshness verification). Neither Gmail delivery nor Android Google account selection is certified by these tests; verify those with configured credentials/device before release. Never point these fixture tests at a real player database.
