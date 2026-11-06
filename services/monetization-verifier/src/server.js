import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { google } from "googleapis";
import { syncFinancialBatch } from "./play_financials.js";
import { processAdmobCallback, ssvErrorReason } from "./admob_ssv.js";
import { recoveryKey, enqueueReceipt, validatePushIdentity, enqueueNotification, recoverBatch } from "./purchase_recovery.js";

const port = Number(process.env.PORT || 8080);
const appEnvironment = String(process.env.APP_ENVIRONMENT || "develop").toLowerCase() === "production"
  ? "production"
  : "develop";
const verifierSecret = process.env.MONETIZATION_VERIFIER_SECRET || "";
const selectedNakamaUrl = appEnvironment === "production"
  ? process.env.NAKAMA_PRODUCTION_URL
  : process.env.NAKAMA_DEVELOP_URL;
const nakamaUrl = (selectedNakamaUrl || process.env.NAKAMA_URL || "http://localhost:7350").replace(/\/$/, "");
const nakamaHttpKey = process.env.NAKAMA_HTTP_KEY || "";
const admobRewardedUnitId = appEnvironment === "production"
  ? process.env.ADMOB_REWARDED_UNIT_ID_PRODUCTION || ""
  : process.env.ADMOB_REWARDED_UNIT_ID_DEVELOP || "";
const admobKeysUrl = "https://www.gstatic.com/admob/reward/verifier-keys.json";

let keyCache = { expiresAt: 0, keys: new Map() };

function json(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) });
  response.end(data);
}

async function readJson(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 131072) throw new Error('REQUEST_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function authorize(request) {
  return Boolean(verifierSecret) && request.headers.authorization === `Bearer ${verifierSecret}`;
}

async function verifyPlayPurchase(body) {
  const expectedPackage = String(process.env.GOOGLE_PLAY_PACKAGE_NAME || "");
  if ((body.purchase_order_id || body.verification_only === true) && (!expectedPackage || String(body.package_name || "") !== expectedPackage)) return { verified: false };
  // Persist encrypted receipt before querying Google or granting anything.
  await enqueueReceipt({token:String(body.purchase_token||''),packageName:expectedPackage,productId:String(body.product_id||''),
    expectedOrderId:String(body.purchase_order_id||''),expectedUserId:String(body.user_id||''),key:recoveryKey(process.env.PURCHASE_RECOVERY_ENCRYPTION_KEY),
    bridge:payload=>callNakamaVerifierRpc('google_play_delivery',payload)});
  const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
  const publisher = google.androidpublisher({ version: "v3", auth });
  const result = await publisher.purchases.products.get({
    packageName: String(body.package_name || ""),
    productId: String(body.product_id || ""),
    token: String(body.purchase_token || ""),
  });
  const purchase = result.data || {};
  if (Number(purchase.purchaseState) !== 0 || (purchase.quantity!==undefined&&purchase.quantity!==1)) return { verified: false };
  // The app sets this to the authenticated Nakama user UUID before launching
  // Billing. Requiring an exact match prevents a valid token being moved to a
  // different game account.
  const expectedUserId = String(body.user_id || "");
  if (!expectedUserId || String(purchase.obfuscatedExternalAccountId || "") !== expectedUserId) {
    return { verified: false };
  }
  const expectedOrderId = String(body.purchase_order_id || "");
  if (expectedOrderId && String(purchase.obfuscatedExternalProfileId || "") !== expectedOrderId) return { verified: false };

  // The recovery worker finalizes with Google only after durable game delivery.
  return {
    verified: true,
    token_hash: createHash("sha256").update(String(body.purchase_token)).digest("hex"),
    order_id: String(purchase.orderId || ""),
    purchase_order_id: String(purchase.obfuscatedExternalProfileId || ""),
    purchase_time_millis: String(purchase.purchaseTimeMillis || ""),
  };
}

async function getAdmobKeys() {
  if (Date.now() < keyCache.expiresAt && keyCache.keys.size > 0) return keyCache.keys;
  const response = await fetch(admobKeysUrl);
  if (!response.ok) throw new Error(`Could not fetch AdMob verifier keys: ${response.status}`);
  const body = await response.json();
  const keys = new Map();
  for (const entry of body.keys || []) keys.set(String(entry.keyId), String(entry.pem || ""));
  keyCache = { expiresAt: Date.now() + 60 * 60 * 1000, keys };
  return keys;
}

