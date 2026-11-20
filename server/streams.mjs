import { timingSafeEqual } from "node:crypto";

// QuickNode Streams posts matching transactions here. The same parser also
// accepts a plain event, so a local ledger and a stream fill one live feed.

const MEMO = /holler\s+(fund|submit|release|freeze|refund)\b([^"\\]*)/i;

function fromMemo(action, rest) {
  return {
    action: action.toLowerCase(),
    escrow: rest.match(/escrow=([1-9A-HJ-NP-Za-km-z]+)/)?.[1] || null,
    cents: rest.match(/cents=(\d+)/) ? Number(rest.match(/cents=(\d+)/)[1]) : null,
    hash: rest.match(/hash=([0-9a-f]+)/i)?.[1] || null,
    signature: rest.match(/sig=([1-9A-HJ-NP-Za-km-z]+)/)?.[1] || null,
    source: "quicknode",
  };
}

function explicit(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const action = String(node.action || node.type || "").toLowerCase();
  if (!["fund", "submit", "release", "freeze", "refund"].includes(action)) return null;
  if (!node.escrow && !node.escrowPda && !node.signature) return null;
  return {
    action,
    escrow: node.escrow || node.escrowPda || null,
    cents: node.cents ?? node.amountCents ?? null,
    hash: node.hash || null,
    signature: node.signature || null,
    source: "quicknode",
  };
}

// A stream transaction carries its signature next to the memo log, not in it.
function txSignature(node) {
  const signatures = node.transaction?.signatures || node.signatures;
  const first = Array.isArray(signatures) ? signatures[0] : null;
  return typeof first === "string" ? first : null;
}

export function parseStreamBody(body) {
  const found = [];
  const walk = (node, signature) => {
    if (node == null) return;
    if (typeof node === "string") {
      const match = node.match(MEMO);
      if (match) {
        const event = fromMemo(match[1], match[2] || "");
        event.signature = event.signature || signature;
        found.push(event);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child, signature));
      return;
    }
    if (typeof node === "object") {
      const own = txSignature(node) || signature;
      const event = explicit(node);
      if (event) found.push(event);
      Object.values(node).forEach((child) => walk(child, own));
    }
  };
  walk(body, null);
  const seen = new Set();
  return found.filter((event) => {
    const key = `${event.action}:${event.signature || ""}:${event.escrow || ""}:${event.cents || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hookSecret() {
  return process.env.HOLLER_HOOK_SECRET || process.env.QUICKNODE_WEBHOOK_SECRET || "";
}

export function hookSecretSet() {
  return Boolean(hookSecret());
}

// With no secret set, callers must also be local (see hookOk in index.mjs).
export function hookAuthorized(header) {
  const secret = hookSecret();
  if (!secret) return true;
  const given = Buffer.from(String(header || ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
