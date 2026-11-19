import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  chainMode,
  deriveEscrow,
  ensureChain,
  explorerUrl,
  feePayerKeypair,
  getConnection,
  keypairFor,
  PROGRAM_ID,
  programLive,
} from "./chain.mjs";

const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const CONFIG = join(process.cwd(), "data", "cluster.json");

let mintKey = null;
let spl = null;

async function token() {
  if (!spl) spl = await import("@solana/spl-token");
  return spl;
}

function discriminator(name) {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

function u64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

export function centsToBase(cents) {
  return BigInt(cents) * 10000n;
}

function loadConfig() {
  if (!existsSync(CONFIG)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG, "utf8"));
  } catch {
    return {};
  }
}

function saveConfig(next) {
  if (process.env.HOLLER_STORE === "memory") return;
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  writeFileSync(CONFIG, JSON.stringify(next, null, 2));
}

async function send(instructions, signers) {
  const connection = getConnection();
  const feePayer = await feePayerKeypair();
  const { Transaction } = await import("@solana/web3.js");
  const tx = new Transaction();
  instructions.forEach((ix) => tx.add(ix));
  tx.feePayer = feePayer.publicKey;
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  const unique = new Map();
  for (const signer of [feePayer, ...signers]) unique.set(signer.publicKey.toBase58(), signer);
  tx.sign(...unique.values());
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}

