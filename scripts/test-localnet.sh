#!/usr/bin/env bash
set -euo pipefail

wallet="target/test-wallet.json"
rpc_url="http://127.0.0.1:8899"

NO_DNA=1 anchor build --arch v0
solana-keygen new --no-bip39-passphrase --silent --force --outfile "$wallet"
ledger=$(mktemp -d target/test-ledger.XXXXXX)

solana-test-validator \
  --quiet \
  --rpc-port 8899 \
  --ledger "$ledger" &
validator_pid=$!

cleanup() {
  kill "$validator_pid" 2>/dev/null || true
  wait "$validator_pid" 2>/dev/null || true
  rm -rf "$ledger"
  rm -f "$wallet" target/deploy/trustlancer_escrow-upgrade-buffer.json
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 30); do
  if curl --silent --fail --max-time 2 \
    --header 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
    "$rpc_url" >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$validator_pid" 2>/dev/null; then
    echo "Local Solana validator exited before becoming ready." >&2
    exit 1
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "Local Solana validator did not become ready on port 8899." >&2
  exit 1
fi

test_wallet_address=$(solana address -k "$wallet")
solana airdrop 10 "$test_wallet_address" --url "$rpc_url"
NO_DNA=1 anchor deploy --provider.cluster localnet --provider.wallet "$wallet"

ANCHOR_PROVIDER_URL="$rpc_url" \
ANCHOR_WALLET="$wallet" \
  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
