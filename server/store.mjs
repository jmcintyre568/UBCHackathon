import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { announceMode, announceRelease } from "./announce.mjs";
import { chainMode, deriveEscrow, PROGRAM_ID, pubkeyFor, record } from "./chain.mjs";
import { grokChecklist, grokConfigured, grokJudge } from "./grok.mjs";
import {
  captionLines,
  cardQuote,
  checklistFromBrief,
  deliverableHash,
  evaluate,
  formatMoney,
  normalizeItem,
  sampleFor,
} from "./logic.mjs";
import { buildSeed } from "./seed.mjs";

const VERSION = 1;
let state = null;

function storeFile() {
  if (process.env.HOLLER_STORE === "memory") return null;
  return process.env.HOLLER_STORE || join(process.cwd(), "data", "state.json");
}

function save() {
  const file = storeFile();
  if (!file || !state) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state));
}

async function load() {
  const file = storeFile();
  if (file && existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed.version === VERSION) return parsed;
    } catch {
      // fall through to a fresh seed
    }
  }
  return buildSeed();
}

export async function getState() {
  if (!state) state = await load();
  return state;
}

export async function resetState() {
  state = await buildSeed();
  save();
  return state;
}

function userById(id) {
  return state.users.find((user) => user.id === id) || null;
}

function requireUser(id) {
  const user = userById(id || "maya");
  if (!user) throw new Error("That person isn't in this demo.");
  return user;
}

function jobById(id) {
  const job = state.jobs.find((entry) => entry.id === id);
  if (!job) throw new Error("That ask is gone.");
  return job;
}

function followerCount(userId) {
  const user = userById(userId);
  const real = state.follows.filter((row) => row.creatorId === userId).length;
  return (user?.audienceBase || 0) + real;
}

function publicUser(user) {
  return {
    ...user,
    followers: followerCount(user.id),
    followingCount: state.follows.filter((row) => row.followerId === user.id).length,
  };
}

export function engineStatus() {
  return {
    judge: grokConfigured() ? "grok" : "demo",
    chain: chainMode(),
    announce: announceMode(),
    programId: PROGRAM_ID,
  };
}

