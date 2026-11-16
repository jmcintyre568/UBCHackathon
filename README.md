# TrustLancer

A responsive, interactive prototype for the UBC 2026 hackathon concept: a freelance marketplace with milestone escrow and portable reputation.

## Run it

Open `index.html` in a browser. There is no build step or package install.

## Current prototype

- Freelancer workspace dashboard with contract, reputation, and discovery views.
- Project creation modal with a local demo milestone suggestion flow.
- Buttons and feedback for profile, credentials, and contract actions.
- Demo data is static and clearly presented as a test-network experience.

The milestone generator and marketplace data are currently demo placeholders. The wallet button connects to Phantom in the browser when the extension is installed; it only reads the public wallet address. It does not verify Phantom's selected cluster or submit transactions. The UI must not be presented as real escrow or onchain reputation yet.

## Next steps to make this real

1. Configure Solana Devnet and choose the escrow asset. USDC on Solana Devnet is the intended direction, subject to the test mint and token program setup.
2. Deploy a Solana program with fund, approve/release, refund, and dispute instructions; then add cluster verification and transaction signing to the Phantom connection.
3. Replace local sample data with program account reads and transaction status.
4. Add an API-backed scope parser. Keep user confirmation before any generated milestones become contract terms.
5. Add a Solana-compatible reputation attestation flow after settlement.

The team will need Phantom, Devnet SOL for transaction fees, a Solana Devnet RPC endpoint, and a deployed program ID for real chain interactions. We also need an AI API key (for example, OpenAI) to make the scope parser real; keep it server-side and never put secrets in browser code.
