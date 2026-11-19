import assert from "node:assert/strict";
import { describe, it, after } from "node:test";
import { checklistFromBrief, evaluate, sampleFor } from "./logic.mjs";

process.env.HOLLER_SKIP_CHAIN = "1";
process.env.HOLLER_STORE = "memory";
process.env.HOLLER_ANNOUNCE = "off";
delete process.env.XAI_API_KEY;

const BIRTHDAY = "A 20 second birthday shoutout for my sister Priya. She just finished nursing school. Keep it warm. Please don't joke about her always being late.";
const BAKERY = "A one-page website for my bakery, Hearth. Need the name, a menu section, and a way to ask about cakes. Warm, not corporate. It has to work on a phone.";
const EDIT = "Edit a 30 second recap of my sister Priya's graduation. Keep her speech, remove the wind noise, and put captions on.";

function item(items, type) {
  return items.find((entry) => entry.rule.type === type);
}

describe("checklist", () => {
  it("pulls names, facts, length, tone, and don'ts out of a plain ask", () => {
    const items = checklistFromBrief(BIRTHDAY, "shoutout");
    assert.equal(item(items, "duration").rule.seconds, 20);
    assert.ok(items.some((entry) => entry.rule.terms?.includes("priya")));
    assert.ok(items.some((entry) => entry.rule.terms?.includes("nursing")));
    const banned = items.find((entry) => entry.rule.type === "forbid");
    assert.ok(banned.rule.terms.includes("joke"));
    assert.ok(banned.rule.terms.includes("late"));
    assert.ok(items.some((entry) => entry.rule.type === "tone"));
    assert.ok(items.some((entry) => entry.rule.type === "present"));
  });

  it("passes a natural shoutout and fails a thin one", () => {
    const items = checklistFromBrief(BIRTHDAY, "shoutout");
    const good = evaluate(items, "Happy birthday Priya, my sister. You finished nursing school and I am so proud. The cut is 20 seconds long. I am speaking on camera to you. I kept it warm.");
    assert.equal(good.passed, true, good.summary);
    const bad = evaluate(items, "Hey, happy birthday. Have a good one. I made a joke about you being late.");
    assert.equal(bad.passed, false);
    assert.equal(bad.items.find((entry) => entry.id === item(items, "forbid").id).met, false);
  });

  it("passes a natural page and a natural edit", () => {
    const page = checklistFromBrief(BAKERY, "work");
    const pageVerdict = evaluate(page, "Built a one-page website for Hearth bakery. The name Hearth is at the top, there's a menu section, and a form to ask about cakes. It works on a phone. The tone is warm.");
    assert.equal(pageVerdict.passed, true, JSON.stringify(pageVerdict.items.filter((entry) => !entry.met), null, 2));
    assert.equal(page.find((entry) => entry.rule.type === "forbid")?.rule.terms.includes("corporate"), true);

    const edit = checklistFromBrief(EDIT, "work");
    const editVerdict = evaluate(edit, "30 second recap of my sister Priya's graduation. I kept the speech, removed the wind noise, and put captions on. The cut is 30 seconds long. The finished work is attached and ready to use.");
    assert.equal(editVerdict.passed, true, JSON.stringify(editVerdict.items.filter((entry) => !entry.met), null, 2));
  });

  it("builds a take that satisfies the checklist and one that misses", () => {
    const items = checklistFromBrief(BIRTHDAY, "shoutout");
    const pass = sampleFor(items, "pass", { kind: "shoutout", creatorName: "Leo Park" });
    const fail = sampleFor(items, "fail", { kind: "shoutout", creatorName: "Leo Park" });
    assert.equal(evaluate(items, pass.text).passed, true, pass.text);
    assert.equal(evaluate(items, fail.text).passed, false);
  });
});

let base;

