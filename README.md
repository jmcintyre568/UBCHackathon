# Holler

Holler is Cameo with the money locked until the work is real. You ask a creator for a shoutout, or a freelancer for the edit, the page, the logo, in plain words. A judge writes the checklist you didn't know to ask for, then checks the deliverable before the escrow pays. It feels like a social app. The chain shows up on the receipt.

Built for the UBC 2026 hackathon, Consumer Applications track. The escrow is the Solana program in `programs/trustlancer_escrow`.

## Run it

```sh
npm install
npm start
```

Open http://localhost:5173. The first screen is a phone. You're Maya. No wallet install, no seed phrase.

If the Solana CLI is installed, the server starts a local validator and writes a memo for each hold, delivery, release, freeze, and refund. The app pays that fee. Set `HOLLER_SKIP_CHAIN=1` to stay on the in-process ledger, or `SOLANA_RPC_URL` to use a validator you already have.

```sh
npm run test:app
```

That checks the checklist, the judge, and the full hold → deliver → release path.

## Two-minute demo

1. On Home, open Leo Park.
2. Leave the birthday note as it is and tap **Write the checklist**. Priya, nursing school, the length, and the "don't joke about her being late" line should all be there. Remove or add a line if you want.
3. Tap **Hold $28**. The dollars sit in escrow.
4. Tap **Continue** to use the phone as Leo. **Fill a take that passes**, then **Send it**.
5. The checklist turns green and the $28 releases. Open the receipt. The escrow address is the program's real PDA. If a local validator is running, the note is a Solana signature.
6. Do it once more with **Fill a take that misses**. The money stays held. Maya can pay anyway, or both people can send it back.

Switch people from the face at the top left. Priya, Noah, and Eden are there too. Eden's **Northroom** board is the light studio view: a manager assigning the same kind of hold.

## The judge

Set `XAI_API_KEY` and the checklist and the verdict both come from Grok (`XAI_MODEL`, default `grok-3`) through the xAI API. The module is `server/grok.mjs`. If the key is missing, or Grok doesn't answer, `server/logic.mjs` is the demo judge: it pulls names, lengths, and don'ts out of the buyer's own words and scores the deliverable against them. The screen says which one checked the work.

## Escrow

`programs/trustlancer_escrow` is an Anchor program. One escrow, up to eight milestones, SPL tokens. The app uses a single milestone per ask and follows the program's rules:

| What you do in the app | Instruction |
| --- | --- |
| Hold the price | `create_escrow`, then `fund_escrow` |
| Send work that passes | `submit_milestone`, then `approve_milestone` |
| Freeze the hold | `raise_dispute` |
| Both people send it back | `mutually_refund` |

A failed checklist does not submit on-chain. The creator can try again while the funds stay in the active escrow. The account shown on the receipt is derived with the program's seeds: `["escrow", buyer, id]`.

The program id is `DWf2Aht8cLrXgFwzhWVc3my1qsaVtTbxwsSz31Bh6zNS`. It is a development program, not audited, and not for real funds. `npm test` builds it and runs the Anchor tests when the Solana and Anchor CLIs are installed. That suite does not run as part of `npm start`.

## Announcements

When a hold releases, Holler drafts a one-line note. It is not sent unless you configure it.

- `GROK_BOT_WEBHOOK_URL` receives a JSON payload (`escrow.released`, amount, program id, escrow address, signature) so a Grok bot can post or do something with the on-chain event.
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_SECRET` post the line to X.
- `HOLLER_ANNOUNCE=off` keeps it quiet even if those are set.

The draft shows in the activity bell either way.

## Money, in plain terms

Prices are USDC and shown as dollars. One dollar is one USDC. The buyer funds the whole amount before work starts. There is no platform fee in this demo. The creator is paid only when every checklist line passes, or when the buyer releases anyway. A freeze stays frozen until both people refund, which is the program's rule. Users don't hold SOL.

The demo judge can miss sarcasm or a paraphrase. Grok is the judge when a key is set, and the buyer can override a miss. This is a hackathon build. Don't put real money in it.

## Where things live

- `web/` is the phone UI.
- `server/` is the API, the demo data, the judge, and the chain notes.
- `programs/trustlancer_escrow` is the escrow program.
- `tests/` is the Anchor suite.
