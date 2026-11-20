#!/usr/bin/env bash
# Build trustlancer_escrow and deploy it to Solana devnet.
# The demo program key and fee payer are derived in this script so a fresh
# checkout can deploy the same program id. Do not use these keys on mainnet.
set -euo pipefail

export PATH="${HOME}/.local/share/solana/install/active_release/bin:${HOME}/.cargo/bin:${PATH}"

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
mkdir -p target/deploy data

# Same keys as Keypair.fromSeed(sha256(label)) in server/chain.mjs. Plain
# node:crypto, so this runs on any Node 18+ without npm install.
node --input-type=module <<'EOF'
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { writeFileSync } from "node:fs";

function writeKey(name, label) {
  const seed = createHash("sha256").update(label).digest();
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const spki = createPublicKey(createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" })).export({ format: "der", type: "spki" });
  writeFileSync(name, JSON.stringify(Array.from(Buffer.concat([seed, spki.subarray(-32)]))));
}

writeKey("target/deploy/trustlancer_escrow-keypair.json", "holler-devnet-demo-program-v1");
writeKey("data/fee-payer.json", "holler-fee-payer-v1");
EOF
echo "PROGRAM   $(solana address -k target/deploy/trustlancer_escrow-keypair.json)"
echo "FEE_PAYER $(solana address -k data/fee-payer.json)"

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
if [[ "$so" != target/deploy/trustlancer_escrow.so ]]; then
  cp "$so" target/deploy/trustlancer_escrow.so
fi

# The deploy writes the program in large batches. QuickNode endpoints refuse
# those (413), so it goes through public devnet unless DEPLOY_RPC_URL says
# otherwise. The app still uses SOLANA_RPC_URL for its own transactions.
rpc="${DEPLOY_RPC_URL:-https://api.devnet.solana.com}"
payer="$(solana address -k data/fee-payer.json)"

# A first deploy holds the program rent and a same-size buffer at once. An
# upgrade only needs the buffer.
so_bytes="$(wc -c < target/deploy/trustlancer_escrow.so)"
rent="$(solana rent "$so_bytes" --lamports --url "$rpc" | awk '/Rent-exempt minimum/ {print $3}')"
# `program show` exits 0 even when the account is missing, so look for its output.
if solana program show "$(solana address -k target/deploy/trustlancer_escrow-keypair.json)" \
  --keypair data/fee-payer.json --url "$rpc" 2>/dev/null | grep -q "^Program Id"; then
  need=$(( rent + 100000000 ))
else
  need=$(( rent * 2 + 100000000 ))
fi
sol() { awk -v l="$1" 'BEGIN { printf "%.2f", l / 1e9 }'; }
have="$(solana balance "$payer" --lamports --url "$rpc" | awk '{print $1}')"
if (( have < need )); then
  echo "Requesting devnet SOL for the fee payer..."
  solana airdrop 2 "$payer" --url "$rpc" || true
  have="$(solana balance "$payer" --lamports --url "$rpc" | awk '{print $1}')"
fi
if (( have < need )); then
  echo "The fee payer $payer has $(sol "$have") SOL. The deploy needs about $(sol "$need") SOL." >&2
  echo "Request SOL at https://faucet.solana.com (sign in with GitHub) for $payer, then run this again." >&2
  exit 1
fi

echo "Deploying to devnet..."
solana program deploy target/deploy/trustlancer_escrow.so \
  --program-id target/deploy/trustlancer_escrow-keypair.json \
  --keypair data/fee-payer.json \
  --url "$rpc"

echo "Deployed. Start the app with npm start. The fee payer signs every transaction."