describe("app", () => {
  let server;

  it("serves the phone app and runs a hold, a pass, a miss, and a refund", async () => {
    const { listen, handler } = await import("./index.mjs");
    assert.equal(typeof handler, "function");
    server = await listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${server.address().port}`;

    const health = await api("/api/health");
    assert.equal(health.ok, true);
    assert.equal(health.judge, "demo");
    assert.equal(health.chain, "demo");
    assert.match(health.programId, /^[1-9A-HJ-NP-Za-km-z]+$/);

    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /holler/);

    const home = await api("/api/bootstrap");
    const leo = home.users.find((user) => user.id === "leo");
    assert.ok(leo.wallet);
    assert.ok(home.posts.length >= 5);
    const released = home.jobs.filter((job) => job.status === "released");
    assert.ok(released.every((job) => job.verdict.passed), "seeded releases should already pass");
    assert.ok(released.every((job) => job.escrow.pda && job.escrow.status === "completed"));

    const checklist = await api("/api/checklist", {
      method: "POST",
      body: { creatorId: "leo", offerId: "birthday", brief: BIRTHDAY },
    });
    assert.ok(checklist.items.length >= 4);

    const before = leo.earnedCents;
    const funded = await api("/api/jobs", {
      method: "POST",
      body: { creatorId: "leo", offerId: "birthday", brief: BIRTHDAY, items: checklist.items, engine: checklist.engine },
    });
    assert.equal(funded.status, "funded");
    assert.equal(funded.escrow.status, "active");
    assert.equal(funded.amountCents, 2800);
    assert.notEqual(funded.escrow.pda, leo.wallet);

    const pass = await api(`/api/jobs/${funded.id}/sample`, { method: "POST", user: "leo", body: { mode: "pass" } });
    const paid = await api(`/api/jobs/${funded.id}/submit`, { method: "POST", user: "leo", body: { text: pass.text } });
    assert.equal(paid.status, "released", paid.verdict?.summary);
    assert.equal(paid.escrow.status, "completed");
    assert.equal(paid.verdict.passed, true);

    const after = await api("/api/bootstrap", { user: "leo" });
    const leoNow = after.users.find((user) => user.id === "leo");
    assert.equal(leoNow.earnedCents, before + 2800);
    assert.equal(leoNow.jobs, leo.jobs + 1);
    assert.ok(after.posts.some((post) => post.jobId === funded.id));
    assert.ok(after.activity.some((item) => /released to you/i.test(item.text)));

    const missed = await api("/api/jobs", {
      method: "POST",
      user: "maya",
      body: { creatorId: "priya", offerId: "edit", brief: EDIT, items: checklistFromBrief(EDIT, "work") },
    });
    const fail = await api(`/api/jobs/${missed.id}/sample`, { method: "POST", user: "priya", body: { mode: "fail" } });
    const flagged = await api(`/api/jobs/${missed.id}/submit`, { method: "POST", user: "priya", body: { text: fail.text } });
    assert.equal(flagged.status, "flagged");
    assert.equal(flagged.escrow.status, "active");
    assert.equal(flagged.escrow.releasedCents, 0);

    const paidAnyway = await api(`/api/jobs/${flagged.id}/release`, { method: "POST", user: "maya" });
    assert.equal(paidAnyway.status, "released");

    const second = await api("/api/jobs", {
      method: "POST",
      body: { creatorId: "noah", offerId: "page", brief: BAKERY },
    });
    await api(`/api/jobs/${second.id}/freeze`, { method: "POST", user: "maya" });
    await assert.rejects(
      api(`/api/jobs/${second.id}/release`, { method: "POST", user: "maya" }),
      /frozen|released|nothing/i,
    );
    await api(`/api/jobs/${second.id}/refund`, { method: "POST", user: "maya" });
    const refunded = await api(`/api/jobs/${second.id}/refund`, { method: "POST", user: "noah" });
    assert.equal(refunded.status, "refunded");
    assert.equal(refunded.escrow.status, "cancelled");

    const followed = await api("/api/follow", { method: "POST", body: { creatorId: "sable" } });
    assert.equal(followed.following, true);
    const unfollowed = await api("/api/follow", { method: "POST", body: { creatorId: "sable" } });
    assert.equal(unfollowed.following, false);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });
});

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      "x-holler-user": options.user || "maya",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
}
