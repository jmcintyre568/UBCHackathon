// QuickNode Streams filter for Holler escrow transactions.
// Stream: Solana Devnet, dataset Block, destination Webhook
//   https://<your-server>/api/hooks/quicknode  with header  x-holler-secret: <HOLLER_HOOK_SECRET>
//
// Keeps a transaction only when it succeeded and called the escrow program.
// A memo on its own is not enough, since anyone can write a "holler ..." memo.
// Each match is sent as one small event: action, escrow account, amount, and
// the transaction signature, so the receipt can link to the explorer.

const PROGRAM = "DN664BTnmAuz1aJNYEJ2HHctRxgRjkRejdyjZ9pjMgvh";
const MEMO = /holler\s+(fund|submit|release|freeze|refund)\b([^"\\]*)/i;

function keyOf(key) {
  return typeof key === "string" ? key : key && key.pubkey;
}

function eventsFrom(tx, block) {
  if (!tx || !tx.meta || tx.meta.err) return [];
  const message = tx.transaction && tx.transaction.message;
  const keys = ((message && message.accountKeys) || []).map(keyOf);
  if (!keys.includes(PROGRAM)) return [];
  const signature = tx.transaction.signatures && tx.transaction.signatures[0];
  const events = [];
  for (const line of tx.meta.logMessages || []) {
    const match = line.match(MEMO);
    if (!match) continue;
    const rest = match[2] || "";
    const escrow = rest.match(/escrow=([1-9A-HJ-NP-Za-km-z]+)/);
    const cents = rest.match(/cents=(\d+)/);
    events.push({
      action: match[1].toLowerCase(),
      escrow: escrow ? escrow[1] : null,
      cents: cents ? Number(cents[1]) : null,
      signature,
      slot: block.slot,
      blockTime: block.blockTime,
    });
  }
  return events;
}

function main(stream) {
  const blocks = Array.isArray(stream.data) ? stream.data : [stream.data];
  const events = [];
  for (const block of blocks) {
    if (!block) continue;
    for (const tx of block.transactions || []) events.push(...eventsFrom(tx, block));
  }
  return events.length ? { events } : null;
}
