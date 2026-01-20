// Pesapal API 3.0 (JSON) helper
// Uses the official endpoints documented by Pesapal Developer Community.
// Auth token is short-lived (~5 minutes), so we cache in-memory.

const BASES = {
  sandbox: "https://cybqa.pesapal.com/pesapalv3/api",
  live: "https://pay.pesapal.com/v3/api",
};

function pesapalBase() {
  const mode = (process.env.PESAPAL_MODE || "sandbox").toLowerCase();
  return process.env.PESAPAL_BASE_URL || BASES[mode] || BASES.sandbox;
}

let cachedToken = null;
let cachedTokenExpMs = 0;

async function requestToken() {
  const consumer_key = process.env.PESAPAL_CONSUMER_KEY || "";
  const consumer_secret = process.env.PESAPAL_CONSUMER_SECRET || "";
  if (!consumer_key || !consumer_secret) {
    throw new Error("PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET not configured");
  }

  const now = Date.now();
  if (cachedToken && cachedTokenExpMs - now > 20_000) return cachedToken; // keep 20s buffer

  const url = `${pesapalBase()}/Auth/RequestToken`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ consumer_key, consumer_secret }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.token) {
    throw new Error(j?.message || j?.error?.message || "Pesapal auth failed");
  }

  // expiryDate is UTC ISO string (per docs); keep a buffer.
  const exp = j?.expiryDate ? Date.parse(j.expiryDate) : now + 5 * 60_000;
  cachedToken = j.token;
  cachedTokenExpMs = Number.isFinite(exp) ? exp : now + 5 * 60_000;
  return cachedToken;
}

async function registerIpn({ url, ipn_notification_type = "GET" }) {
  const token = await requestToken();
  const r = await fetch(`${pesapalBase()}/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url, ipn_notification_type }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.status !== "200") {
    throw new Error(j?.message || j?.error?.message || "Register IPN failed");
  }
  return j;
}

async function submitOrder(payload) {
  const token = await requestToken();
  const r = await fetch(`${pesapalBase()}/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.status !== "200" || !j?.order_tracking_id || !j?.redirect_url) {
    throw new Error(j?.message || j?.error?.message || "Submit order failed");
  }
  return j;
}

async function getTransactionStatus(orderTrackingId) {
  const token = await requestToken();
  const url = `${pesapalBase()}/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(
    orderTrackingId
  )}`;
  const r = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(j?.message || j?.error?.message || "Get transaction status failed");
  }
  return j;
}

module.exports = {
  pesapalBase,
  requestToken,
  registerIpn,
  submitOrder,
  getTransactionStatus,
};
