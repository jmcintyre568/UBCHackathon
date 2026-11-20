#!/usr/bin/env bash
# Build trustlancer_escrow and deploy it to Solana devnet.
# The program address comes from a fixed label so every checkout targets the
# same program id. That key only claims the address. The fee payer, which is
# also the upgrade authority, is random and stays in data/ (gitignored).
set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
mkdir -p target/deploy data

node --input-type=module <<'JS'
import { Keypair } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const program = Keypair.fromSeed(createHash("sha256").update("holler-devnet-demo-program-v1").digest());
writeFileSync("target/deploy/trustlancer_escrow-keypair.json", JSON.stringify(Array.from(program.secretKey)));
console.log(`PROGRAM ${program.publicKey.toBase58()}`);

// The first version derived the fee payer from this public label. Never reuse it.
const legacy = Keypair.fromSeed(createHash("sha256").update("holler-fee-payer-v1").digest());
if (existsSync("data/fee-payer.json")) {
  const kept = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync("data/fee-payer.json", "utf8"))));
  if (kept.publicKey.equals(legacy.publicKey)) {
    console.error("data/fee-payer.json is the old public demo key. Run scripts/rotate-fee-payer.sh first.");
    process.exit(1);
  }
  console.log(`FEE_PAYER ${kept.publicKey.toBase58()} (kept)`);
} else {
  const payer = Keypair.generate();
  writeFileSync("data/fee-payer.json", JSON.stringify(Array.from(payer.secretKey)), { mode: 0o600 });
  console.log(`FEE_PAYER ${payer.publicKey.toBase58()} (new, random)`);
}
JS

echo "Building the program..."
cargo-build-sbf --manifest-path programs/trustlancer_escrow/Cargo.toml

so=""
for candidate in \
  target/deploy/trustlancer_escrow.so \
  target/sbf-solana-solana/release/trustlancer_escrow.so \
  target/sbpf-solana-solana/release/trustlancer_escrow.so
do
  if [[ -f "$candidate" ]]; then
    so="$candidate"
    break
  fi
done
if [[ -z "$so" ]]; then
  echo "Build finished but the .so was not found." >&2
  exit 1
fi
cp "$so" target/deploy/trustlancer_escrow.so

rpc="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"
echo "Requesting devnet SOL for the fee payer..."
for _ in 1 2 3 4 5; do
  solana airdrop 2 data/fee-payer.json --url "$rpc" && break
  sleep 2
done

echo "Deploying to devnet..."
solana program deploy target/deploy/trustlancer_escrow.so \
  --program-id target/deploy/trustlancer_escrow-keypair.json \
  --keypair data/fee-payer.json \
  --upgrade-authority data/fee-payer.json \
  --url "$rpc"

echo "Deployed. Start the app with npm start. The fee payer signs every transaction."
