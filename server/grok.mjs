// Pluggable judge. Grok when XAI_API_KEY is set, otherwise the caller uses
// the rules in logic.mjs. The rest of the app only sees checklist items and
// a pass/fail verdict.

const ENDPOINT = "https://api.x.ai/v1/chat/completions";

function parseJson(text) {
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

export async function grokJson(system, user) {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const model = process.env.XAI_MODEL || "grok-3";
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
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  });
  let response = await send({ ...body, response_format: { type: "json_object" } });
  if (!response.ok && response.status !== 401 && response.status !== 403) {
    response = await send(body);
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Grok ${response.status}: ${detail.slice(0, 180)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  return parseJson(content);
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
Use the buyer's names, facts, length, and don'ts. Do not invent extra requirements, except one present item meaning the work actually exists.`;

const JUDGE_SYSTEM = `You are the Holler escrow judge. Decide whether the deliverable satisfies every checklist line.
Return JSON only:
{"passed":boolean,"summary":string,"items":[{"id":string,"met":boolean,"reason":string}]}
Use the checklist ids exactly. Reasons are one short sentence in plain speech. Do not mention that you are a model. Missing facts fail. A forbidden topic fails. passed is true only when every item is met.`;

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
