# What you need to turn the demo into the live one

`npm start` runs without any of these accounts. The judge is local, X posts stay drafts, and QuickNode is idle. Devnet transactions start working after the program is deployed and the fee payer has SOL. The steps below are the ones that make Grok, X, and QuickNode real.

The program id in this repo is `DN664BTnmAuz1aJNYEJ2HHctRxgRjkRejdyjZ9pjMgvh`.

## Accounts to open

| Account | Where | What it unlocks |
| --- | --- | --- |
| xAI | https://console.x.ai/ | Grok writes the checklist, judges the deliverable, and drafts the X post |
| X developer | https://developer.x.com/ | Posting releases, and reading `@holler` mentions |
| QuickNode | https://www.quicknode.com/ | Devnet RPC, plus a Stream that pushes escrow events into the app |
| Solana devnet | public faucet or QuickNode | SOL for the fee payer so the app can pay fees and deploy |

You do not need ElevenLabs. Voice was taken out. Gemini prediction markets are not a fit for a creator escrow, so they are not wired up.

## 1. Run it with nothing

```sh
npm install
npm start
```

Open http://localhost:5173. Each demo person has an embedded wallet the server holds. The browser never sees a seed phrase. Prices are dollars. One dollar is one USDC (6 decimals on the mint).

Until the program is on devnet, holds are kept in the app ledger and the receipt says so.

## 2. Deploy the escrow program to devnet

You need Rust (1.85 or newer), the Solana CLI, and `cargo-build-sbf` from that CLI.

```sh
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
# restart the shell so `solana` and `cargo-build-sbf` are on PATH
chmod +x scripts/deploy-devnet.sh
./scripts/deploy-devnet.sh
```

The script writes two gitignored keys:

- `target/deploy/trustlancer_escrow-keypair.json` from the label `holler-devnet-demo-program-v1`. It only claims the program address, so every checkout targets the same id. Once the program exists, only the upgrade authority can change it.
- `data/fee-payer.json`, a random keypair made the first time. It pays every fee and is the program's upgrade authority. Back it up and never commit it.

It asks the devnet faucet for SOL and deploys the program. The public RPC faucet is closed, so use https://faucet.solana.com while signed in with GitHub. The script prints the fee payer's address. Request 2 SOL, twice if the deploy still says the account is short. Then run the script again.

### Deployed before Nov 20? Rotate the fee payer once

The first version derived the fee payer from the public label `holler-fee-payer-v1` (address `9DHA77NkTk5aqqDF3BpJKgZn9qXvpu19A4bDXCkFtTfi`). Anyone with the repo could rebuild it, and it is the program's upgrade authority. On the machine that deployed, run:

```sh
./scripts/rotate-fee-payer.sh
```

It makes a random `data/fee-payer.json`, hands it the upgrade authority, and moves the old key's SOL to it. Then restart `npm start` and reset the demo once (`curl -X POST http://localhost:5173/api/demo/reset`). The server makes a new demo mint for the new fee payer, and the embedded wallets move to keys derived from `data/wallet-secret`.

`npm start` then talks to `https://api.devnet.solana.com` unless `SOLANA_RPC_URL` is set. On first use it creates a 6-decimal demo mint, saves it in `data/cluster.json`, and mints a balance to the embedded buyer wallets. The fee payer is the Solana fee payer on every transaction and also tops up an embedded wallet when that wallet has to pay rent. The program still names the client as the rent payer, which is how this version of the program is written. The person using the app does not hold SOL and does not see a seed phrase.

A receipt with a signature has **View on explorer**. That link is `https://explorer.solana.com/tx/<signature>?cluster=devnet`.

## 3. Grok

1. Create a key at https://console.x.ai/.
2. Put it in `.env`:

```
XAI_API_KEY=your_key
XAI_MODEL=grok-3
```

3. Restart `npm start`.

The checklist and the verdict then come from Grok. If the call fails, the app uses the local judge and the screen says it fell back. The key stays on the server.

When a creator has posting turned on, Grok also drafts the X post. The You page toggle is **Posting finished asks**. Leo and Amina start with it on. Everyone else starts off. A release is never posted for a creator who left it off.

## 4. X

In the X developer portal, create a project and an app with Read and Write.

