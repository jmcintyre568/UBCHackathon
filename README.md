# TrustLancer

A responsive, interactive prototype for the UBC 2026 hackathon concept: a freelance marketplace with milestone escrow and portable reputation.

## Run it

Open `index.html` in a browser. There is no build step or package install.

## Solana escrow program scaffold

The `programs/trustlancer_escrow` Anchor program is the first onchain implementation step. It defines an SPL token escrow with up to eight ordered milestones, funding, freelancer submission by deliverable hash, client approval and release, dispute freeze, and a mutual refund that requires both parties to sign.

This is a development scaffold, not audited and not suitable for real funds. Disputes deliberately freeze the remaining funds; there is no arbitrator resolution or timeout/refund policy yet. The program accepts the original SPL Token Program and stores the selected mint, but does not enforce a canonical USDC mint.

The program ID is generated for this project and must stay synchronized between `Anchor.toml`, `programs/trustlancer_escrow/src/lib.rs`, and the ignored `target/deploy/trustlancer_escrow-keypair.json`. Do not commit or share private key files.

### Run escrow integration tests

Install Node.js, npm, the Solana CLI, Rust, and Anchor CLI. Then run:

```sh
npm install
npm test
```

The test command builds the program, starts a temporary local validator, deploys there, and runs tests for invalid milestone totals, ordered payouts, token accounting, and mutual refunds. It creates and removes a disposable test wallet and ledger under the ignored `target/` directory. It does not deploy to Devnet.

## Current prototype

- Freelancer workspace dashboard with contract, reputation, and discovery views.
- Project creation modal with a local demo milestone suggestion flow.
- Buttons and feedback for profile, credentials, and contract actions.
- Demo data is static and clearly presented as a test-network experience.

The milestone generator and marketplace data are currently demo placeholders. The wallet button connects to Phantom in the browser when the extension is installed and reads that address's SOL balance from the configured Solana Devnet RPC. It does not verify Phantom's selected cluster or submit transactions. The UI must not be presented as real escrow or onchain reputation yet.

## Next steps to make this real

1. Expand tests to cover authorization, disputes, and additional invalid transitions.
2. Add a trusted Devnet USDC mint allowlist and a clearly defined dispute-resolution/timeout policy before deploying.
3. Deploy to Solana Devnet and connect the frontend to the generated IDL for create, fund, submit, approve, dispute, and refund transactions.
4. Replace local sample data with program account reads and transaction status.
5. Add an API-backed scope parser and a Solana-compatible reputation attestation flow after settlement.

The current balance read uses Solana's public Devnet RPC and needs no API key. To build/deploy, the team will need Rust, Solana CLI, Anchor CLI, Phantom, Devnet SOL, and a project-owned program keypair. To make the scope parser real, we will also need an AI API key; keep it server-side and never put secrets in browser code.