async function confirmWithNakama(verified) {
  if (!nakamaHttpKey || !verifierSecret) throw new Error("Nakama verifier bridge is not configured");
  const response = await fetch(
    `${nakamaUrl}/v2/rpc/admob_ssv_confirm?http_key=${encodeURIComponent(nakamaHttpKey)}&unwrap=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...verified, verifier_secret: verifierSecret }),
    },
  );
  if (!response.ok) throw new Error(`Nakama confirmation failed: ${response.status}`);
  const result = await response.json();
  if (result.success === false || result.status === "error") throw new Error("Nakama callback rejected; retry required");
  return result;
}

async function callNakamaVerifierRpc(rpcId, payload) {
  if (!nakamaHttpKey || !verifierSecret) throw new Error("Nakama verifier bridge is not configured");
  const response = await fetch(
    `${nakamaUrl}/v2/rpc/${encodeURIComponent(rpcId)}?http_key=${encodeURIComponent(nakamaHttpKey)}&unwrap=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, verifier_secret: verifierSecret }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok) throw new Error(`Nakama ${rpcId} failed: ${response.status}`);
  const result = await response.json();
  if (result.success === false || result.status === "error") throw new Error("Nakama callback rejected; retry required");
  return result;
}

async function processRtdn(request) {
  const audience = process.env.GOOGLE_PUBSUB_AUDIENCE || "";
  if (!audience) throw new Error("GOOGLE_PUBSUB_AUDIENCE is required");
  const authorization = request.headers.authorization || "";
  const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!idToken) throw new Error("Missing Pub/Sub OIDC token");
  const oauth = new google.auth.OAuth2();
  const ticket=await oauth.verifyIdToken({ idToken, audience });
  validatePushIdentity(ticket.getPayload(),process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL);

  const envelope = await readJson(request);
  const encoded = String(envelope?.message?.data || "");
  const notification = JSON.parse(Buffer.from(encoded, "base64").toString("utf8") || "{}");
  const result=await enqueueNotification({notification,packageName:String(process.env.GOOGLE_PLAY_PACKAGE_NAME||''),key:recoveryKey(process.env.PURCHASE_RECOVERY_ENCRYPTION_KEY),
    bridge:payload=>callNakamaVerifierRpc('google_play_delivery',payload)});
  console.log(JSON.stringify({event:'google_play_rtdn_accepted',notification_type:notification.testNotification?'test':notification.oneTimeProductNotification?'one_time':notification.voidedPurchaseNotification?'voided':'other',queued:result?.queued===true}));
  return result;
}

const server = createServer(async (request, response) => {
  let route = "";
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    route = url.pathname;
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true });

    if (request.method === "POST" && url.pathname === "/google-play/verify") {
      if (!authorize(request)) return json(response, 403, { verified: false, error: "forbidden" });
      return json(response, 200, await verifyPlayPurchase(await readJson(request)));
    }

    if (request.method === "GET" && url.pathname === "/admob/ssv") {
      const result = await processAdmobCallback(request.url || "", {
        getKeys: getAdmobKeys,
        expectedAdUnit: admobRewardedUnitId,
        confirm: confirmWithNakama,
        onEvent: event => console.log(JSON.stringify({ event })),
      });
      return json(response, 200, result);
    }

    if (request.method === "POST" && url.pathname === "/google-play/rtdn") {
      await processRtdn(request);
      return json(response, 204, {});
    }

    return json(response, 404, { error: "not_found" });
  } catch (error) {
    if (route === "/admob/ssv") {
      const reason = ssvErrorReason(error);
      console.warn(JSON.stringify({ event: "admob_ssv_rejected", reason }));
      return json(response, 400, { error: reason });
    }
    console.warn(JSON.stringify({event:'payment_bridge_request_failed',route}));
    return json(response, 503, { error: 'provider_or_bridge_unavailable' });
  }
});

async function runFinancialSync() {
  let retry = 300;
  try {
    const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
    const result = await syncFinancialBatch({
      publisher: google.androidpublisher({version:"v3",auth}),
      packageName: String(process.env.GOOGLE_PLAY_PACKAGE_NAME || ""),
      bridge: payload => callNakamaVerifierRpc("google_play_financial_sync", payload),
    });
    retry = Math.max(30, Math.min(86400, Number(result.retry_seconds) || 300));
    if (result.failed) console.warn("Financial sync has pending retries; no entitlement changed.");
  } catch (_error) { console.warn("Financial sync unavailable; retry scheduled."); }
  setTimeout(runFinancialSync, retry * 1000).unref();
}
server.listen(port, () => {
  console.log(`Monetization verifier listening on :${port}`);
  setTimeout(runFinancialSync, 5000).unref();
  setTimeout(runRecovery, 1000).unref();
});

async function runRecovery(){
  try{
    if(process.env.PURCHASE_RECOVERY_ENABLED!=='true')return;
    const key=recoveryKey(process.env.PURCHASE_RECOVERY_ENCRYPTION_KEY);
    const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/androidpublisher']});
    await recoverBatch({key,packageName:String(process.env.GOOGLE_PLAY_PACKAGE_NAME||''),publisher:google.androidpublisher({version:'v3',auth}),bridge:payload=>callNakamaVerifierRpc('google_play_delivery',payload)});
  }catch(_e){console.warn('Payment recovery unavailable; durable jobs retained for retry.');}
  finally{setTimeout(runRecovery,10000).unref();}
}
