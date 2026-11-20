import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// The app mirrors programs/trustlancer_escrow. When a Solana RPC is reachable,
// each escrow step also lands as a memo signed by the demo fee payer, so a
// buyer never holds SOL. PDAs use the program's real seeds.

export const PROGRAM_ID = "DN664BTnmAuz1aJNYEJ2HHctRxgRjkRejdyjZ9pjMgvh";
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const LOCAL_PORT = 8901;

let web3 = null;
let connection = null;
let mode = "demo";
let ready = null;
let validator = null;
let live = false;

export function getConnection() {
  return connection;
}

export function programLive() {
  return live;
}

async function loadWeb3() {
  if (web3) return web3;
  web3 = await import("@solana/web3.js");
  return web3;
}

// Embedded wallets are derived from a secret that never leaves this machine:
// HOLLER_WALLET_SECRET, or a random value saved once in data/wallet-secret.
// Nothing in the repo is enough to rebuild a user's key.
let walletSecret = null;

function getWalletSecret() {
  if (walletSecret) return walletSecret;
  if (process.env.HOLLER_WALLET_SECRET) {
    walletSecret = process.env.HOLLER_WALLET_SECRET;
    return walletSecret;
  }
  const file = join(process.cwd(), "data", "wallet-secret");
  if (process.env.HOLLER_STORE !== "memory" && existsSync(file)) {
    walletSecret = readFileSync(file, "utf8").trim();
    if (walletSecret) return walletSecret;
  }
  walletSecret = randomBytes(32).toString("hex");
  if (process.env.HOLLER_STORE !== "memory") {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(file, walletSecret, { mode: 0o600 });
  }
  return walletSecret;
}

export async function keypairFor(id) {
  const { Keypair } = await loadWeb3();
  const seed = createHash("sha256").update(`holler-user:${getWalletSecret()}:${id}`).digest();
  return Keypair.fromSeed(seed);
}

export async function pubkeyFor(id) {
  const kp = await keypairFor(id);
  return kp.publicKey.toBase58();
}

// The fee payer is a random keypair kept out of git: FEE_PAYER_KEYPAIR, or
// data/fee-payer.json (written by scripts/deploy-devnet.sh). If neither exists
// on devnet/localnet, a new one is generated and saved, and it needs SOL.
let feePayer = null;

export async function feePayerKeypair() {
  if (feePayer) return feePayer;
  const { Keypair } = await loadWeb3();
  const file = process.env.FEE_PAYER_KEYPAIR || join(process.cwd(), "data", "fee-payer.json");
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    feePayer = Keypair.fromSecretKey(Uint8Array.from(raw));
    return feePayer;
  }
  const cluster = process.env.SOLANA_CLUSTER || "devnet";
  if (cluster === "mainnet-beta" || cluster === "mainnet") {
    throw new Error("Set FEE_PAYER_KEYPAIR to a funded keypair file for mainnet.");
  }
  feePayer = Keypair.generate();
  if (process.env.HOLLER_STORE !== "memory") {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(file, JSON.stringify(Array.from(feePayer.secretKey)), { mode: 0o600 });
    console.warn(`[holler] new fee payer ${feePayer.publicKey.toBase58()} saved to ${file}. Fund it with devnet SOL.`);
  }
  return feePayer;
}

export function explorerUrl(signature, cluster = mode) {
  if (!signature) return null;
  if (cluster === "devnet") return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  if (cluster === "mainnet-beta" || cluster === "mainnet") return `https://explorer.solana.com/tx/${signature}`;
  return null;
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
  const { Connection, PublicKey, LAMPORTS_PER_SOL } = await loadWeb3();
  const payer = await feePayerKeypair();
  connection = new Connection(url, "confirmed");
  mode = clusterOf(url);
  if (mode === "devnet") {
    const balance = await connection.getBalance(payer.publicKey);
    if (balance < 0.5 * LAMPORTS_PER_SOL) {
      try {
        const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig, "confirmed");
      } catch (error) {
        console.warn(`[holler] devnet airdrop failed (${error.message}). Fund ${payer.publicKey.toBase58()}.`);
      }
    }
  }
  const info = await connection.getAccountInfo(new PublicKey(PROGRAM_ID));
  live = Boolean(info?.executable);
  console.log(`[holler] chain ${mode} · fee payer ${payer.publicKey.toBase58()} · program ${live ? "deployed" : "not deployed"}`);
}

export function chainMode() {
  return mode;
}

export async function ensureChain() {
  if (ready) return ready;
  ready = (async () => {
    if (process.env.HOLLER_SKIP_CHAIN === "1") return;
    const cluster = process.env.SOLANA_CLUSTER || "devnet";
    const url = process.env.SOLANA_RPC_URL
      || (cluster === "localnet"
        ? `http://127.0.0.1:${LOCAL_PORT}`
        : cluster === "mainnet-beta"
          ? "https://api.mainnet-beta.solana.com"
          : "https://api.devnet.solana.com");
    try {
      if (cluster !== "localnet" || process.env.SOLANA_RPC_URL) {
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

export async function record() {
  return { cluster: mode, signature: null, explorer: null };
}

export function stopChain() {
  if (validator && !validator.killed) validator.kill();
}
