const local = {
  ask: null,
  texts: {},
  query: "",
  filter: "all",
  judging: null,
  celebrate: null,
  skip: false,
  route: "",
};
let db = null;

const ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10.8V20h11V10.8"/>',
  people: '<circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.2"/><path d="M3.8 19c.6-2.5 2.6-4 5.2-4s4.6 1.5 5.2 4"/><path d="M14 15.4c1.5-.4 3 .1 4 1.5"/>',
  asks: '<rect x="6" y="3.5" width="12" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  you: '<circle cx="12" cy="9" r="3.2"/><path d="M5 19.5c1.1-3 3.4-4.5 7-4.5s5.9 1.5 7 4.5"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.4 2H4.6L6 16z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  play: '<path d="M9 7.2v9.6l8.2-4.8L9 7.2z"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function money(cents) {
  const value = Math.abs(Number(cents) || 0);
  const dollars = Math.floor(value / 100);
  const rem = value % 100;
  const body = rem
    ? `${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`
    : dollars.toLocaleString("en-US");
  return `${cents < 0 ? "-" : ""}$${body}`;
}

function ago(ts) {
  const minutes = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 14 ? `${days}d` : `${Math.round(days / 7)}w`;
}

function shortKey(value) {
  const text = String(value || "");
  if (text.length < 12) return text;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function person(id) {
  return db.users.find((entry) => entry.id === id);
}

function route() {
  const parts = (location.hash || "#/").replace(/^#/, "").split("/").filter(Boolean);
  const name = parts[0] || "feed";
  const known = ["feed", "people", "asks", "you", "u", "ask", "job", "post", "receipt", "studio", "how"];
  if (!parts.length) return { name: "feed" };
  if (name === "u") return { name: "profile", id: parts[1] };
  if (!known.includes(name)) return { name: "feed" };
  return { name, id: parts[1], offer: parts[2] };
}

function needsYou(job, me = db.me) {
  const creator = job.creatorId === me.id;
  const buyer = job.buyerId === me.id;
  if (!creator && !buyer) return false;
  if (job.status === "funded" && creator) return true;
  if (job.status === "flagged") return true;
  if (job.status === "refund_requested" || job.status === "disputed") {
    if (creator && !job.refund.creator) return true;
    if (buyer && !job.refund.buyer) return true;
  }
  return false;
}

function statusMeta(status) {
  return {
    funded: ["Held", "held"],
    flagged: ["Needs a fix", "bad"],
    refund_requested: ["Refund asked", "bad"],
    disputed: ["Frozen", "bad"],
    released: ["Paid", "paid"],
    refunded: ["Returned", "muted"],
  }[status] || [status, "muted"];
}

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-holler-user": localStorage.getItem("holler-user") || "maya",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function closeSheet() {
  const sheet = document.getElementById("sheet");
  if (!sheet) return;
  sheet.hidden = true;
  sheet.innerHTML = "";
}

function openSheet(html) {
  const sheet = document.getElementById("sheet");
  sheet.innerHTML = `<div class="sheet-card"><div class="grab"></div>${html}</div>`;
  sheet.hidden = false;
}

function avatar(who, size = "") {
  if (!who) return "";
  return `<span class="avatar ${size}" style="--h:${who.hue}">${esc(who.initials)}</span>`;
}

function appbar() {
  return `<header class="appbar">
    <button class="who" data-act="who" type="button">${avatar(db.me, "sm")}<span>${esc(db.me.first)}</span></button>
    <p class="brand">holler</p>
    <button class="iconbtn" data-act="activity" type="button" aria-label="Activity">${icon("bell")}</button>
  </header>`;
}

function backbar(href, title) {
  return `<header class="backbar">
    <a class="iconbtn" href="${href}" aria-label="Back">${icon("back")}</a>
    <h1>${esc(title || "")}</h1>
    <span></span>
  </header>`;
}

function tabbar() {
  const count = db.jobs.filter((job) => needsYou(job)).length;
  const current = route().name === "feed" ? "home" : route().name;
  const tabs = [
    ["home", "#/", "Home"],
    ["people", "#/people", "People"],
    ["asks", "#/asks", "Asks"],
    ["you", "#/you", "You"],
  ];
  return `<nav class="tabbar" aria-label="Main">${tabs.map(([name, href, label]) => {
    const on = (name === "home" && current === "home") || name === current;
    return `<a href="${href}" class="${on ? "on" : ""}">${icon(name === "home" ? "home" : name)}${label === "Asks" && count ? `<i class="dot">${count}</i>` : ""}<span>${label}</span></a>`;
  }).join("")}</nav>`;
}

function frame({ back, title, body, dock = "", tabs = !back }) {
  return `${back ? backbar(back, title) : appbar()}<main class="view" id="view">${body}</main>${dock}${tabs ? tabbar() : ""}<div id="toast" role="status"></div><div id="sheet" hidden></div>`;
}

function banner() {
  const job = db.jobs.find((entry) => needsYou(entry));
  if (!job) return "";
  const other = person(job.creatorId === db.me.id ? job.buyerId : job.creatorId);
  const label = job.creatorId === db.me.id ? `${other.first} asked you` : `A decision on ${other.first}`;
  return `<a class="banner" href="#/job/${job.id}"><span>${esc(label)}</span><b>${money(job.amountCents)} held</b></a>`;
}

function stories() {
  const followed = db.following.map(person).filter((who) => who?.offers?.length);
  const rest = db.users.filter((who) => who.offers?.length && !db.following.includes(who.id));
  return [...followed, ...rest].slice(0, 8).map((who) => `
    <a class="story" href="#/u/${who.id}">${avatar(who, "lg")}<small>${esc(who.first)}</small></a>`).join("");
}

function clip(post) {
  const creator = person(post.creatorId);
  const foot = `${avatar(creator, "sm")}<span><b>${esc(creator.first)}</b><small>${esc(post.title)}</small></span><em class="paid">Paid ${money(post.amountCents)}</em>`;
  if (post.kind === "work") {
    return `<a class="work-card" href="#/post/${post.id}"><p class="kicker">The work</p><h3>${esc(post.quote)}</h3><p>${esc(post.title)}</p><div class="card-foot">${foot}</div></a>`;
  }
  return `<a class="clip" href="#/post/${post.id}" style="--h:${creator.hue}"><span class="play icon-play">${icon("play")}</span><blockquote>${esc(post.quote)}</blockquote><div class="card-foot">${foot}</div></a>`;
}

function liveStrip() {
  const item = (db.live || [])[0];
  if (!item) return "";
  const where = item.source === "quicknode" ? "QuickNode" : item.signature ? "Solana" : "Ledger";
  return `<p class="live"><i></i>${esc(item.label)} <small>${esc(where)}</small></p>`;
}

function renderFeed() {
  return frame({
    body: `<h1 class="display">Ask someone.</h1><p class="lede">Pay when it's done.</p>${liveStrip()}<div class="stories">${stories()}</div>${banner()}<div class="feed">${db.posts.map(clip).join("")}</div>`,
  });
}

function peopleRows() {
  const query = local.query.trim().toLowerCase();
  return db.users.filter((who) => {
    if (!who.offers?.length) return false;
    if (local.filter === "camera" && !who.offers.some((offer) => offer.kind === "shoutout")) return false;
    if (local.filter === "work" && !who.offers.some((offer) => offer.kind === "work")) return false;
    if (!query) return true;
    const hay = `${who.name} ${who.city} ${who.bio} ${(who.tags || []).join(" ")} ${who.offers.map((offer) => offer.title).join(" ")}`.toLowerCase();
    return hay.includes(query);
  }).map((who) => {
    const offer = who.offers[0];
    const on = db.following.includes(who.id);
    return `<div class="person">
      <a class="who-link" href="#/u/${who.id}">${avatar(who)}<span><b>${esc(who.name)}</b><small>${esc(offer.title)} · ${esc(offer.eta)}</small></span></a>
      <b class="price">${money(offer.priceCents)}</b>
      <button class="follow ${on ? "on" : ""}" type="button" data-act="follow" data-id="${who.id}">${on ? "Following" : "Follow"}</button>
    </div>`;
  }).join("") || `<p class="empty">No one by that name.</p>`;
}

function renderPeople() {
  const filters = [["all", "Everyone"], ["camera", "On camera"], ["work", "The work"]];
  return frame({
    body: `<h1 class="display">People.</h1><input class="search" id="q" type="search" placeholder="Search" aria-label="Search people" /><div class="chips">${filters.map(([id, label]) => `<button class="chip ${local.filter === id ? "on" : ""}" type="button" data-act="filter" data-filter="${id}">${label}</button>`).join("")}</div><div id="people-list">${peopleRows()}</div>`,
  });
}

function renderProfile(id) {
  const who = person(id);
  if (!who) return frame({ back: "#/people", title: "Profile", body: `<p class="empty">Nobody here.</p>`, tabs: false });
  const posts = db.posts.filter((post) => post.creatorId === who.id);
  const mine = who.id === db.me.id;
  const following = db.following.includes(who.id);
  const offer = who.offers[0];
  return frame({
    back: "#/people",
    title: who.first,
    tabs: false,
    body: `<div class="profile-head">${avatar(who, "xl")}<h2>${esc(who.name)}</h2><p class="muted">@${esc(who.handle)} · ${esc(who.city)}</p><p>${esc(who.bio)}</p></div>
      ${offer ? `<div class="pair"><button class="follow ${following || mine ? "on" : ""}" type="button" data-act="follow" data-id="${who.id}" ${mine ? "disabled" : ""}>${mine ? "This is you" : following ? "Following" : "Follow"}</button>${mine ? "" : `<a class="btn primary" href="#/ask/${who.id}">Ask · ${money(offer.priceCents)}</a>`}</div>` : ""}
      ${who.offers.length ? `<div class="stats"><div class="stat"><b>${who.jobs}</b><span>jobs</span></div><div class="stat"><b data-followers="${who.id}">${who.followers.toLocaleString("en-US")}</b><span>followers</span></div><div class="stat"><b>${who.onTime}%</b><span>on time</span></div></div>
      <section class="panel"><p class="kicker">Portable record</p><p>It stays with this account, not with an app.</p><div class="copyline"><code>${esc(shortKey(who.wallet))}</code><button class="btn text" type="button" data-act="copy" data-copy="${esc(who.wallet)}">Copy</button></div></section>` : `<p class="fine">${esc(who.first)} follows ${who.followingCount} people.</p>`}
      ${posts.length ? `<p class="kicker">Recent</p>${posts.map(clip).join("")}` : ""}`,
  });
}

function ensureAsk(creator, offerId) {
  const picked = creator.offers.find((entry) => entry.id === offerId);
  if (!local.ask || local.ask.creatorId !== creator.id || (picked && local.ask.offerId !== picked.id && !local.ask.dirty && !local.ask.items)) {
    const offer = picked || creator.offers[0];
    local.ask = {
      creatorId: creator.id,
      offerId: offer.id,
      brief: offer.prompt || "",
      items: null,
      engine: null,
      fallback: false,
      error: "",
      busy: false,
      dirty: false,
      reveal: false,
    };
  }
  return local.ask;
}

function renderAsk(id) {
  const creator = person(id);
  if (!creator?.offers?.length) return frame({ back: "#/people", title: "Ask", body: `<p class="empty">They aren't taking asks.</p>`, tabs: false });
  const draft = ensureAsk(creator, route().offer);
  const offer = creator.offers.find((entry) => entry.id === draft.offerId) || creator.offers[0];
  const checks = draft.items ? `<div id="checks"><p class="kicker">${draft.engine === "grok" ? "Written by Grok" : "Demo judge"}</p><p class="fine">These lines release the money.</p>${draft.items.map((item) => `<div class="check"><span><b>${esc(item.text)}</b></span><button class="x" type="button" data-act="drop" data-id="${esc(item.id)}" aria-label="Remove line">×</button></div>`).join("")}<form class="add-line" id="add-line"><input name="line" type="text" placeholder="Add a line" aria-label="Add a checklist line" /><button class="btn" type="submit">Add</button></form></div>` : "";
  const dock = draft.items ? `<div class="dock"><div><small>${esc(offer.title)}</small><b>${money(offer.priceCents)}</b></div><button class="btn primary" type="button" data-act="hold" ${draft.busy || draft.items.length < 2 ? "disabled" : ""}>${draft.busy ? "Holding…" : `Hold ${money(offer.priceCents)}`}</button></div>` : "";
  return frame({
    back: `#/u/${creator.id}`,
    title: creator.first,
    tabs: false,
    dock,
    body: `<p class="kicker">${esc(creator.city)}</p><h2 class="display" style="font-size:34px">${esc(creator.first)}</h2>
      <div class="chips">${creator.offers.map((entry) => `<button class="chip ${entry.id === offer.id ? "on" : ""}" type="button" data-act="offer" data-offer="${entry.id}">${esc(entry.title)} · ${money(entry.priceCents)}</button>`).join("")}</div>
      <label class="kicker" for="brief">What do you want?</label>
      <textarea id="brief" placeholder="Plain words are enough."></textarea>
      <p class="fine">The checklist asks for the parts that are easy to forget.</p>
      ${draft.error ? `<p class="warn">${esc(draft.error)}</p>` : ""}
      ${draft.items ? `<button class="btn text" type="button" data-act="checklist">Rewrite the checklist</button>` : `<button class="btn primary block" type="button" data-act="checklist" ${draft.busy ? "disabled" : ""}>${draft.busy ? "Writing…" : "Write the checklist"}</button>`}
      ${checks}`,
  });
}

function checklistView(job, verdict) {
  const rows = verdict ? verdict.items : job.items.map((item) => ({ ...item, met: null, reason: "" }));
  return rows.map((item) => {
    const cls = item.met == null ? "" : item.met ? "ok" : "no";
    const tick = item.met == null ? "·" : item.met ? "✓" : "×";
    return `<div class="check ${cls}"><i class="tick">${tick}</i><span><b>${esc(item.text)}</b>${item.reason ? `<small>${esc(item.reason)}</small>` : ""}</span></div>`;
  }).join("");
}

function judgeLabel(verdict) {
  if (verdict?.engine === "grok") return "Grok checked it";
  if (verdict?.fallback) return "Grok didn't answer. The demo judge checked it.";
  return "Demo judge";
}

function renderJob(id) {
  const job = db.jobs.find((entry) => entry.id === id);
  if (!job) return frame({ back: "#/asks", title: "Ask", body: `<p class="empty">That ask is gone.</p>`, tabs: false });
  if (local.judging === job.id) {
    const label = db.engine.judge === "grok" ? "Grok is reading the checklist" : "Checking the checklist";
    return frame({
      back: "#/asks",
      title: job.title,
      tabs: false,
      body: `<div class="checking"><div class="pulse"></div><h2>${label}</h2><p class="lede">The hold stays put until this is done.</p></div>`,
    });
  }
  const buyer = person(job.buyerId);
  const creator = person(job.creatorId);
  const mine = db.me.id === buyer.id ? "buyer" : db.me.id === creator.id ? "creator" : "other";
  const [label, tone] = statusMeta(job.status);
  const passed = job.verdict?.passed;
  const burst = local.celebrate === job.id && job.status === "released"
    ? `<div class="burst">${Array.from({ length: 10 }, (_, i) => `<i style="--a:${i * 36}deg;--d:${i * 0.03}s"></i>`).join("")}</div>`
    : "";
  let actions = "";
  let dock = "";
  if (mine === "creator" && (job.status === "funded" || (job.status === "flagged" && !job.verdict))) {
    actions = `<label class="kicker" for="note">What did you make?</label><textarea id="note" data-job="${job.id}" placeholder="The words you said, or what you handed over."></textarea>
      <div class="sample-row"><button class="btn text" type="button" data-act="sample" data-mode="pass" data-id="${job.id}">Fill a take that passes</button><button class="btn text" type="button" data-act="sample" data-mode="fail" data-id="${job.id}">Fill a take that misses</button></div>`;
    dock = `<div class="dock"><div><small>Send to ${esc(buyer.first)}</small><b>${money(job.amountCents)}</b></div><button class="btn primary" type="button" data-act="send" data-id="${job.id}">Send it</button></div>`;
  } else if (mine === "buyer" && job.status === "funded") {
    actions = `<p class="fine">Same phone, their side of the ask.</p><button class="btn text" type="button" data-act="refund" data-id="${job.id}">Ask for the money back</button>`;
    dock = `<div class="dock"><div><small>Open their side</small><b>${esc(creator.first)}</b></div><button class="btn primary" type="button" data-act="become" data-id="${creator.id}" data-hash="#/job/${job.id}">Continue</button></div>`;
  } else if (job.status === "flagged") {
    if (mine === "creator") actions += `<button class="btn primary block" type="button" data-act="retry" data-id="${job.id}">Try another take</button>`;
    if (mine === "buyer") actions += `<button class="btn primary block" type="button" data-act="release" data-id="${job.id}">Pay ${esc(creator.first)} anyway</button><button class="btn text" type="button" data-act="refund" data-id="${job.id}">Ask for the money back</button>`;
  } else if (job.status === "refund_requested" || job.status === "disputed") {
    const agreed = mine === "buyer" ? job.refund.buyer : job.refund.creator;
    actions = agreed
      ? `<p class="fine">Waiting on the other person.</p>`
      : `<button class="btn primary block" type="button" data-act="refund" data-id="${job.id}">Send the money back</button>`;
  }
  if (["funded", "flagged", "refund_requested"].includes(job.status) && mine !== "other") {
    actions += `<button class="btn text" type="button" data-act="freeze" data-id="${job.id}">Freeze the hold</button>`;
  }
  const headline = job.status === "released"
    ? (mine === "creator" ? "Released to you" : `Released to ${creator.first}`)
    : job.status === "flagged"
      ? "Not yet"
      : job.status === "refunded"
        ? `Returned to ${buyer.first}`
        : job.status === "disputed"
          ? "Frozen"
          : (mine === "creator" ? `${buyer.first} asked you` : `Held for ${creator.first}`);
  const sub = job.status === "released"
    ? "Every line was covered."
    : job.status === "flagged"
      ? `${money(job.amountCents)} stays held.`
      : job.verdict?.summary || "It stays held until the checklist is covered.";
  const post = db.posts.find((entry) => entry.jobId === job.id);
  return frame({
    back: "#/asks",
    title: job.title,
    tabs: false,
    dock,
    body: `${burst}<p class="tag ${tone}">${label}</p><div class="hero-money">${money(job.amountCents)}</div><h2 style="margin:0 0 8px">${esc(headline)}</h2><p class="lede">${esc(job.status === "flagged" || job.status === "released" ? sub : job.brief)}</p>
      ${job.verdict ? `<p class="fine">${esc(judgeLabel(job.verdict))}. ${esc(job.verdict.summary)}</p>` : ""}
      ${checklistView(job, job.verdict)}
      <div style="height:12px"></div>
      ${actions}
      ${job.status === "released" ? `<a class="btn ghost block" href="#/receipt/${job.id}">View receipt</a>${post ? `<a class="btn text" href="#/post/${post.id}">See it on the feed</a>` : ""}` : ""}
      ${mine === "other" ? `<p class="fine">You're not on this ask.</p>` : ""}`,
  });
}

function renderPost(id) {
  const post = db.posts.find((entry) => entry.id === id);
  if (!post) return frame({ back: "#/", title: "Post", body: `<p class="empty">That one's gone.</p>`, tabs: false });
  const creator = person(post.creatorId);
  const buyer = person(post.buyerId);
  const liked = db.likes.includes(post.id);
  const likes = post.likeCount || 0;
  return frame({
    back: "#/",
    title: creator.first,
    tabs: false,
    body: `<div class="stage-card" style="--h:${creator.hue}"><button class="play icon-play" type="button" data-act="play" data-id="${post.id}" aria-label="Play">${icon("play")}</button><p class="caption" id="caption">${esc(post.quote)}</p><div class="bar"><span id="playbar"></span></div></div>
      <div class="row"><div class="who-link">${avatar(creator)}<span><b>${esc(creator.name)}</b><small>for ${esc(buyer?.first || "someone")} · ${ago(post.at)}</small></span></div><button class="follow ${liked ? "on" : ""}" type="button" data-act="like" data-id="${post.id}" data-likes="${likes}">${liked ? "Liked" : "Like"} <span data-like-count>${likes || ""}</span></button></div>
      <p class="fine" style="margin-top:12px">${esc(post.title)} · Paid ${money(post.amountCents)}</p>`,
  });
}

function renderReceipt(id) {
  const job = db.jobs.find((entry) => entry.id === id);
  if (!job) return frame({ back: "#/asks", title: "Receipt", body: `<p class="empty">No receipt.</p>`, tabs: false });
  const buyer = person(job.buyerId);
  const creator = person(job.creatorId);
  const signed = [...job.escrow.events].reverse().find((event) => event.signature);
  const cluster = signed?.cluster || job.escrow.events.at(-1)?.cluster || "demo";
  const clusterName = { localnet: "Solana local validator", devnet: "Solana devnet", rpc: "Solana" }[cluster] || "Demo ledger";
  const steps = [["fund", "Hold", "fund escrow"], ["submit", "Deliver", "submit milestone"], ["release", "Release", "approve milestone"], ["freeze", "Freeze", "raise dispute"], ["refund", "Return", "mutual refund"]];
  const done = new Set(job.escrow.events.map((event) => event.action));
  const sig = signed?.signature;
  return frame({
    back: `#/job/${job.id}`,
    title: "Receipt",
    tabs: false,
    body: `<p class="kicker">${esc(clusterName)}</p><div class="hero-money">${money(job.amountCents)}</div><p class="lede">${esc(buyer.first)} → ${esc(creator.first)}</p>
      <section class="panel"><p class="kicker">Program</p><p>trustlancer escrow</p><div class="copyline"><code>${esc(shortKey(db.engine.programId))}</code><button class="btn text" type="button" data-act="copy" data-copy="${esc(db.engine.programId)}">Copy</button></div>
        <p class="kicker">Escrow account</p><div class="copyline"><code>${esc(shortKey(job.escrow.pda))}</code><button class="btn text" type="button" data-act="copy" data-copy="${esc(job.escrow.pda)}">Copy</button></div>
        ${job.escrow.hash ? `<p class="kicker">Deliverable</p><div class="copyline"><code>${esc(shortKey(job.escrow.hash))}</code><button class="btn text" type="button" data-act="copy" data-copy="${esc(job.escrow.hash)}">Copy</button></div>` : ""}
        <p class="kicker">Transaction</p>${sig ? `<div class="copyline"><code>${esc(shortKey(sig))}</code><button class="btn text" type="button" data-act="copy" data-copy="${esc(sig)}">Copy</button></div>${signed.explorer ? `<a class="btn primary block" href="${esc(signed.explorer)}" target="_blank" rel="noreferrer">View on explorer</a>` : `<p class="fine">Signed by the app's fee payer. You don't hold SOL for this.</p>`}` : `<p class="fine">No network broadcast yet. The hold still follows the program, and the account above is the real address for this buyer and id.</p>`}
        ${job.escrow.stream === "quicknode" || job.escrow.events.some((event) => event.stream === "quicknode") ? `<p class="fine">QuickNode reported this.</p>` : ""}
      </section>
      <ol class="trace">${steps.map(([action, name, ix]) => `<li class="${done.has(action) ? "on" : ""}">${name}<span>${ix}</span></li>`).join("")}</ol>
      <p class="fine">Dollars on screen are USDC. Fees are paid by Holler.</p>`,
  });
}

function renderAsks() {
  const jobs = db.jobs.filter((job) => job.buyerId === db.me.id || job.creatorId === db.me.id).sort((a, b) => {
    const score = (job) => (needsYou(job) ? 0 : job.status === "released" || job.status === "refunded" ? 2 : 1);
    return score(a) - score(b) || b.createdAt - a.createdAt;
  });
  const cards = jobs.map((job) => {
    const other = person(job.creatorId === db.me.id ? job.buyerId : job.creatorId);
    const [label, tone] = statusMeta(job.status);
    return `<a class="job" href="#/job/${job.id}"><div class="job-top"><b>${esc(job.title)}</b><span class="tag ${tone}">${label}</span></div><small>${job.creatorId === db.me.id ? esc(other.first) + " asked" : "for " + esc(other.first)} · ${money(job.amountCents)} · ${ago(job.createdAt)}</small></a>`;
  }).join("");
  return frame({
    body: `<h1 class="display">Asks.</h1>${banner()}${cards || `<p class="empty">Nothing held yet.</p><a class="btn primary" href="#/people">Find a person</a>`}`,
  });
}

function renderYou() {
  const creator = db.me.offers?.length;
  const following = db.users.filter((who) => db.following.includes(who.id));
  const judge = db.engine.judge === "grok" ? "Grok" : "Demo judge";
  const chain = { localnet: "Solana localnet", devnet: "Solana devnet", rpc: "Solana", demo: "Demo ledger" }[db.engine.chain] || db.engine.chain;
  return frame({
    body: `<div class="profile-head">${avatar(db.me, "xl")}<h2>${esc(db.me.name)}</h2><p class="muted">${esc(db.me.part)} · ${esc(db.me.city)}</p></div>
      ${creator ? `<div class="hero-money">${money(db.me.earnedCents)}</div><p class="lede">${db.me.jobs} jobs on the record · ${db.me.onTime}% on time</p><section class="panel"><p class="kicker">Portable record</p><p>Completed jobs stay with this account.</p><button class="btn ghost" type="button" data-act="copy-record">Copy record</button></section>` : `<p class="kicker">Following</p>${following.map((who) => `<a class="person" href="#/u/${who.id}">${avatar(who, "sm")}<span><b>${esc(who.name)}</b><small>${esc(who.offers[0]?.title || "")}</small></span></a>`).join("") || `<p class="empty">Follow someone from People.</p>`}`}
      ${db.me.studio ? `<a class="job" href="#/studio"><b>Northroom</b><small>The studio board</small></a>` : ""}
      <a class="job" href="#/how"><b>How the money works</b><small>Plain version</small></a>
      ${creator ? `<section class="panel"><p class="kicker">On X</p><button class="btn ghost block" type="button" data-act="announce" data-on="${db.me.announce ? "0" : "1"}">${db.me.announce ? "Posting finished asks" : "Finished asks stay private"}</button><p class="fine">Grok drafts the post. It only goes out if this is on and the X keys are set.</p></section>` : ""}
      <section class="panel"><p class="kicker">Demo</p><button class="btn ghost block" type="button" data-act="who">Switch person</button><button class="btn ghost block" type="button" data-act="reset" style="margin-top:8px">Reset demo data</button><p class="fine">Judge · ${esc(judge)}<br>Ledger · ${esc(chain)}<br>Streams · ${esc(db.engine.streams)}<br>Announcements · ${esc(db.engine.announce)}</p></section>`,
  });
}

function renderStudio() {
  const jobs = db.jobs.filter((job) => job.studio).sort((a, b) => b.createdAt - a.createdAt);
  return frame({
    back: "#/you",
    title: "Northroom",
    tabs: false,
    body: `<p class="lede">Eden assigns the work. The hold is the same one anyone uses.</p>${jobs.map((job) => {
      const who = person(job.creatorId);
      const [label, tone] = statusMeta(job.status);
      return `<a class="job" href="#/job/${job.id}"><div class="job-top"><b>${esc(job.title)}</b><span class="tag ${tone}">${label}</span></div><small>${esc(who.name)} · ${money(job.amountCents)}</small></a>`;
    }).join("")}`,
  });
}

function renderHow() {
  return frame({
    back: "#/you",
    title: "The money",
    tabs: false,
    body: `<h2 class="display" style="font-size:36px">Plain words in. Payment out.</h2>
      <section class="panel"><p>You describe the ask. A checklist turns the vague parts into lines someone can actually hit.</p></section>
      <section class="panel"><p>The price is held until every line is covered. Then it releases. If it misses, the money stays.</p></section>
      <section class="panel"><p>You can pay anyway, or both of you can send it back. Freezing it locks the hold until you both agree.</p></section>
      <section class="panel"><p class="kicker">Underneath</p><p>Dollars are USDC in the trustlancer escrow program on Solana. The receipt has the account. You never see a seed phrase, and you don't pay the network fee.</p><p class="fine">The judge is Grok when a key is set. Otherwise the demo judge checks for your own words.</p></section>`,
  });
}

function render() {
  const current = route();
  if (current.name === "people") return renderPeople();
  if (current.name === "asks") return renderAsks();
  if (current.name === "you") return renderYou();
  if (current.name === "profile") return renderProfile(current.id);
  if (current.name === "ask") return renderAsk(current.id);
  if (current.name === "job") return renderJob(current.id);
  if (current.name === "post") return renderPost(current.id);
  if (current.name === "receipt") return renderReceipt(current.id);
  if (current.name === "studio") return renderStudio();
  if (current.name === "how") return renderHow();
  return renderFeed();
}

function draw() {
  const app = document.getElementById("app");
  if (!db || !app) return;
  const previous = document.getElementById("view");
  const hash = location.hash || "#/";
  const same = hash === local.route;
  const y = same && previous ? previous.scrollTop : 0;
  local.route = hash;
  app.innerHTML = render();
  const view = document.getElementById("view");
  if (view) view.scrollTop = y;
  hydrate();
}

function hydrate() {
  const query = document.getElementById("q");
  if (query) {
    query.value = local.query;
    query.addEventListener("input", () => {
      local.query = query.value;
      const list = document.getElementById("people-list");
      if (list) list.innerHTML = peopleRows();
    });
  }
  const brief = document.getElementById("brief");
  if (brief && local.ask) {
    brief.value = local.ask.brief;
    brief.addEventListener("input", () => {
      local.ask.brief = brief.value;
      local.ask.dirty = true;
    });
  }
  const note = document.getElementById("note");
  if (note) {
    const id = note.dataset.job;
    if (local.texts[id] == null) {
      const job = db.jobs.find((entry) => entry.id === id);
      local.texts[id] = job?.deliverable?.text || "";
    }
    note.value = local.texts[id];
    note.addEventListener("input", () => { local.texts[id] = note.value; });
  }
  const add = document.getElementById("add-line");
  if (add) {
    add.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = String(new FormData(add).get("line") || "").trim();
      if (value.length < 3 || !local.ask) return;
      local.ask.items.push({ id: `x${Date.now()}`, text: value });
      draw();
    });
  }
  if (local.ask?.reveal) {
    local.ask.reveal = false;
    document.getElementById("checks")?.scrollIntoView({ block: "nearest" });
  }
}

