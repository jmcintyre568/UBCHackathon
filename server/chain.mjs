import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// The app mirrors programs/trustlancer_escrow. When a Solana RPC is reachable,
// each escrow step also lands as a memo signed by the demo fee payer, so a
// buyer never holds SOL. PDAs use the program's real seeds.

export const PROGRAM_ID = "DWf2Aht8cLrXgFwzhWVc3my1qsaVtTbxwsSz31Bh6zNS";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const LOCAL_PORT = 8901;

let web3 = null;
let connection = null;
let payer = null;
let mode = "demo";
let ready = null;
let validator = null;

async function loadWeb3() {
  if (web3) return web3;
  web3 = await import("@solana/web3.js");
  return web3;
}

export function pubkeyFor(id) {
  return loadWeb3().then(({ Keypair }) => {
    const seed = createHash("sha256").update(`holler-user:${id}`).digest();
    return Keypair.fromSeed(seed).publicKey.toBase58();
  });
}

export async function deriveEscrow(clientPubkey, numericId) {
  const { PublicKey } = await loadWeb3();
  const id = Buffer.alloc(8);
  id.writeBigUInt64LE(BigInt(numericId));
  const program = new PublicKey(PROGRAM_ID);
  const client = new PublicKey(clientPubkey);
  const [escrow] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), client.toBuffer(), id],
    program,
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), escrow.toBuffer()],
    program,
  );
  return { escrow: escrow.toBase58(), vault: vault.toBase58() };
}

function validatorBin() {
  const home = join(homedir(), ".local/share/solana/install/active_release/bin/solana-test-validator");
  if (existsSync(home)) return home;
  return null;
}

function clusterOf(url) {
  if (/devnet/i.test(url)) return "devnet";
  if (/localhost|127\.0\.0\.1/.test(url)) return "localnet";
  return "rpc";
}

async function waitForHealth(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.result === "ok") return true;
      }
    } catch {
      // validator still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function connect(url) {
  const { Connection, Keypair, LAMPORTS_PER_SOL } = await loadWeb3();
  const seed = createHash("sha256").update("holler-fee-payer-v1").digest();
  payer = Keypair.fromSeed(seed);
  connection = new Connection(url, "confirmed");
  mode = clusterOf(url);
  const balance = await connection.getBalance(payer.publicKey);
  if (balance < 0.2 * LAMPORTS_PER_SOL) {
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    } catch (error) {
      console.warn(`[holler] fee payer has no SOL (${error.message}). Memos will be skipped.`);
    }
  }
  console.log(`[holler] chain ${mode} · fee payer ${payer.publicKey.toBase58()}`);
}

export function chainMode() {
  return mode;
}

export async function ensureChain() {
  if (ready) return ready;
  ready = (async () => {
    if (process.env.HOLLER_SKIP_CHAIN === "1") return;
    const url = process.env.SOLANA_RPC_URL;
    try {
      if (url) {
        await connect(url);
        return;
      }
      const bin = validatorBin();
      if (!bin) return;
      const rpc = `http://127.0.0.1:${LOCAL_PORT}`;
      const healthy = await waitForHealth(rpc, 1);
      if (!healthy) {
        const ledger = join(process.cwd(), "data", "ledger");
        validator = spawn(bin, ["--quiet", "--bind-address", "127.0.0.1", "--rpc-port", String(LOCAL_PORT), "--ledger", ledger], {
          stdio: "ignore",
        });
        validator.on("exit", () => {
          if (mode === "localnet") {
            mode = "demo";
            connection = null;
          }
        });
        const up = await waitForHealth(rpc);
        if (!up) throw new Error("local validator did not start");
      }
      await connect(rpc);
    } catch (error) {
      mode = "demo";
      connection = null;
      console.warn(`[holler] chain unavailable (${error.message}). Using the demo ledger.`);
    }
  })();
  return ready;
}

export async function record(action, fields) {
  await ensureChain();
  if (!connection || !payer) return { cluster: "demo", signature: null };
  try {
    const { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = await loadWeb3();
    const text = [
      "holler",
      action,
      fields.escrow ? `escrow=${fields.escrow}` : "",
      fields.cents != null ? `cents=${fields.cents}` : "",
      fields.hash ? `hash=${String(fields.hash).slice(0, 16)}` : "",
    ].filter(Boolean).join(" ").slice(0, 500);
    const tx = new Transaction().add(new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM_ID),
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.from(text),
    }));
    const signature = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    return { cluster: mode, signature };
  } catch (error) {
    console.warn(`[holler] memo failed (${error.message})`);
    return { cluster: "demo", signature: null };
  }
}

export function stopChain() {
  if (validator && !validator.killed) validator.kill();
}
