import "./env.mjs";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureChain, stopChain } from "./chain.mjs";
import { hookAuthorized } from "./streams.mjs";
import { startMentionPoll } from "./mentions.mjs";
import {
  askFromMention,
  backfillSeed,
  bootstrap,
  engineStatus,
  freezeJob,
  fundJob,
  ingestStream,
  makeChecklist,
  releaseAnyway,
  requestRefund,
  resetState,
  retryJob,
  sampleJob,
  setAnnounce,
  submitJob,
  toggleFollow,
  toggleLike,
} from "./store.mjs";

const webRoot = fileURLToPath(new URL("../web/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req, limit = 100_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("That request is too large.");
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function hookOk(req) {
  const header = req.headers["x-holler-secret"] || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return hookAuthorized(header);
}

function userId(req) {
  return String(req.headers["x-holler-user"] || "maya");
}

async function handleApi(req, res, url) {
  const path = url.pathname;
  const me = userId(req);
  if (req.method === "GET" && path === "/api/health") {
    send(res, 200, { ok: true, ...engineStatus() });
    return;
  }
  if (req.method === "GET" && path === "/api/bootstrap") {
    send(res, 200, await bootstrap(me));
    return;
  }
  if (req.method === "POST" && path === "/api/demo/reset") {
    await resetState();
    send(res, 200, { ok: true });
    backfillSeed().catch(() => {});
    return;
  }
  if (req.method === "POST" && (path === "/api/hooks/quicknode" || path === "/api/hooks/x")) {
    if (!hookOk(req)) {
      send(res, 401, { error: "Bad hook secret." });
      return;
    }
    const hookBody = await readJson(req, 2_000_000);
    if (path === "/api/hooks/quicknode") send(res, 200, await ingestStream(hookBody));
    else send(res, 200, { job: await askFromMention(hookBody) });
    return;
  }
  const body = req.method === "POST" ? await readJson(req) : {};
  if (req.method === "POST" && path === "/api/me/announce") {
    send(res, 200, await setAnnounce(me, body.on));
    return;
  }
  if (req.method === "POST" && path === "/api/follow") {
    send(res, 200, await toggleFollow(me, body.creatorId));
    return;
  }
  if (req.method === "POST" && path === "/api/like") {
    send(res, 200, await toggleLike(me, body.postId));
    return;
  }
  if (req.method === "POST" && path === "/api/checklist") {
    send(res, 200, await makeChecklist(me, body));
    return;
  }
  if (req.method === "POST" && path === "/api/jobs") {
    send(res, 200, await fundJob(me, body));
    return;
  }
  const match = path.match(/^\/api\/jobs\/([^/]+)(?:\/([a-z-]+))?$/);
  if (req.method === "POST" && match) {
    const [, id, action] = match;
    if (action === "sample") send(res, 200, await sampleJob(me, id, body.mode));
    else if (action === "submit") send(res, 200, await submitJob(me, id, body));
    else if (action === "release") send(res, 200, await releaseAnyway(me, id));
    else if (action === "retry") send(res, 200, await retryJob(me, id));
    else if (action === "refund") send(res, 200, await requestRefund(me, id));
    else if (action === "freeze") send(res, 200, await freezeJob(me, id));
    else send(res, 404, { error: "Unknown action." });
    return;
  }
  send(res, 404, { error: "Not found." });
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname);
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const root = webRoot.endsWith(sep) ? webRoot : webRoot + sep;
  const file = normalize(join(root, rel));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
    return;
  }
  res.writeHead(200, {
    "content-type": types[extname(file)] || "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
}

export async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else if (req.method === "GET" || req.method === "HEAD") serveStatic(req, res, url);
    else send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    const message = error instanceof SyntaxError ? "That didn't parse." : (error.message || "Something went wrong.");
    send(res, 400, { error: message });
  }
}

export function listen(port = 0, host = "127.0.0.1") {
  const server = createServer((req, res) => {
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const port = Number(process.env.PORT || 5173);
  await ensureChain();
  const server = await listen(port, "0.0.0.0");
  const shown = server.address();
  console.log(`holler → http://localhost:${shown.port}`);
  const engine = engineStatus();
  console.log(`judge: ${engine.judge} · ledger: ${engine.chain} · streams: ${engine.streams} · announcements: ${engine.announce}`);
  backfillSeed().then((count) => {
    if (count) console.log(`[holler] ${count} seeded holds now have ${engine.chain} signatures`);
  });
  startMentionPoll(async (mention) => {
    try {
      const job = await askFromMention(mention);
      if (job) console.log(`[holler] x ask ${job.id} for @${job.creatorId}`);
    } catch (error) {
      console.warn(`[holler] x ask (${error.message})`);
    }
  });
  const shutdown = () => {
    stopChain();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
