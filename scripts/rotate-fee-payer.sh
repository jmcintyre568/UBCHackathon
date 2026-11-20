#!/usr/bin/env bash
# One-time fix for checkouts deployed before the fee payer was random.
# The old fee payer was derived from a label that is in the public repo, so
# anyone could rebuild it. It is also the program's upgrade authority. This
# script makes a new random fee payer, hands it the upgrade authority, and
# moves the old key's SOL to it.
set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
mkdir -p data

rpc="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
program="DN664BTnmAuz1aJNYEJ2HHctRxgRjkRejdyjZ9pjMgvh"
old="data/fee-payer-old-public.json"
new="data/fee-payer.json"

node --input-type=module <<'JS'
import { Keypair } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const legacy = Keypair.fromSeed(createHash("sha256").update("holler-fee-payer-v1").digest());
writeFileSync("data/fee-payer-old-public.json", JSON.stringify(Array.from(legacy.secretKey)), { mode: 0o600 });

if (existsSync("data/fee-payer.json")) {
  const current = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("data/fee-payer.json", "utf8"))));
  if (!current.publicKey.equals(legacy.publicKey)) {
    console.log(`data/fee-payer.json is already a private key (${current.publicKey.toBase58()}). Keeping it.`);
  } else {
    renameSync("data/fee-payer.json", "data/fee-payer.json.bak");
  }
}
if (!existsSync("data/fee-payer.json")) {
  const payer = Keypair.generate();
  writeFileSync("data/fee-payer.json", JSON.stringify(Array.from(payer.secretKey)), { mode: 0o600 });
}
JS

old_addr="$(solana address -k "$old")"
new_addr="$(solana address -k "$new")"
echo "Old public fee payer: $old_addr"
echo "New private fee payer: $new_addr"

echo "Handing the program's upgrade authority to the new key..."
solana program set-upgrade-authority "$program" \
  --upgrade-authority "$old" \
  --new-upgrade-authority "$new" \
  --skip-new-upgrade-authority-signer-check \
  --keypair "$old" \
  --url "$rpc" || echo "Skipped: the old key is no longer the upgrade authority."

echo "Moving the old key's SOL to the new key..."
solana transfer "$new_addr" ALL \
  --from "$old" \
  --fee-payer "$old" \
  --allow-unfunded-recipient \
  --keypair "$old" \
  --url "$rpc" || echo "Skipped: nothing to move."

rm -f "$old" data/fee-payer.json.bak
solana program show "$program" --url "$rpc" | grep -i authority || true
solana balance "$new_addr" --url "$rpc"
echo "Done. Restart npm start, then reset the demo once:"
echo "  curl -X POST http://localhost:5173/api/demo/reset"
echo "The app makes a fresh demo mint owned by the new fee payer, and the embedded wallets move to keys derived from data/wallet-secret."
