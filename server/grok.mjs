// Grok, through the xAI API, writes checklists, judges deliverables, and
// drafts the post that goes out when a hold releases. No key means the
// caller uses the local fallback. The key is never logged.

const ENDPOINT = "https://api.x.ai/v1/chat/completions";

export function parseModelJson(text) {
  const trimmed = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Grok did not return JSON");
  }
}

export function grokConfigured() {
  return Boolean(process.env.XAI_API_KEY);
}

// grok-3 judges this checklist reliably. The faster non-reasoning models are
// stricter than the brief and add lines of their own, so they are not the
// default. A slow answer gets one more try before the local judge steps in.
function models() {
  const first = process.env.XAI_MODEL || "grok-3";
  return first === "grok-3" ? ["grok-3", "grok-3"] : [first, "grok-3"];
}

async function complete(model, system, user) {
  const body = {
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  const send = (payload) => fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  let response = await send({ ...body, response_format: { type: "json_object" } });
  if (!response.ok && response.status !== 401 && response.status !== 403) {
    response = await send(body);
  }
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Grok ${response.status}: ${detail.slice(0, 160)}`);
    error.status = response.status;
    throw error;
  }
  const payload = await response.json();
  return parseModelJson(payload.choices?.[0]?.message?.content);
}

export async function grokJson(system, user) {
  if (!grokConfigured()) return null;
  let last = null;
  for (const model of models()) {
    try {
      return await complete(model, system, user);
    } catch (error) {
      last = error;
      console.warn(`[holler] grok ${model} (${error.message})`);
      if (error.status === 401 || error.status === 403) break;
    }
  }
  throw last || new Error("Grok did not answer");
}

const CHECKLIST_SYSTEM = `You write acceptance checklists for Holler, a consumer app where people pay a creator after the work is done.
The buyer wrote a plain-language request. Turn it into 3 to 6 concrete lines a creator can hit and a reviewer can verify from the deliverable text.
Return JSON only, no markdown:
{"items":[{"text":string,"rule":{"type":"include"|"forbid"|"duration"|"tone"|"present","terms":string[],"seconds":number}}]}
- include.terms: lowercase words that must show up
- forbid.terms: lowercase words that must not show up
- duration.seconds: a number of seconds, terms []
- tone.terms: tone words, judged loosely
- present: a real deliverable exists, terms []
Terms are short hints for the reviewer, not exact phrases the creator must type.
Write a length as "About N seconds", never "exactly".
Use the buyer's names, facts, length, and don'ts. Do not invent extra requirements, except one present item meaning the work actually exists.`;

const JUDGE_SYSTEM = `You are the Holler escrow judge. Decide whether the deliverable satisfies every checklist line.
The deliverable is the creator's transcript of a video, or a note about the files they handed over, plus an optional link.
Return JSON only:
{"passed":boolean,"summary":string,"items":[{"id":string,"met":boolean,"reason":string}]}
Use the checklist ids exactly. summary is one or two spoken sentences a person could hear out loud. Reasons are one short sentence in plain speech. Do not mention that you are a model.
Judge meaning, not exact words. A rule's terms are hints: "LET'S GO SAM!" is a cheer, "UT" is UT Austin.
For a length, accept a stated runtime within about 20% of the target. With no stated runtime, estimate from the transcript at about 2.5 words per second.
Take the creator's plain statement of what is included as true unless the deliverable contradicts it. Files and videos can't be pasted into text, so a note that they are attached or a link counts as the work existing.
Missing facts fail. A forbidden topic fails. passed is true only when every item is met.`;

const POST_SYSTEM = `You write the single X post a creator publishes when a paid request is finished.
Return JSON only: {"text":string}
Rules: under 220 characters, first person, say who it was for and that it was paid, no hashtags, no more than one exclamation mark, no seed phrases, no token tickers.`;

export async function grokChecklist(brief, kind, creatorName) {
  const raw = await grokJson(CHECKLIST_SYSTEM, JSON.stringify({ creator: creatorName, kind, brief }));
  if (!raw?.items?.length) throw new Error("empty checklist");
  return raw.items;
}

export async function grokJudge(brief, items, deliverable) {
  const raw = await grokJson(JUDGE_SYSTEM, JSON.stringify({
    brief,
    checklist: items.map((item) => ({ id: item.id, text: item.text, rule: item.rule })),
    deliverable,
  }));
  if (!raw || !Array.isArray(raw.items)) throw new Error("empty verdict");
  const byId = new Map(raw.items.map((item) => [item.id, item]));
  const results = items.map((item) => {
    const row = byId.get(item.id);
    return {
      id: item.id,
      text: item.text,
      met: Boolean(row?.met),
      reason: String(row?.reason || (row?.met ? "Covered." : "Not covered.")),
    };
  });
  const passed = results.every((result) => result.met);
  return {
    passed,
    summary: String(raw.summary || (passed ? "Every line of the checklist is covered." : "Some lines are still open.")),
    items: results,
    engine: "grok",
  };
}

export async function draftAnnouncement(facts) {
  const raw = await grokJson(POST_SYSTEM, JSON.stringify(facts));
  const text = String(raw?.text || "").replace(/\s+/g, " ").trim();
  if (text.length < 8) throw new Error("empty post");
  return text.slice(0, 250);
}
