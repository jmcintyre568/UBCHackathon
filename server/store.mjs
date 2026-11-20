import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { announceMode, announceRelease } from "./announce.mjs";
import { chainMode, deriveEscrow, explorerUrl, PROGRAM_ID, programLive, pubkeyFor } from "./chain.mjs";
import { onFreeze, onFund, onRefund, onRelease } from "./escrow.mjs";
import { draftAnnouncement, grokChecklist, grokConfigured, grokJudge } from "./grok.mjs";
import { parseAskMention } from "./mentions.mjs";
import { parseStreamBody } from "./streams.mjs";
import {
  captionLines,
  checklistFromBrief,
  deliverableHash,
  evaluate,
  formatMoney,
  normalizeItem,
  sampleFor,
} from "./logic.mjs";
import { buildSeed } from "./seed.mjs";

const VERSION = 3;
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
    streams: (process.env.QUICKNODE_WEBHOOK_SECRET || /quiknode|quicknode/i.test(process.env.SOLANA_RPC_URL || "")) ? "quicknode" : "local",
    programId: PROGRAM_ID,
  };
}

function pushLive(event) {
  const labels = { fund: "Hold opened", submit: "Work sent", release: "Released", freeze: "Frozen", refund: "Returned" };
  state.live = state.live || [];
  state.live.unshift({
    ...event,
    label: `${labels[event.action] || event.action}${event.cents ? ` · ${formatMoney(event.cents)}` : ""}`,
  });
  state.live = state.live.slice(0, 30);
}

