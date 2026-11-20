import { createHmac, randomBytes } from "node:crypto";

// Optional hook for the Grok Bot bounty: when a hold releases, tell a webhook
// or post on X. Off unless configured. A failed announce never blocks payment.

export function announceMode() {
  if (process.env.HOLLER_ANNOUNCE === "off") return "off";
  const x = Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET);
  const hook = Boolean(process.env.GROK_BOT_WEBHOOK_URL);
  if (x && hook) return "x+webhook";
  if (x) return "x";
  if (hook) return "webhook";
  return "off";
}

function enc(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

async function postToX(text) {
  const url = "https://api.x.com/2/tweets";
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: randomBytes(12).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(oauth).sort().map((key) => `${enc(key)}=${enc(oauth[key])}`).join("&");
  const base = `POST&${enc(url)}&${enc(paramString)}`;
  const key = `${enc(process.env.X_API_SECRET)}&${enc(process.env.X_ACCESS_SECRET)}`;
  oauth.oauth_signature = createHmac("sha1", key).update(base).digest("base64");
  const header = `OAuth ${Object.keys(oauth).sort().map((name) => `${enc(name)}="${enc(oauth[name])}"`).join(", ")}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: header,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text: text.slice(0, 270) }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`X ${response.status}`);
  return response.json();
}

export async function announceRelease(payload) {
  const mode = announceMode();
  const text = payload.text;
  const result = { text, channel: mode, delivered: false, error: null };
  if (mode === "off") return result;
  try {
    if (process.env.GROK_BOT_WEBHOOK_URL && mode !== "x") {
      const response = await fetch(process.env.GROK_BOT_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`webhook ${response.status}`);
    }
    if (mode === "x" || mode === "x+webhook") await postToX(text);
    result.delivered = true;
  } catch (error) {
    result.error = error.message;
    console.warn(`[holler] announce failed (${error.message})`);
  }
  return result;
}
