# C262 Login functions and Vietnam phone validation

Version: 1.0.0 | Status: IN_PROGRESS | Updated: 2026-11-04

Login screen has three TabUI tabs: Login (email/password and Google), Register (email confirmation), Functions (account deletion/support and account restoration actions, including Google and deletion status when applicable). Preserve auth callbacks, safe sizing, loading guards and existing scene node paths. No new forgot-password flow is implied; audit and report existing behavior.

Both player and guardian OTP requests accept only Vietnamese mobile numbers matching 0[35789] plus eight digits, allowing whitespace/dots/hyphens and +84 country code, normalized to 0 format. Server remains authoritative. The legacy save_compliance_profile RPC rejects invalid nonempty phone values before storage and normalizes accepted numbers; empty remains allowed for incomplete profiles and cannot mark verification. No new RPC, schema or offline fallback. Verify user/guardian validation including foreign numbers and responsive three-tab layout; keep personal data out of tests.

Local implementation and scoped tests complete; see [audit and render evidence](../../../client/docs/reports/C262_LOGIN_PHONE_AUDIT.md). No forgot-password reset currently exists. Server full static suite remains blocked by the pre-existing gift-code fixture failure; Android/provider and production verification remain open.

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-04 | Three login tabs, consistent Vietnam mobile validation, forgot-password audit. |