async function note(action, fields) {
  let chain = { cluster: "demo", signature: null, explorer: null };
  try {
    if (action === "fund") chain = await onFund(fields);
    else if (action === "release") chain = await onRelease(fields);
    else if (action === "refund") chain = await onRefund(fields);
    else if (action === "freeze") chain = await onFreeze(fields);
  } catch (error) {
    if (programLive()) throw new Error(`The escrow transaction failed. ${error.message}`);
    console.warn(`[holler] ${action} stayed on the demo ledger (${error.message})`);
  }
  const event = {
    action,
    at: Date.now(),
    cluster: chain.cluster || chainMode(),
    signature: chain.signature || null,
    explorer: chain.explorer || null,
    escrow: fields.escrowPda || null,
    cents: fields.cents ?? null,
    source: chain.signature ? "solana" : "ledger",
  };
  pushLive(event);
  return event;
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
  for (const event of state.live || []) {
    if (event.source !== "quicknode" || !event.escrow) continue;
    const job = state.jobs.find((entry) => entry.escrow?.pda === event.escrow);
    if (!job || (job.buyerId !== userId && job.creatorId !== userId)) continue;
    items.push({
      at: event.at,
      href: `#/receipt/${job.id}`,
      text: `${event.label} · QuickNode`,
    });
  }
  for (const note of state.announcements) {
    if (!note.userIds?.includes(userId)) continue;
    items.push({
      at: note.at,
      href: note.href || "#/",
      text: `${note.delivered ? "Posted" : note.channel === "consent" ? "Not posted" : "Draft for the bot"} · ${note.text}`,
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
    live: (state.live || []).slice(0, 8),
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
      events: [await note("fund", {
        escrowId,
        buyerId: buyer.id,
        creatorId: creator.id,
        cents: offer.priceCents,
        escrowPda: addresses.escrow,
      })],
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
  return sampleFor(job.items, mode === "fail" ? "fail" : "pass", {
    kind: job.kind === "shoutout" ? "shoutout" : "work",
    creatorName: creator.name,
  });
}

// Text that tries to steer the judge instead of being the work.
const STEERING = [
  /ignore (all |any |the |your )?(previous |prior |above )?(instructions|checklist|rules|requirements)/i,
  /mark (every|all|each)( line| item| requirement)?s? (as )?(met|passed|complete)/i,
  /"?passed"?\s*[:=]\s*true/i,
  /you are (now )?(the )?(judge|grader)/i,
  /system prompt/i,
];

function steering(text) {
  return STEERING.some((pattern) => pattern.test(text));
}

// Grok decides, but two local checks can still hold the money: text that tries
// to steer the judge, and a banned topic the local rules can see.
function guard(verdict, job, text) {
  if (steering(text)) {
    return {
      ...verdict,
      items: verdict.items.map((row) => ({ ...row, met: false, reason: "Not checked. The delivery tried to steer the judge." })),
      passed: false,
      summary: "The delivery tries to tell the judge what to decide, so the money stays held.",
      flagged: "steering",
    };
  }
  const local = evaluate(job.items, text);
  const tripped = new Set(job.items
    .filter((item) => item.rule?.type === "forbid")
    .map((item) => item.id)
    .filter((id) => local.items.find((row) => row.id === id)?.met === false));
  if (!tripped.size) return verdict;
  const items = verdict.items.map((row) => (tripped.has(row.id)
    ? { ...row, met: false, reason: local.items.find((entry) => entry.id === row.id).reason }
    : row));
  return { ...verdict, items, passed: false, summary: "It brings up something the buyer asked to leave out." };
}

async function judgeJob(job, text) {
  if (grokConfigured()) {
    try {
      return guard(await grokJudge(job.brief, job.items, text), job, text);
    } catch (error) {
      console.warn(`[holler] grok judge fallback (${error.message})`);
      const verdict = guard(evaluate(job.items, text), job, text);
      verdict.fallback = true;
      return verdict;
    }
  }
  return guard(evaluate(job.items, text), job, text);
}

function sceneFor(job) {
  const hay = `${job.title} ${job.brief}`.toLowerCase();
  if (/photo|shoot|crowd/.test(hay)) return "photos";
  if (/logo|mark|svg/.test(hay)) return "logo";
  if (/squat|form|workout/.test(hay)) return "squat";
  if (/edit|recap|caption/.test(hay)) return "edit";
  if (/song|jingle/.test(hay)) return "song";
  if (/page|website|site/.test(hay)) return "page";
  return "shoutout";
}

function feedVerdict(verdict) {
  const items = verdict?.items || [];
  const met = items.filter((item) => item.met).length;
  const missing = items.length - met;
  const passed = Boolean(verdict?.passed);
  return {
    passed,
    met,
    total: items.length,
    label: passed
      ? `Judge: ${met}/${items.length} requirements met`
      : `Judge flagged ${missing} of ${items.length} · resubmit`,
  };
}

async function publish(job) {
  if (state.posts.some((post) => post.jobId === job.id)) return;
  const creator = userById(job.creatorId);
  const buyer = userById(job.buyerId);
  const verdict = feedVerdict(job.verdict);
  const quote = `${creator.first} completed: ${job.title} for ${buyer.first}`;
  state.posts.unshift({
    id: `p${job.escrow.id}`,
    creatorId: job.creatorId,
    buyerId: job.buyerId,
    jobId: job.id,
    kind: job.kind,
    title: job.title,
    quote,
    requirements: (job.verdict?.items || job.items || []).map((item) => ({ text: item.text, met: item.met !== false })),
    verdict,
    scene: sceneFor(job),
    status: job.status,
    lines: captionLines(quote),
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
  const releaseEvent = await note("release", {
    escrowId: job.escrow.id,
    buyerId: job.buyerId,
    creatorId: job.creatorId,
    hash: job.escrow.hash,
    cents: job.amountCents,
    escrowPda: job.escrow.pda,
  });
  const submitEvent = [...job.escrow.events].reverse().find((event) => event.action === "submit");
  if (submitEvent && releaseEvent.signature) {
    submitEvent.signature = releaseEvent.signature;
    submitEvent.explorer = releaseEvent.explorer;
    submitEvent.cluster = releaseEvent.cluster;
  }
  job.escrow.events.push(releaseEvent);
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
  let text = `${creator.name} finished “${job.title}” for ${buyer.name}. ${formatMoney(job.amountCents)} released.`;
  if (creator.announce && grokConfigured()) {
    try {
      text = await draftAnnouncement({
        creator: creator.name,
        buyer: buyer.name,
        title: job.title,
        amount: formatMoney(job.amountCents),
        kind: job.kind,
      });
    } catch (error) {
      console.warn(`[holler] post draft fallback (${error.message})`);
    }
  }
  const result = creator.announce
    ? await announceRelease({
      event: "escrow.released",
      text,
      programId: PROGRAM_ID,
      escrowPda: job.escrow.pda,
      signature: job.escrow.events.at(-1)?.signature || null,
      amountCents: job.amountCents,
      checklistPassed: true,
    })
    : { text, channel: "consent", delivered: false };
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
  job.escrow.events.push({
    action: "submit",
    at: Date.now(),
    cluster: chainMode(),
    signature: null,
    explorer: null,
    escrow: job.escrow.pda,
    source: "ledger",
  });
  if (verdict.passed) {
    try {
      await releaseJob(job);
    } catch (error) {
      job.verdict = null;
      job.deliverable = null;
      job.escrow.events = job.escrow.events.filter((event) => event.action !== "submit");
      throw error;
    }
  } else job.status = "flagged";
  save();
  return job;
}

export async function setAnnounce(userId, on) {
  await getState();
  const me = requireUser(userId);
  me.announce = Boolean(on);
  save();
  return { announce: me.announce };
}

export async function askFromMention({ text, authorHandle, tweetId }) {
  await getState();
  state.mentions = state.mentions || [];
  if (tweetId && state.mentions.includes(tweetId)) return null;
  const parsed = parseAskMention(text);
  if (!parsed) throw new Error("Say who you want, like @leo, and what you want.");
  const creator = state.users.find((user) => user.handle === parsed.creatorHandle && user.offers?.length);
  if (!creator) throw new Error(`Nobody here goes by @${parsed.creatorHandle}.`);
  const author = String(authorHandle || "").replace(/^@/, "").toLowerCase();
  let buyer = state.users.find((user) => user.handle === author) || userById("maya");
  if (buyer.id === creator.id) buyer = userById("maya");
  const offer = creator.offers[0];
  const job = await fundJob(buyer.id, { creatorId: creator.id, offerId: offer.id, brief: parsed.brief });
  job.source = "x";
  if (tweetId) state.mentions.push(tweetId);
  save();
  return job;
}

export async function ingestStream(body) {
  await getState();
  const events = parseStreamBody(body);
  let added = 0;
  for (const event of events) {
    const key = `${event.action}:${event.signature || event.escrow || ""}`;
    if ((state.live || []).some((row) => row.source === "quicknode" && `${row.action}:${row.signature || row.escrow || ""}` === key)) continue;
    const job = state.jobs.find((entry) => event.escrow && entry.escrow?.pda === event.escrow);
    if (job) {
      const row = [...job.escrow.events].reverse().find((entry) => entry.action === event.action);
      if (row) {
        if (event.signature && !row.signature) {
          row.signature = event.signature;
          row.explorer = explorerUrl(event.signature, "devnet");
          row.cluster = "devnet";
        }
        row.stream = "quicknode";
      }
      job.escrow.stream = "quicknode";
    }
    pushLive({
      action: event.action,
      at: Date.now(),
      cluster: chainMode(),
      signature: event.signature || null,
      explorer: event.signature ? explorerUrl(event.signature, chainMode()) : null,
      escrow: event.escrow,
      cents: event.cents,
      source: "quicknode",
    });
    added += 1;
  }
  save();
  return { added };
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
  job.escrow.events.push(await note("refund", {
    escrowId: job.escrow.id,
    buyerId: job.buyerId,
    creatorId: job.creatorId,
    cents: job.amountCents,
    escrowPda: job.escrow.pda,
  }));
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
  job.escrow.events.push(await note("freeze", {
    escrowId: job.escrow.id,
    buyerId: job.buyerId,
    actorId: me.id,
    cents: job.amountCents,
    escrowPda: job.escrow.pda,
  }));
  save();
  return job;
}

export async function ensureWallet(user) {
  if (!user.wallet) user.wallet = await pubkeyFor(user.id);
  return user.wallet;
}