async function refresh() {
  db = await api("/api/bootstrap");
  draw();
}

async function go(hash) {
  if ((location.hash || "#/") !== hash) {
    local.skip = true;
    location.hash = hash;
  }
  await refresh();
}

function likeCount(postId) {
  return db.posts.find((post) => post.id === postId)?.likeCount;
}

async function onClick(event) {
  const sheet = event.target.id === "sheet" ? event.target : null;
  if (sheet) { closeSheet(); return; }
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  try {
    if (act === "who") {
      const order = ["maya", "leo", "priya", "noah", "eden"];
      const rows = [...db.users].sort((a, b) => (order.indexOf(a.id) < 0 ? 20 : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? 20 : order.indexOf(b.id)));
      openSheet(`<p class="kicker">Use Holler as</p>${rows.map((who) => `<button class="sheet-row ${who.id === db.me.id ? "on" : ""}" type="button" data-act="become" data-id="${who.id}" data-hash="#/">${avatar(who, "sm")}<span><b>${esc(who.name)}</b><small>${esc(who.part)}</small></span></button>`).join("")}`);
      return;
    }
    if (act === "activity") {
      const rows = db.activity.length
        ? db.activity.map((item) => `<a class="sheet-row" href="${item.href}"><span><b>${esc(item.text)}</b><small>${ago(item.at)}</small></span></a>`).join("")
        : `<p class="empty">Nothing yet.</p>`;
      openSheet(`<p class="kicker">Activity</p>${rows}`);
      return;
    }
    if (act === "become") {
      localStorage.setItem("holler-user", el.dataset.id);
      closeSheet();
      await go(el.dataset.hash || "#/");
      return;
    }
    if (act === "follow") {
      event.preventDefault();
      const res = await api("/api/follow", { method: "POST", body: { creatorId: el.dataset.id } });
      db.following = res.following
        ? [...new Set([...db.following, el.dataset.id])]
        : db.following.filter((id) => id !== el.dataset.id);
      const who = person(el.dataset.id);
      if (who) who.followers = res.followers;
      db.me.followingCount = db.following.length;
      document.querySelectorAll(`[data-act="follow"][data-id="${el.dataset.id}"]`).forEach((button) => {
        const mine = el.dataset.id === db.me.id;
        button.textContent = mine ? "This is you" : res.following ? "Following" : "Follow";
        button.classList.toggle("on", res.following || mine);
      });
      document.querySelectorAll(`[data-followers="${el.dataset.id}"]`).forEach((node) => {
        node.textContent = res.followers.toLocaleString("en-US");
      });
      return;
    }
    if (act === "like") {
      const res = await api("/api/like", { method: "POST", body: { postId: el.dataset.id } });
      const post = db.posts.find((entry) => entry.id === el.dataset.id);
      if (post) post.likeCount = res.likes;
      if (res.liked) db.likes.push(el.dataset.id);
      else db.likes = db.likes.filter((id) => id !== el.dataset.id);
      el.classList.toggle("on", res.liked);
      el.innerHTML = `${res.liked ? "Liked" : "Like"} <span data-like-count>${res.likes || ""}</span>`;
      return;
    }
    if (act === "filter") {
      local.filter = el.dataset.filter;
      draw();
      return;
    }
    if (act === "offer") {
      const offer = person(local.ask.creatorId).offers.find((entry) => entry.id === el.dataset.offer);
      local.ask.offerId = offer.id;
      local.ask.items = null;
      if (!local.ask.dirty) local.ask.brief = offer.prompt || "";
      draw();
      return;
    }
    if (act === "drop") {
      local.ask.items = local.ask.items.filter((item) => item.id !== el.dataset.id);
      draw();
      return;
    }
    if (act === "checklist") {
      const draft = local.ask;
      draft.busy = true;
      draft.error = "";
      draw();
      try {
        const res = await api("/api/checklist", { method: "POST", body: { creatorId: draft.creatorId, offerId: draft.offerId, brief: draft.brief } });
        draft.items = res.items;
        draft.engine = res.engine;
        draft.fallback = res.fallback;
        draft.reveal = true;
      } catch (error) {
        draft.error = error.message;
      } finally {
        draft.busy = false;
        draw();
      }
      return;
    }
    if (act === "hold") {
      const draft = local.ask;
      draft.busy = true;
      draw();
      try {
        const job = await api("/api/jobs", {
          method: "POST",
          body: { creatorId: draft.creatorId, offerId: draft.offerId, brief: draft.brief, items: draft.items, engine: draft.engine },
        });
        const name = person(draft.creatorId).first;
        local.ask = null;
        await go(`#/job/${job.id}`);
        toast(`Held. ${name} can see this now.`);
      } catch (error) {
        draft.busy = false;
        draft.error = error.message;
        draw();
      }
      return;
    }
    if (act === "sample") {
      const res = await api(`/api/jobs/${el.dataset.id}/sample`, { method: "POST", body: { mode: el.dataset.mode } });
      local.texts[el.dataset.id] = res.text;
      const note = document.getElementById("note");
      if (note) note.value = res.text;
      return;
    }
    if (act === "send") {
      const id = el.dataset.id;
      const text = local.texts[id] ?? document.getElementById("note")?.value ?? "";
      local.judging = id;
      draw();
      const started = Date.now();
      try {
        const job = await api(`/api/jobs/${id}/submit`, { method: "POST", body: { text } });
        const wait = 900 - (Date.now() - started);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        if (job.status === "released") local.celebrate = job.id;
        local.judging = null;
        await refresh();
      } catch (error) {
        local.judging = null;
        await refresh();
        toast(error.message);
      }
      return;
    }
    if (act === "release" || act === "retry" || act === "refund" || act === "freeze") {
      el.disabled = true;
      await api(`/api/jobs/${el.dataset.id}/${act === "release" ? "release" : act}`, { method: "POST" });
      await refresh();
      if (act === "release") toast("Released.");
      return;
    }
    if (act === "play") {
      const post = db.posts.find((entry) => entry.id === el.dataset.id);
      play(post);
      return;
    }
    if (act === "announce") {
      const res = await api("/api/me/announce", { method: "POST", body: { on: el.dataset.on === "1" } });
      db.me.announce = res.announce;
      draw();
      toast(res.announce ? "Finished asks can post on X." : "Finished asks stay off X.");
      return;
    }
    if (act === "copy") {
      await navigator.clipboard.writeText(el.dataset.copy);
      toast("Copied");
      return;
    }
    if (act === "copy-record") {
      const record = {
        app: "holler",
        program: db.engine.programId,
        wallet: db.me.wallet,
        jobs: db.me.jobs,
        earnedCents: db.me.earnedCents,
        onTime: db.me.onTime,
      };
      await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
      toast("Record copied. It belongs to this account.");
      return;
    }
    if (act === "reset") {
      await api("/api/demo/reset", { method: "POST", body: {} });
      local.ask = null;
      local.texts = {};
      localStorage.setItem("holler-user", "maya");
      await go("#/");
      toast("Demo reset. You're Maya.");
    }
  } catch (error) {
    toast(error.message || "Something went wrong.");
  }
}

let playTimer = null;
function play(post) {
  const caption = document.getElementById("caption");
  const bar = document.getElementById("playbar");
  const lines = post?.lines?.length ? post.lines : [post?.quote].filter(Boolean);
  if (!caption || !lines.length) return;
  clearInterval(playTimer);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    caption.textContent = lines.join(" ");
    if (bar) bar.style.width = "100%";
    return;
  }
  let index = 0;
  const tick = () => {
    caption.textContent = lines[index] || "";
    if (bar) bar.style.width = `${((index + 1) / lines.length) * 100}%`;
    index += 1;
    if (index >= lines.length) clearInterval(playTimer);
  };
  tick();
  playTimer = setInterval(tick, 1400);
}

document.addEventListener("click", onClick);
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSheet(); });
window.addEventListener("hashchange", () => {
  if (local.skip) { local.skip = false; return; }
  draw();
});

async function boot() {
  if (!location.hash) {
    local.skip = true;
    location.replace("#/");
  }
  try {
    await refresh();
  } catch (error) {
    const app = document.getElementById("app");
    app.innerHTML = `<div class="boot"><p class="brand">holler</p><p class="fine">${esc(error.message)}</p></div>`;
  }
}

boot();
