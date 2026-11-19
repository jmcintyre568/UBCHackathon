# Holler

Holler is Cameo with the money locked until the work is real. You ask a creator for a shoutout, or a freelancer for the edit, the page, the logo, in plain words. A judge writes the checklist you didn't know to ask for, then checks the deliverable before the escrow pays. It feels like a social app. The chain shows up on the receipt.

Built for the UBC 2026 hackathon, Consumer Applications track. The escrow is the Solana program in `programs/trustlancer_escrow`.

## Run it

```sh
npm install
npm start
```

Open http://localhost:5173. The first screen is a phone. You're Maya. No wallet install, no seed phrase. Each person has an embedded wallet the server holds, and the app pays the network fee.

By default the app uses Solana devnet. After `scripts/deploy-devnet.sh`, hold, submit, release, and refund are transactions on the escrow program, and the receipt links to the explorer. Without that deploy, the same screens run on an in-process ledger. `SETUP.md` is the list of accounts and keys for Grok, X, and QuickNode.

```sh
npm run test:app
```

That checks the checklist, the judge, a hold through release and refund, an X mention, and a QuickNode event.

## Two-minute demo

1. On Home, open Leo Park.
2. Leave the birthday note as it is and tap **Write the checklist**. Priya, nursing school, the length, and the "don't joke about her being late" line should all be there. Remove or add a line if you want.
3. Tap **Hold $28**. The dollars sit in escrow.
4. Tap **Continue** to use the phone as Leo. **Fill a take that passes**, then **Send it**.
5. The checklist turns green and the $28 releases. Open the receipt. **View on explorer** opens the devnet transaction once the program is deployed.
6. Do it once more with **Fill a take that misses**. The money stays held. Maya can pay anyway, or both people can send it back. On You, as Leo, posting to X is a toggle. It stays a draft until the X keys are set.

Switch people from the face at the top left. Priya, Noah, and Eden are there too. Eden's **Northroom** board is the light studio view: a manager assigning the same kind of hold.

## The judge and X

Set `XAI_API_KEY` and the checklist, the verdict, and the release post come from Grok (`XAI_MODEL`, default `grok-3`). If the key is missing, or Grok doesn't answer, `server/logic.mjs` is the demo judge. The screen says which one checked the work.

A creator opts in on the You page. With the four X user tokens set, that post is published. A mention of `@holler ask @leo ...` becomes a funded ask when `X_BEARER_TOKEN` is set, or when something POSTs the mention to `/api/hooks/x`.

## QuickNode

Point `SOLANA_RPC_URL` at a QuickNode devnet endpoint and stream matching transactions to `/api/hooks/quicknode`. The filter is `quicknode/filter.js`. Those deliveries update the home strip, the activity bell, and the receipt. The setup steps are in `SETUP.md`.

## Escrow

`programs/trustlancer_escrow` is an Anchor program. One escrow, up to eight milestones, SPL tokens. The app uses a single milestone per ask and follows the program's rules:

| What you do in the app | Instruction |
| --- | --- |
| Hold the price | `create_escrow`, then `fund_escrow` |
| Send work that passes | `submit_milestone`, then `approve_milestone` |
| Freeze the hold | `raise_dispute` |
| Both people send it back | `mutually_refund` |

A failed checklist does not submit on-chain. The creator can try again while the funds stay in the active escrow. The account shown on the receipt is derived with the program's seeds: `["escrow", buyer, id]`.

The program id is `DN664BTnmAuz1aJNYEJ2HHctRxgRjkRejdyjZ9pjMgvh`. It is a development program, not audited, and not for real funds. `npm test` builds it and runs the Anchor tests when the Solana and Anchor CLIs are installed. That suite does not run as part of `npm start`. Mainnet needs a new program key, a real fee-payer keypair, and the official USDC mint. `SETUP.md` has those steps. The demo seed is refused when `SOLANA_CLUSTER=mainnet-beta`.

## Money, in plain terms

Prices are USDC and shown as dollars. One dollar is one USDC. The buyer funds the whole amount before work starts. There is no platform fee in this demo. The creator is paid only when every checklist line passes, or when the buyer releases anyway. A freeze stays frozen until both people refund, which is the program's rule. Users don't hold SOL.

The demo judge can miss sarcasm or a paraphrase. Grok is the judge when a key is set, and the buyer can override a miss. This is a hackathon build. Don't put real money in it.

## Where things live

- `web/` is the phone UI.
- `server/` is the API, the demo data, the judge, and the chain notes.
- `programs/trustlancer_escrow` is the escrow program.
- `tests/` is the Anchor suite.
