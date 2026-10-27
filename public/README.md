# Public privacy documents — Thông Thiên Lộ

Status: local review draft, 27 October 2026. Not deployed by this change.

## Files

- `privacy-policy/index.html`: public Vietnamese/English policy, static and usable without JavaScript.
- `privacy-policy/policy.vi.md` and `policy.en.md`: editable policy sources.
- `delete-account/index.html`: public account-deletion request instructions.
- `delete-account/instructions.md`: editable deletion instructions.
- `build_privacy_pages.py`: regenerate HTML with Python and the `markdown` package.

Run `python server/public/build_privacy_pages.py` from the workspace root after editing sources.

## Review before publishing

- Confirm the public operator/publisher name matches the Google Play listing. The draft identifies the operator by the game name, Thông Thiên Lộ, without inventing a legal company.
- Public privacy/deletion contact confirmed by the project owner: `admin@lkvustudio.com`. Ensure this mailbox is monitored for requests.
- Confirm Google Play target audience, actual availability to children and any required child-directed configuration. This draft does not invent an age gate or a minimum age.
- Assign an operator for manual deletion and verify that deletion reaches Nakama authentication, account storage, per-server progress, inventory, rankings and related identifiers. Define actual retention/backup schedules and lawful exceptions before making more specific timing promises.
- An in-app account-deletion request route was not found during this review. Google Play requires both an in-app request route and an external web resource when users can create accounts. These documents alone do not implement that feature.
- Confirm Google SDK versions/mediation partners and actual consent-message configuration. Update disclosures if SDKs, partners, permissions, purposes or hosting change.
- Complete Google Play Data Safety based on real collection/sharing, including Google SDK processing. The policy is not a substitute for that declaration.

## Hosting

Upload both directories together to the existing public static host, preserving paths. The host must serve the HTML publicly over HTTPS without login or geographic restrictions. Do not enter a `file:///` URL in AdMob or Google Play.

If deployed at the root of the existing `lkvu92.github.io` site, candidate URLs are:

- `https://lkvu92.github.io/privacy-policy/`
- `https://lkvu92.github.io/delete-account/`

These are planned URLs, not evidence that deployment has happened. Verify both URLs on an unauthenticated browser after deployment. Use the policy URL in Google Play and the AdMob consent-message configuration; use the deletion URL in Google Play's deletion-link field. Publishing an AdMob message is a separate console step.

## Basis and scope

Reviewed client authentication, local Nakama session storage, production Android manifest, AdMob/UMP, Google Play Billing, leaderboard fields and server account/reward flows. No production data, console settings or gameplay behavior changed. This is a project-specific draft, not a certification of legal compliance.

Primary platform references checked on 27 October 2026:

- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Google Mobile Ads SDK data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure)
- [Google Privacy Policy](https://policies.google.com/privacy)

The SDK disclosure describes Google's current documented behavior; verify it against the shipped SDK and any mediation configuration. No fixed deletion deadline, retention duration, child-audience declaration or publisher legal identity has been fabricated.
