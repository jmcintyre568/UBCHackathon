// QuickNode Streams filter for Holler escrow transactions.
// Paste this into the Stream's filter. Keep a transaction when it calls the
// escrow program or writes a holler memo. The webhook body is POSTed to
// /api/hooks/quicknode with header x-holler-secret.

const PROGRAM = "DN664BTnmAuz1aJNYEJ2HHctRxgRjkRejdyjZ9pjMgvh";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

function keep(tx) {
  const message = tx.transaction?.message;
  const keys = message?.accountKeys || [];
  const mentionsProgram = keys.some((key) => (key.pubkey || key) === PROGRAM);
  const logs = (tx.meta?.logMessages || []).join("\n");
  const mentionsMemo = logs.includes("holler fund")
    || logs.includes("holler submit")
    || logs.includes("holler release")
    || logs.includes("holler freeze")
    || logs.includes("holler refund");
  const touchesMemo = keys.some((key) => (key.pubkey || key) === MEMO) && mentionsMemo;
  return mentionsProgram || touchesMemo;
}

function main(stream) {
  const matches = [];
  for (const block of stream.data || []) {
    for (const tx of block.transactions || []) {
      if (keep(tx)) matches.push(tx);
    }
  }
  return matches.length ? { transactions: matches } : null;
}
