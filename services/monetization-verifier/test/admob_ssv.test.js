import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { processAdmobCallback, ssvErrorReason } from "../src/admob_ssv.js";

// Generated local test key. Production still fetches Google's fixed key URL;
// this fixture cannot create callbacks accepted by the deployed verifier.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const unit = "ca-app-pub-fixture/123";
const getKeys = async () => new Map([["fixture", publicKey]]);
function callback(fields = {}) {
  const params = new URLSearchParams({ ad_unit: "123", transaction_id: "fixture-transaction", ...fields });
  params.sort();
  const signed = params.toString();
  const signature = sign("sha256", Buffer.from(decodeURIComponent(signed)), privateKey).toString("base64url");
  return "/admob/ssv?" + signed + "&signature=" + signature + "&key_id=fixture";
}
function setup() {
  const confirmations = [], events = [];
  return { confirmations, events, options: { expectedAdUnit: unit, getKeys,
    confirm: async value => confirmations.push(value), onEvent: event => events.push(event) } };
}
const metadata = { custom_data: JSON.stringify({ ad_session_id: "fixture-session", user_id: "fixture-user" }), user_id: "fixture-user" };

test("Google-signed empty Console probe succeeds without Nakama or rewards", async () => {
  const s = setup();
  assert.deepEqual(await processAdmobCallback(callback(), s.options), { ok: true, verification_probe: true });
  assert.equal(s.confirmations.length, 0);
  assert.deepEqual(s.events, ["admob_ssv_probe_verified"]);
});
test("valid reward preserves identifiers for the trusted bridge exactly once", async () => {
  const s = setup();
  assert.deepEqual(await processAdmobCallback(callback(metadata), s.options), { ok: true });
  assert.deepEqual(s.confirmations, [{ ad_session_id: "fixture-session", user_id: "fixture-user", transaction_id: "fixture-transaction", ad_unit: "123" }]);
  assert.deepEqual(s.events, ["admob_ssv_received_verified", "admob_ssv_reward_confirmed"]);
  assert(!JSON.stringify(s.events).includes("fixture-user"));
});
test("signed empty Console probe with another unit never grants; real reward still rejects", async () => {
  const s = setup();
  assert.deepEqual(await processAdmobCallback(callback({ ad_unit: "console-test-unit" }), s.options), { ok: true, verification_probe: true });
  assert.equal(s.confirmations.length, 0);
  await assert.rejects(processAdmobCallback(callback({ ...metadata, ad_unit: "console-test-unit" }), s.options), /UNEXPECTED_AD_UNIT/);
  assert.equal(s.confirmations.length, 0);
});
test("tampering, unknown key, wrong unit and unsigned probe never reach bridge", async () => {
  for (const url of [callback().replace("ad_unit=123", "ad_unit=999"), callback().replace("key_id=fixture", "key_id=other"), callback({ ...metadata, ad_unit: "999" }), "/admob/ssv"]) {
    const s = setup();
    await assert.rejects(processAdmobCallback(url, s.options));
    assert.equal(s.confirmations.length, 0);
  }
});
test("malformed and incomplete real reward metadata cannot become a probe", async () => {
  for (const fields of [{ custom_data: "bad-json" }, { custom_data: "null" }, { user_id: "fixture-user" },
    { custom_data: "{}" }, { ...metadata, transaction_id: "" }, { ...metadata, user_id: "other-user" },
    { custom_data: JSON.stringify({ ad_session_id: 1, user_id: "fixture-user" }) }]) {
    const s = setup();
    await assert.rejects(processAdmobCallback(callback(fields), s.options));
    assert.equal(s.confirmations.length, 0);
  }
});
test("duplicate security parameters rejected and downstream failure not acknowledged", async () => {
  const s = setup();
  await assert.rejects(processAdmobCallback(callback(metadata) + "&user_id=another", s.options), /DUPLICATE_PARAMETER/);
  s.options.confirm = async () => { throw Error("private downstream details"); };
  await assert.rejects(processAdmobCallback(callback(metadata), s.options));
  assert(!s.events.includes("admob_ssv_reward_confirmed"));
  assert.equal(ssvErrorReason(Error("Bearer private credential")), "VERIFICATION_OR_BRIDGE_UNAVAILABLE");
});

// This is the encoding difference seen in the real Android callback.
test("Google URI.getQuery signed UTF-8 handles escaped JSON, literal plus and percent once", async () => {
  const s = setup();
  const fields = { user_id: "fixture+user", custom_data: JSON.stringify({ad_session_id: "session+%2F & t", user_id: "fixture+user"}) };
  const url = callback(fields);
  await processAdmobCallback(url, s.options);
  assert.equal(s.confirmations[0].ad_session_id, "session+%2F & t");
  assert.equal(s.confirmations[0].user_id, "fixture+user");
  await assert.rejects(processAdmobCallback(url.replace("fixture%2Buser", "tampered"), setup().options), /INVALID_SIGNATURE/);
  await assert.rejects(processAdmobCallback(url.replace("custom_data=", "custom_data=%ZZ"), setup().options), /INVALID_SIGNATURE/);
});

test("raw encoded JSON signature is not the Google URI.getQuery representation", async () => {
  const unsigned = new URLSearchParams({ad_unit: "123", transaction_id: "t", ...metadata});
  unsigned.sort();
  const raw = unsigned.toString();
  const signature = sign("sha256", Buffer.from(raw), privateKey).toString("base64url");
  const s = setup();
  await assert.rejects(processAdmobCallback("/admob/ssv?" + raw + "&signature=" + signature + "&key_id=fixture", s.options), /INVALID_SIGNATURE/);
  assert.equal(s.confirmations.length, 0);
});