async function sponsor(owner) {
  const connection = getConnection();
  const feePayer = await feePayerKeypair();
  const { SystemProgram, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
  const balance = await connection.getBalance(owner);
  const floor = 0.02 * LAMPORTS_PER_SOL;
  if (balance >= floor) return;
  await send([
    SystemProgram.transfer({
      fromPubkey: feePayer.publicKey,
      toPubkey: owner,
      lamports: Math.ceil(0.05 * LAMPORTS_PER_SOL),
    }),
  ], []);
}

export async function ensureMint(buyerIds = []) {
  await ensureChain();
  if (!programLive()) return null;
  if (process.env.USDC_MINT) {
    const { PublicKey } = await import("@solana/web3.js");
    mintKey = new PublicKey(process.env.USDC_MINT);
    return mintKey;
  }
  const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = await token();
  const connection = getConnection();
  const feePayer = await feePayerKeypair();
  const saved = loadConfig();
  if (!mintKey) {
    if (saved.mint && saved.cluster === chainMode()) {
      const { PublicKey } = await import("@solana/web3.js");
      mintKey = new PublicKey(saved.mint);
    } else {
      mintKey = await createMint(connection, feePayer, feePayer.publicKey, null, 6);
      saveConfig({ ...saved, cluster: chainMode(), mint: mintKey.toBase58(), programId: PROGRAM_ID });
      console.log(`[holler] demo USDC mint ${mintKey.toBase58()}`);
    }
  }
  for (const id of buyerIds) {
    const buyer = await keypairFor(id);
    const ata = await getOrCreateAssociatedTokenAccount(connection, feePayer, mintKey, buyer.publicKey);
    const target = 50_000_000_000n; // $50,000
    if (ata.amount < target) {
      await mintTo(connection, feePayer, mintKey, ata.address, feePayer, target - ata.amount);
    }
  }
  return mintKey;
}

function memoIx(feePayer, text) {
  const { PublicKey, TransactionInstruction } = requireWeb3();
  return new TransactionInstruction({
    programId: new PublicKey(MEMO_PROGRAM_ID),
    keys: [{ pubkey: feePayer, isSigner: true, isWritable: false }],
    data: Buffer.from(text.slice(0, 500)),
  });
}

let web3sync = null;
function requireWeb3() {
  if (!web3sync) throw new Error("web3 not loaded");
  return web3sync;
}

async function web3() {
  web3sync = await import("@solana/web3.js");
  return web3sync;
}

function ix(program, keys, data) {
  const { TransactionInstruction, PublicKey } = requireWeb3();
  return new TransactionInstruction({
    programId: new PublicKey(program),
    keys,
    data,
  });
}

function meta(pubkey, signer, writable) {
  return { pubkey, isSigner: signer, isWritable: writable };
}

async function offline() {
  return { cluster: chainMode() === "demo" ? "demo" : chainMode(), signature: null, explorer: null };
}

export async function onFund({ escrowId, buyerId, creatorId, cents }) {
  await ensureChain();
  if (!programLive()) return offline();
  await web3();
  const { TOKEN_PROGRAM_ID } = await token();
  const { SystemProgram } = web3sync;
  const client = await keypairFor(buyerId);
  const freelancer = await keypairFor(creatorId);
  const mint = await ensureMint([buyerId]);
  const amount = centsToBase(cents);
  const derived = await deriveEscrow(client.publicKey.toBase58(), escrowId);
  const { PublicKey } = web3sync;
  const escrow = new PublicKey(derived.escrow);
  const vault = new PublicKey(derived.vault);
  const { getAssociatedTokenAddressSync } = await token();
  await sponsor(client.publicKey);
  const clientAta = getAssociatedTokenAddressSync(mint, client.publicKey);
  const feePayer = await feePayerKeypair();
  const memo = `holler fund escrow=${derived.escrow} cents=${cents}`;
  const signature = await send([
    ix(PROGRAM_ID, [
      meta(client.publicKey, true, true),
      meta(freelancer.publicKey, false, false),
      meta(mint, false, false),
      meta(escrow, false, true),
      meta(vault, false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(SystemProgram.programId, false, false),
    ], Buffer.concat([
      discriminator("create_escrow"),
      u64(escrowId),
      u64(amount),
      Buffer.from([1, 0, 0, 0]),
      u64(amount),
    ])),
    ix(PROGRAM_ID, [
      meta(client.publicKey, true, true),
      meta(mint, false, false),
      meta(escrow, false, true),
      meta(vault, false, true),
      meta(clientAta, false, true),
      meta(TOKEN_PROGRAM_ID, false, false),
    ], discriminator("fund_escrow")),
    memoIx(feePayer.publicKey, memo),
  ], [client]);
  return { cluster: chainMode(), signature, explorer: explorerUrl(signature, chainMode()) };
}

export async function onRelease({ escrowId, buyerId, creatorId, hash }) {
  await ensureChain();
  if (!programLive()) return offline();
  await web3();
  const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = await token();
  const { SystemProgram, PublicKey } = web3sync;
  const client = await keypairFor(buyerId);
  const freelancer = await keypairFor(creatorId);
  const mint = await ensureMint([buyerId]);
  const derived = await deriveEscrow(client.publicKey.toBase58(), escrowId);
  const escrow = new PublicKey(derived.escrow);
  const vault = new PublicKey(derived.vault);
  const freelancerAta = getAssociatedTokenAddressSync(mint, freelancer.publicKey);
  const hashBytes = Buffer.from(String(hash), "hex");
  if (hashBytes.length !== 32) throw new Error("Deliverable hash must be 32 bytes.");
  await sponsor(client.publicKey);
  const feePayer = await feePayerKeypair();
  const signature = await send([
    ix(PROGRAM_ID, [
      meta(escrow, false, true),
      meta(freelancer.publicKey, true, false),
    ], Buffer.concat([discriminator("submit_milestone"), Buffer.from([0]), hashBytes])),
    ix(PROGRAM_ID, [
      meta(escrow, false, true),
      meta(client.publicKey, true, true),
      meta(freelancer.publicKey, false, false),
      meta(mint, false, false),
      meta(vault, false, true),
      meta(freelancerAta, false, true),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(SystemProgram.programId, false, false),
    ], Buffer.concat([discriminator("approve_milestone"), Buffer.from([0])])),
    memoIx(feePayer.publicKey, `holler release escrow=${derived.escrow} hash=${hash.slice(0, 16)}`),
  ], [client, freelancer]);
  return { cluster: chainMode(), signature, explorer: explorerUrl(signature, chainMode()) };
}

export async function onRefund({ escrowId, buyerId, creatorId, cents }) {
  await ensureChain();
  if (!programLive()) return offline();
  await web3();
  const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = await token();
  const { SystemProgram, PublicKey } = web3sync;
  const client = await keypairFor(buyerId);
  const freelancer = await keypairFor(creatorId);
  const mint = await ensureMint();
  const derived = await deriveEscrow(client.publicKey.toBase58(), escrowId);
  const escrow = new PublicKey(derived.escrow);
  const vault = new PublicKey(derived.vault);
  const clientAta = getAssociatedTokenAddressSync(mint, client.publicKey);
  await sponsor(client.publicKey);
  const feePayer = await feePayerKeypair();
  const signature = await send([
    ix(PROGRAM_ID, [
      meta(escrow, false, true),
      meta(client.publicKey, true, true),
      meta(freelancer.publicKey, true, true),
      meta(mint, false, false),
      meta(vault, false, true),
      meta(clientAta, false, true),
      meta(ASSOCIATED_TOKEN_PROGRAM_ID, false, false),
      meta(TOKEN_PROGRAM_ID, false, false),
      meta(SystemProgram.programId, false, false),
    ], discriminator("mutually_refund")),
    memoIx(feePayer.publicKey, `holler refund escrow=${derived.escrow} cents=${cents}`),
  ], [client, freelancer]);
  return { cluster: chainMode(), signature, explorer: explorerUrl(signature, chainMode()) };
}

export async function onFreeze({ escrowId, buyerId, actorId }) {
  await ensureChain();
  if (!programLive()) return offline();
  await web3();
  const { PublicKey } = web3sync;
  const client = await keypairFor(buyerId);
  const actor = await keypairFor(actorId);
  const derived = await deriveEscrow(client.publicKey.toBase58(), escrowId);
  const escrow = new PublicKey(derived.escrow);
  const feePayer = await feePayerKeypair();
  const signature = await send([
    ix(PROGRAM_ID, [
      meta(escrow, false, true),
      meta(actor.publicKey, true, false),
    ], discriminator("raise_dispute")),
    memoIx(feePayer.publicKey, `holler freeze escrow=${derived.escrow}`),
  ], [actor]);
  return { cluster: chainMode(), signature, explorer: explorerUrl(signature, chainMode()) };
}

export function encodeForTest() {
  return {
    create: Buffer.concat([
      discriminator("create_escrow"),
      u64(7),
      u64(28_000_000),
      Buffer.from([1, 0, 0, 0]),
      u64(28_000_000),
    ]).length,
    fund: discriminator("fund_escrow").length,
  };
}