User tokens, for posting:

```
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
```

Those four are OAuth 1.0a user-context keys. A bearer token cannot post.

App-only bearer, for reading mentions:

```
X_BEARER_TOKEN=
X_BOT_HANDLE=holler
```

Recent search needs Basic access or higher. The server polls `@holler` and turns a post like `@holler ask @leo a 20 second birthday shoutout for Priya` into a funded ask. The same thing happens if you POST that text to `/api/hooks/x`.

Set a secret before that URL is reachable from the internet:

```
HOLLER_HOOK_SECRET=a_long_random_string
```

Send it as `x-holler-secret`. Without the secret, the hooks accept calls, which is only safe on your laptop.

`HOLLER_ANNOUNCE=off` stops posting even when the keys and the creator toggle are on. The draft still shows in the activity bell.

`GROK_BOT_WEBHOOK_URL` is optional. The same release payload is POSTed there so a bot you run elsewhere can act on it.

## 5. QuickNode Streams

This is the live feed for devnet escrow events.

1. Create an endpoint for **Solana Devnet**.
2. Copy the HTTPS URL into `.env`:

```
SOLANA_RPC_URL=https://your-endpoint.solana-devnet.quiknode.pro/your-token/
SOLANA_CLUSTER=devnet
```

3. Create a Stream on that endpoint. Use the filter in `quicknode/filter.js`. It keeps transactions that call the escrow program or write a `holler` memo. The app puts both in the same transaction: the real `create_escrow` / `fund_escrow` / `submit_milestone` / `approve_milestone` / `raise_dispute` / `mutually_refund` instruction, plus a short memo so the filter can see the amount.
4. Set the destination to a webhook. The app has to be reachable at a public URL (a tunnel is enough for the demo).

```
POST https://<your-host>/api/hooks/quicknode
x-holler-secret: <HOLLER_HOOK_SECRET or QUICKNODE_WEBHOOK_SECRET>
```

5. Restart the app.

When a stream delivery matches an escrow account, the receipt is marked from QuickNode, the home strip updates, and the activity bell gets a line. If the stream is not connected, the app still shows the signature it just sent. The bell then says Solana rather than QuickNode.

## 6. Mainnet, later

Do this only after the devnet demo is boringly reliable. Do not reuse the demo keys.

1. Generate a new program keypair. Do not use `holler-devnet-demo-program-v1`. Put the new pubkey in `declare_id!` and in `Anchor.toml`, then rebuild.
2. Create `FEE_PAYER_KEYPAIR` pointing at a fresh JSON keypair funded with real SOL. On `SOLANA_CLUSTER=mainnet-beta` the server won't generate one for you.
3. Set `USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. The server will not mint on mainnet.
4. Point `SOLANA_RPC_URL` at a QuickNode mainnet endpoint and create a mainnet Stream with the same filter, after you change `PROGRAM` inside `quicknode/filter.js` to the new program id.
5. Replace `keypairFor()` in `server/chain.mjs` with Privy, Phantom embedded, or Web3Auth. The instruction builder in `server/escrow.mjs` can stay. The demo wallets are server-held keys derived from `data/wallet-secret`, so whoever runs the server controls them. They must not hold real balances.
6. Move the program upgrade authority to a multisig. Get an audit before anyone else's money can land in it.

The product behavior does not change between clusters: dollars on screen, the app pays the network fee, and the receipt links to the explorer. Mainnet links omit `?cluster=devnet`.

## Env vars, in one list

```
XAI_API_KEY
XAI_MODEL
X_API_KEY
X_API_SECRET
X_ACCESS_TOKEN
X_ACCESS_SECRET
X_BEARER_TOKEN
X_BOT_HANDLE
X_POLL_MS
GROK_BOT_WEBHOOK_URL
HOLLER_ANNOUNCE
HOLLER_HOOK_SECRET
QUICKNODE_WEBHOOK_SECRET
SOLANA_CLUSTER
SOLANA_RPC_URL
USDC_MINT
FEE_PAYER_KEYPAIR
HOLLER_WALLET_SECRET
HOLLER_SKIP_CHAIN
HOLLER_SKIP_X
```

`.env.example` has the same names with empty values.
