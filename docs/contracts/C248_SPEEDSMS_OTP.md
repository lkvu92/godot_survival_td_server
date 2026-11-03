# C248 — SpeedSMS OTP

Version 1.4.0; Status IN_PROGRESS.

## Type 4 default sender 1.4.0

For `SPEEDSMS_SMS_TYPE=4`, an empty `SPEEDSMS_SENDER` is valid and the adapter omits the sender field entirely. Explicit nonempty sender remains supported. Types 3 and 5 require sender. A real direct API request with sender omitted received `sender not found`; this provider response is not evidence that sender is required by the API or that the SMS was sent. Verify the assigned account/channel and current provider behavior before claiming delivery.

## OTP timing and anti-spam 1.3.0

Server returns `server_time`, `expires_at` and `resend_at` for an active challenge, and `retry_at` on rate/cooldown denial. No OTP or phone is returned. The client uses monotonic elapsed time from receipt to display remaining validity and resend cooldown; server timestamps are authoritative, failures remain closed, expiry disables verification and resending replaces the prior code. Timers are not local authorization. Resend controls remain disabled during requests and cooldown.

Rate limiting persists independently of challenge deletion: bounded fixed window and cooldown enforced using server-only storage per account, phone and client IP; all keys are HMAC pseudonyms and reservations use one CAS batch before sending. Config `otp_rate_window_seconds`, `otp_rate_account_max`, `otp_rate_phone_max`, `otp_rate_ip_max` applies across instances sharing storage. Missing/invalid configuration fails closed; provider failures consume reservations. IP is the Nakama authenticated context IP and requires trustworthy proxy configuration. Fixed windows have boundary bursts; distributed infrastructure/network-wide attack controls and cleanup/retention of expired buckets remain operational follow-up. The established development mock/production SpeedSMS split is unchanged.

## Environment routing 1.2.0

The runtime `APP_ENVIRONMENT` is authoritative for provider selection: `develop` uses mock PIN `12345` only with `COMPLIANCE_ALLOW_MOCK=true`; `production` uses `speedsms`, irrespective of snapshot provider. Missing or other values fail closed. A develop account verified by mock cannot authorize gameplay on production. Production never accepts mock codes or falls back to mock when SpeedSMS is unavailable. Returned policy exposes the effective provider. This overrides previous provider-selection text below.

## SMS API correction 1.1.0

`speedsms` uses HTTPS `POST /sms/send`. The server generates a uniform six-digit PIN from Nakama's cryptographic UUIDv4 randomness using rejection sampling, then sends it in a configurable template and stores only the challenge-bound HMAC. `SPEEDSMS_SMS_TYPE` and `SPEEDSMS_SENDER` configure the provider channel; token and independent HMAC key remain private. App ID is not used. `success`, code `00`, a data object, nonzero `totalSMS` and no invalid recipients are required before arming a challenge; ambiguous failure remains closed.

`system.compliance_policy.provider=speedsms` selects the SMS provider. `compliance_access` keeps its request and verify schema; successful verification records `verification_method=speedsms`. Failed or ambiguous provider requests never activate a profile. A request reserves a protected challenge before sending, applies the configured account cooldown and expiry, and cannot verify before the send returns successfully. Existing CAS, attempt limit, guardian and profile audit rules remain in force. No SMS is sent from the client, no secret/PIN/provider response is returned or logged, and no mock fallback is allowed.

Secrets `SPEEDSMS_ACCESS_TOKEN` and `SPEEDSMS_OTP_HMAC_KEY` are supplied via private environment and rendered into private Nakama runtime config. Optional `SPEEDSMS_CONTENT` is SMS text containing `{pin_code}`. Provider timeout may leave a sent message unusable; request again after cooldown. Multi-account/phone/IP throttling and live delivery verification require further work before production acceptance. Configuration snapshot activation is an operator action; no silent switch from mock.

Offline/failure: fail closed with Vietnamese message; preserve existing verified profile. Test with simulated provider, then separately with real credentials and a consenting test number. Never claim live delivery based on a fixture.

Changelog: 1.0.0 initial SpeedSMS 2FA integration contract and operational safeguards.
1.1.0: switch to SpeedSMS SMS API and server-generated OTP; remove 2FA app ID requirement.
1.2.0: enforce environment routing, mock PIN 12345 and production fail-closed.
1.3.0: server timing, resend UI protocol and multi-scope atomic spam limits.
