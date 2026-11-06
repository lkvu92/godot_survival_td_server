import { verify as verifySignature } from "node:crypto";

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized + "=".repeat((4 - (normalized.length % 4)) % 4), "base64");
}

function expectedUnit(received, expected) {
  const numeric = expected.includes("/") ? expected.slice(expected.lastIndexOf("/") + 1) : expected;
  return Boolean(received && expected) && (received === expected || received === numeric);
}

export async function verifyAdmobCallback(rawUrl, { getKeys, expectedAdUnit }) {
  const query = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
  const signatureIndex = query.indexOf("&signature=");
  if (signatureIndex < 0) throw new Error("MISSING_SIGNATURE");
  const params = new URLSearchParams(query);
  for (const name of ["signature", "key_id", "ad_unit", "custom_data", "user_id", "transaction_id"]) {
    if (params.getAll(name).length > 1) throw new Error("DUPLICATE_PARAMETER");
  }
  // Google's reference uses URI.getQuery(), which percent-decodes once.
  // Preserve literal '+' and parameter order; URLSearchParams.toString() changes both.
  let signedContent;
  try { signedContent = decodeURIComponent(query.slice(0, signatureIndex)); }
  catch { throw new Error("INVALID_SIGNATURE"); }
  const pem = (await getKeys()).get(params.get("key_id") || "");
  if (!pem || !verifySignature("sha256", Buffer.from(signedContent, "utf8"), pem,
    fromBase64Url(params.get("signature") || ""))) throw new Error("INVALID_SIGNATURE");
  const adUnit = params.get("ad_unit") || "";

  const customText = params.get("custom_data") || "";
  const callbackUser = params.get("user_id") || "";
  // AdMob Console's default Verify URL request has no game session metadata.
  // Prove the signed endpoint is reachable, without touching a reward ledger.
  if (!customText && !callbackUser) return { verification_probe: true };
  if (!expectedUnit(adUnit, expectedAdUnit)) throw new Error("UNEXPECTED_AD_UNIT");
  let custom;
  try { custom = JSON.parse(customText); } catch { throw new Error("INVALID_CUSTOM_DATA"); }
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) throw new Error("INVALID_CUSTOM_DATA");
  const sessionId = custom.ad_session_id;
  const customUser = custom.user_id;
  if (customUser !== undefined && typeof customUser !== "string") throw new Error("INVALID_CUSTOM_DATA");
  if (callbackUser && customUser && callbackUser !== customUser) throw new Error("USER_MISMATCH");
  const userId = callbackUser || customUser;
  const transactionId = params.get("transaction_id") || "";
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > 200 ||
    typeof userId !== "string" || !userId || userId.length > 200 ||
    !transactionId || transactionId.length > 256) throw new Error("MISSING_REWARD_METADATA");
  return { ad_session_id: sessionId, user_id: userId, transaction_id: transactionId, ad_unit: adUnit };
}

export async function processAdmobCallback(rawUrl, { getKeys, expectedAdUnit, confirm, onEvent = () => {} }) {
  const verified = await verifyAdmobCallback(rawUrl, { getKeys, expectedAdUnit });
  if (verified.verification_probe) {
    onEvent("admob_ssv_probe_verified");
    return { ok: true, verification_probe: true };
  }
  onEvent("admob_ssv_received_verified");
  await confirm(verified);
  onEvent("admob_ssv_reward_confirmed");
  return { ok: true };
}

export function ssvErrorReason(error) {
  const known = new Set(["MISSING_SIGNATURE", "DUPLICATE_PARAMETER", "INVALID_SIGNATURE",
    "UNEXPECTED_AD_UNIT", "INVALID_CUSTOM_DATA", "USER_MISMATCH", "MISSING_REWARD_METADATA"]);
  return known.has(error?.message) ? error.message : "VERIFICATION_OR_BRIDGE_UNAVAILABLE";
}
