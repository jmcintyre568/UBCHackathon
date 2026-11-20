#!/usr/bin/env bash
# Build trustlancer_escrow and deploy it to Solana devnet.
# The demo program key and fee payer are derived in this script so a fresh
# checkout can deploy the same program id. Do not use these keys on mainnet.
set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${PATH}"

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
mkdir -p target/deploy data

node --input-type=module <<'EOF'
import { Keypair } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

function writeKey(name, label) {
  const seed = createHash("sha256").update(label).digest();
  const kp = Keypair.fromSeed(seed);
  writeFileSync(name, JSON.stringify(Array.from(kp.secretKey)));
  console.log(kp.publicKey.toBase58());
}

console.log("PROGRAM");
writeKey("target/deploy/trustlancer_escrow-keypair.json", "holler-devnet-demo-program-v1");
console.log("FEE_PAYER");
writeKey("data/fee-payer.json", "holler-fee-payer-v1");
EOF

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
  --url "$rpc"

echo "Deployed. Start the app with npm start. The fee payer signs every transaction."