function activityFor(userId) {
  const items = [];
  for (const job of state.jobs) {
    if (job.buyerId !== userId && job.creatorId !== userId) continue;
    const creator = userById(job.creatorId);
    const buyer = userById(job.buyerId);
    const mine = job.buyerId === userId;
    items.push({
      at: job.createdAt,
      href: `#/job/${job.id}`,
      text: mine
        ? `You held ${formatMoney(job.amountCents)} for ${creator.first}`
        : `${buyer.first} held ${formatMoney(job.amountCents)} for you`,
    });
    if (job.releasedAt) {
      items.push({
        at: job.releasedAt,
        href: `#/receipt/${job.id}`,
        text: mine
          ? `${formatMoney(job.amountCents)} released to ${creator.first}`
          : `${formatMoney(job.amountCents)} released to you`,
      });
    }
  }
  for (const note of state.announcements) {
    if (!note.userIds?.includes(userId)) continue;
    items.push({
      at: note.at,
      href: note.href || "#/",
      text: note.delivered ? `Posted · ${note.text}` : `Draft for the bot · ${note.text}`,
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, 14);
}

export async function bootstrap(userId) {
  await getState();
  const me = requireUser(userId);
  return {
    me: publicUser(me),
    users: state.users.map(publicUser),
    posts: [...state.posts]
      .sort((a, b) => b.at - a.at)
      .map((post) => ({
        ...post,
        likeCount: state.likes.filter((row) => row.postId === post.id).length,
      })),
    jobs: state.jobs,
    following: state.follows.filter((row) => row.followerId === me.id).map((row) => row.creatorId),
    likes: state.likes.filter((row) => row.userId === me.id).map((row) => row.postId),
    activity: activityFor(me.id),
    engine: engineStatus(),
  };
}

export async function toggleFollow(userId, creatorId) {
  await getState();
  const me = requireUser(userId);
  const creator = requireUser(creatorId);
  if (me.id === creator.id) throw new Error("That's you.");
  const index = state.follows.findIndex((row) => row.followerId === me.id && row.creatorId === creator.id);
  if (index >= 0) state.follows.splice(index, 1);
  else state.follows.push({ followerId: me.id, creatorId: creator.id });
  save();
  return { following: index < 0, followers: followerCount(creator.id) };
}

export async function toggleLike(userId, postId) {
  await getState();
  const me = requireUser(userId);
  if (!state.posts.some((post) => post.id === postId)) throw new Error("That post is gone.");
  const index = state.likes.findIndex((row) => row.userId === me.id && row.postId === postId);
  if (index >= 0) state.likes.splice(index, 1);
  else state.likes.push({ postId, userId: me.id });
  save();
  const likes = state.likes.filter((row) => row.postId === postId).length;
  return { liked: index < 0, likes };
}

async function checklistFor(brief, kind, creatorName) {
  if (!grokConfigured()) {
    return { items: checklistFromBrief(brief, kind), engine: "demo", fallback: false };
  }
  try {
    const raw = await grokChecklist(brief, kind, creatorName);
    const items = raw.map((item, index) => normalizeItem(item, index)).filter(Boolean).slice(0, 7);
    if (items.length < 2) throw new Error("short checklist");
    items.forEach((item, index) => { item.id = `c${index + 1}`; });
    return { items, engine: "grok", fallback: false };
  } catch (error) {
    console.warn(`[holler] grok checklist fallback (${error.message})`);
    return { items: checklistFromBrief(brief, kind), engine: "demo", fallback: true };
  }
}

export async function makeChecklist(userId, body) {
  await getState();
  requireUser(userId);
  const creator = requireUser(body.creatorId);
  const offer = creator.offers.find((entry) => entry.id === body.offerId) || creator.offers[0];
  if (!offer) throw new Error("They aren't taking asks right now.");
  const brief = String(body.brief || "").trim();
  if (brief.length < 12) throw new Error("Say a little more so the checklist has something to hold.");
  const result = await checklistFor(brief, offer.kind, creator.name);
  return { ...result, amountCents: offer.priceCents, kind: offer.kind, title: offer.title, offerId: offer.id };
}

async function note(action, fields) {
  const chain = await record(action, fields);
  return { action, at: Date.now(), cluster: chain.cluster, signature: chain.signature };
}

export async function fundJob(userId, body) {
  await getState();
  const buyer = requireUser(userId);
  const creator = requireUser(body.creatorId);
  if (buyer.id === creator.id) throw new Error("Pick someone else.");
  const offer = creator.offers.find((entry) => entry.id === body.offerId) || creator.offers[0];
  if (!offer) throw new Error("That offer isn't open.");
  const brief = String(body.brief || "").trim();
  if (brief.length < 12) throw new Error("Say a little more so the checklist has something to hold.");
  let items = Array.isArray(body.items) ? body.items.map((item, index) => normalizeItem(item, index)).filter(Boolean) : [];
  if (items.length < 2) items = checklistFromBrief(brief, offer.kind);
  items = items.slice(0, 7);
  items.forEach((item, index) => { item.id = `c${index + 1}`; });
  const escrowId = Date.now();
  const addresses = await deriveEscrow(buyer.wallet, escrowId);
  const createdAt = Date.now();
  const job = {
    id: `j${escrowId}`,
    buyerId: buyer.id,
    creatorId: creator.id,
    offerId: offer.id,
    kind: offer.kind,
    title: offer.title,
    brief,
    items,
    amountCents: offer.priceCents,
    status: "funded",
    deliverable: null,
    verdict: null,
    refund: { buyer: false, creator: false },
    createdAt,
    releasedAt: null,
    counted: false,
    studio: buyer.id === "eden",
    checklistEngine: body.engine === "grok" ? "grok" : "demo",
    escrow: {
      id: escrowId,
      status: "active",
      totalCents: offer.priceCents,
      releasedCents: 0,
      milestone: "pending",
      hash: null,
      pda: addresses.escrow,
      vault: addresses.vault,
      client: buyer.wallet,
      freelancer: creator.wallet,
      events: [await note("fund", { escrow: addresses.escrow, cents: offer.priceCents })],
    },
  };
  state.jobs.unshift(job);
  save();
  return job;
}

export async function sampleJob(userId, jobId, mode) {
  await getState();
  const me = requireUser(userId);
  const job = jobById(jobId);
  if (me.id !== job.creatorId) throw new Error("Only the creator fills this in.");
  const creator = userById(job.creatorId);
  return sampleFor(job.items, mode === "fail" ? "fail" : "pass", { kind: job.kind, creatorName: creator.name });
}

async function judgeJob(job, text) {
  if (grokConfigured()) {
    try {
      return await grokJudge(job.brief, job.items, text);
    } catch (error) {
      console.warn(`[holler] grok judge fallback (${error.message})`);
      const verdict = evaluate(job.items, text);
      verdict.fallback = true;
      return verdict;
    }
  }
  return evaluate(job.items, text);
}

async function publish(job) {
  if (state.posts.some((post) => post.jobId === job.id)) return;
  const text = job.deliverable?.text || job.title;
  state.posts.unshift({
    id: `p${job.escrow.id}`,
    creatorId: job.creatorId,
    buyerId: job.buyerId,
    jobId: job.id,
    kind: job.kind,
    title: job.title,
    quote: cardQuote(text),
    lines: captionLines(text),
    amountCents: job.amountCents,
    at: Date.now(),
  });
}

async function releaseJob(job) {
  if (job.escrow.status !== "active") throw new Error("This hold can't be released now.");
  job.escrow.milestone = "paid";
  job.escrow.status = "completed";
  job.escrow.releasedCents = job.amountCents;
  job.escrow.hash = job.deliverable?.hash || null;
  job.escrow.events.push(await note("release", {
    escrow: job.escrow.pda,
    cents: job.amountCents,
    hash: job.escrow.hash,
  }));
  job.status = "released";
  job.releasedAt = Date.now();
  if (!job.counted) {
    const creator = userById(job.creatorId);
    creator.jobs += 1;
    creator.earnedCents += job.amountCents;
    job.counted = true;
  }
  await publish(job);
  const creator = userById(job.creatorId);
  const buyer = userById(job.buyerId);
  const text = `${creator.name} finished “${job.title}” for ${buyer.name}. ${formatMoney(job.amountCents)} released.`;
  const result = await announceRelease({
    event: "escrow.released",
    text,
    programId: PROGRAM_ID,
    escrowPda: job.escrow.pda,
    signature: job.escrow.events.at(-1)?.signature || null,
    amountCents: job.amountCents,
    checklistPassed: true,
  });
  state.announcements.unshift({
    id: `a${job.escrow.id}`,
    at: Date.now(),
    text,
    channel: result.channel,
    delivered: result.delivered,
    href: `#/receipt/${job.id}`,
    userIds: [buyer.id, creator.id],
  });
}

export async function submitJob(userId, jobId, body) {
  await getState();
  const me = requireUser(userId);
  const job = jobById(jobId);
  if (me.id !== job.creatorId) throw new Error("Only the creator can send this.");
  if (!["funded", "flagged"].includes(job.status)) throw new Error("This ask isn't open for a delivery.");
  const text = String(body.text || "").trim();
  const link = String(body.link || "").trim();
  if (text.length < 8) throw new Error("Add what you made, even a few lines.");
  const packed = [text, link].filter(Boolean).join("\n");
  const verdict = await judgeJob(job, packed);
  verdict.at = Date.now();
  job.deliverable = { text, link, hash: deliverableHash(packed), at: Date.now() };
  job.verdict = verdict;
  job.escrow.events.push(await note("submit", { escrow: job.escrow.pda, hash: job.deliverable.hash }));
  if (verdict.passed) await releaseJob(job);
  else job.status = "flagged";
  save();
  return job;
}

export async function releaseAnyway(userId, jobId) {
  await getState();
  const me = requireUser(userId);
  const job = jobById(jobId);
  if (me.id !== job.buyerId) throw new Error("Only the buyer can release this.");
  if (!job.deliverable) throw new Error("There's nothing to pay for yet.");
  if (job.status === "released") return job;
  await releaseJob(job);
  save();
  return job;
}

export async function retryJob(userId, jobId) {
  await getState();
  const me = requireUser(userId);
  const job = jobById(jobId);
  if (me.id !== job.creatorId) throw new Error("Only the creator can try again.");
  if (job.status !== "flagged") throw new Error("Nothing to redo.");
  job.status = "funded";
  job.verdict = null;
  save();
  return job;
}

async function finishRefund(job) {
  if (job.escrow.releasedCents > 0) throw new Error("This one already paid out.");
  if (!["active", "disputed"].includes(job.escrow.status)) throw new Error("This hold can't be returned.");
  job.escrow.status = "cancelled";
  job.status = "refunded";
  job.escrow.events.push(await note("refund", { escrow: job.escrow.pda, cents: job.amountCents }));
}

export async function requestRefund(userId, jobId) {
  await getState();
  const me = requireUser(userId);
  const job = jobById(jobId);
  if (me.id !== job.buyerId && me.id !== job.creatorId) throw new Error("You aren't on this ask.");
  if (["released", "refunded"].includes(job.status)) throw new Error("This ask is already settled.");
  if (me.id === job.buyerId) job.refund.buyer = true;
  if (me.id === job.creatorId) job.refund.creator = true;
  if (job.refund.buyer && job.refund.creator) await finishRefund(job);
  else if (job.status !== "disputed") job.status = "refund_requested";
  save();
  return job;
}

export async function freezeJob(userId, jobId) {
  await getState();
  const me = requireUser(userId);
  const job = jobById(jobId);
  if (me.id !== job.buyerId && me.id !== job.creatorId) throw new Error("You aren't on this ask.");
  if (job.escrow.status !== "active") throw new Error("This hold is already frozen or settled.");
  job.escrow.status = "disputed";
  job.status = "disputed";
  job.escrow.events.push(await note("freeze", { escrow: job.escrow.pda, cents: job.amountCents }));
  save();
  return job;
}

export async function ensureWallet(user) {
  if (!user.wallet) user.wallet = await pubkeyFor(user.id);
  return user.wallet;
}
