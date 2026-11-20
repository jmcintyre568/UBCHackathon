import { createHash } from "node:crypto";

// Turns a plain-language ask into a checklist, and scores a deliverable
// against that checklist. This is the demo judge. Grok can replace either
// step when XAI_API_KEY is set; both paths share this item shape.

const STOP = new Set(`
  a an the for my your and with that this keep make need want please from into
  about just her his their she he they them was were have has you i it of to in
  on at is be or as if so but who what when where how can will would should our
  we me us its it's im i'm dont don't not no without avoid there then than very
  really some any are been being always also only over under after before
  because while which could here them something someone everyone everything
  around want wanted needs needed please thanks thank hey hello hi
  least long length minimum
`.split(/\s+/).filter(Boolean));

const META = new Set(`
  shoutout video clip record recorded recording deliver delivery deliverable
  second seconds minute minutes edit editing make makes made want need please
  just like something someone
`.split(/\s+/).filter(Boolean));

const TONE = new Set(`
  warm funny professional calm upbeat kind sincere playful serious friendly
  corporate simple clean bold casual formal sweet gentle honest chill
`.split(/\s+/).filter(Boolean));

const NEGATION = /\b(?:don't|dont|do not|without|avoid|never|not|no)\b/i;

export function deliverableHash(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

export function formatMoney(cents) {
  const negative = cents < 0;
  const value = Math.abs(Number(cents) || 0);
  const dollars = Math.floor(value / 100);
  const rem = value % 100;
  const body = rem
    ? `${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`
    : dollars.toLocaleString("en-US");
  return `${negative ? "-" : ""}$${body}`;
}

export function cardQuote(text) {
  const sentence = String(text || "").split(/(?<=[.!])\s+/)[0] || String(text || "");
  const clean = sentence.trim();
  return clean.length > 90 ? `${clean.slice(0, 87)}…` : clean;
}

export function captionLines(text) {
  return String(text || "")
    .split(/(?<=[.!])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function norm(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function keywords(text) {
  const tokens = norm(text)
    .split(/[\s-]+/)
    .filter((word) => word.length >= 4 && !STOP.has(word) && !META.has(word));
  return [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, 4);
}

function humanList(terms) {
  if (terms.length <= 1) return terms[0] || "";
  if (terms.length === 2) return `${terms[0]} and ${terms[1]}`;
  return `${terms.slice(0, -1).join(", ")} and ${terms.at(-1)}`;
}

function hasTerm(hay, term) {
  if (!term) return false;
  if (hay.includes(term)) return true;
  if (term.length >= 5) return new RegExp(`\\b${term}`).test(hay);
  return false;
}

function clauseItem(text, index) {
  const shown = text.trim().replace(/\s+/g, " ");
  if (shown.length < 3) return null;
  const basis = shown.replace(/\b\d+\s*-?\s*(?:sec|second|seconds|min|minute|minutes)\b/gi, " ");
  const duration = shown.match(/(\d+)\s*-?\s*(sec|second|seconds|min|minute|minutes)\b/i);
  const filler = new Set(["least", "long", "length", "minimum", "around", "about"]);
  if (duration && keywords(basis).every((word) => filler.has(word))) {
    const seconds = /min/i.test(duration[2]) ? Number(duration[1]) * 60 : Number(duration[1]);
    return {
      id: `c${index + 1}`,
      text: `At least ${seconds} seconds`,
      required: true,
      rule: { type: "duration", seconds, terms: [] },
    };
  }
  const forbid = basis.match(NEGATION);
  if (forbid && basis.search(NEGATION) < 12 && keywords(basis.replace(NEGATION, " ")).length) {
    const terms = keywords(basis.replace(NEGATION, " "));
    if (terms.length) {
      return {
        id: `c${index + 1}`,
        text: shown,
        required: true,
        rule: { type: "forbid", terms, seconds: undefined },
      };
    }
  }
  const terms = keywords(basis);
  if (terms.length && terms.every((term) => TONE.has(term))) {
    return {
      id: `c${index + 1}`,
      text: shown,
      required: true,
      rule: { type: "tone", terms, seconds: undefined },
    };
  }
  if (!terms.length) return null;
  return {
    id: `c${index + 1}`,
    text: shown,
    required: true,
    rule: { type: "include", terms, seconds: undefined },
  };
}

function splitClause(clause) {
  const parts = [];
  const re = /\b(?:don't|dont|do not|without|avoid|never|not|no)\b/i;
  const match = clause.match(re);
  if (!match || match.index == null) return [clause];
  const before = clause.slice(0, match.index).trim();
  const after = clause.slice(match.index + match[0].length).trim();
  if (before) parts.push(before);
  if (after) parts.push(`Don't ${after}`);
  return parts.length ? parts : [clause];
}

export function checklistFromBrief(brief, kind = "work") {
  const clean = String(brief || "").replace(/\s+/g, " ").trim();
  const items = [];
  const seen = new Set();
  const push = (item) => {
    if (!item) return;
    const key = `${item.rule.type}:${item.text.toLowerCase()}`;
    if (seen.has(key)) return;
    if (item.rule.type === "duration" && items.some((entry) => entry.rule.type === "duration")) return;
    seen.add(key);
    item.id = `c${items.length + 1}`;
    items.push(item);
  };

  const secondsMatch = clean.match(/(\d+)\s*-?\s*(sec|second|seconds)\b/i);
  const minutesMatch = clean.match(/(\d+)\s*-?\s*(min|minute|minutes)\b/i);
  if (secondsMatch) push(clauseItem(`At least ${secondsMatch[1]} seconds`, 0));
  else if (minutesMatch) push(clauseItem(`At least ${Number(minutesMatch[1]) * 60} seconds`, 0));

  for (const chunk of clean.split(/[\n.!?]+/)) {
    const clause = chunk.trim();
    if (clause.length < 8) continue;
    for (const piece of splitClause(clause)) push(clauseItem(piece, items.length));
  }

  push({
    id: "present",
    text: kind === "shoutout"
      ? "Speaks on camera, to the person"
      : "Hands over something that can actually be used",
    required: true,
    rule: { type: "present", terms: [], seconds: undefined },
  });

  return items.slice(0, 7);
}

export function normalizeItem(raw, index) {
  const text = String(raw?.text || "").trim();
  if (!text) return null;
  const type = raw?.rule?.type;
  const known = ["include", "forbid", "duration", "tone", "present"];
  if (!known.includes(type)) return clauseItem(text, index);
  const terms = Array.isArray(raw.rule.terms)
    ? raw.rule.terms.map((term) => String(term).toLowerCase().trim()).filter((term) => term.length >= 3).slice(0, 6)
    : [];
  return {
    id: raw.id || `c${index + 1}`,
    text,
    required: raw.required !== false,
    rule: {
      type,
      terms,
      seconds: type === "duration" ? Number(raw.rule.seconds) || undefined : undefined,
    },
  };
}

function hits(hay, terms) {
  return terms.filter((term) => hasTerm(hay, term));
}

function includeEnough(found, total) {
  if (total <= 2) return found === total;
  return found >= total - 1;
}

export function evaluate(items, text) {
  const hay = norm(text);
  const results = items.map((item) => {
    const rule = item.rule || { type: "present", terms: [] };
    let met = false;
    let reason = "";
    if (rule.type === "duration") {
      const seconds = Number(rule.seconds) || 0;
      const stated = [...String(text).matchAll(/(\d+)\s*-?\s*(?:sec|second|seconds|s)\b/gi)]
        .some((match) => Number(match[1]) >= seconds);
      const clock = String(text).match(/\b(\d+):(\d{2})\b/);
      const clockOk = clock && Number(clock[1]) * 60 + Number(clock[2]) >= seconds;
      const longEnough = wordCount(text) >= seconds * 2;
      met = Boolean(seconds && (stated || clockOk || longEnough));
      reason = met
        ? (stated || clockOk ? `It says it's ${seconds} seconds.` : `Long enough to cover ${seconds} seconds.`)
        : `Too short for ${seconds} seconds.`;
    } else if (rule.type === "forbid") {
      const found = hits(hay, rule.terms);
      const tripped = rule.terms.length <= 3 ? found.length === rule.terms.length && found.length > 0
        : found.length >= Math.ceil(rule.terms.length * 0.75);
      met = !tripped;
      reason = met
        ? `Doesn't bring up ${humanList(rule.terms)}.`
        : `It brings up ${humanList(found)}.`;
    } else if (rule.type === "tone") {
      met = wordCount(text) >= 12;
      reason = met ? "The tone can stand." : "Too thin to judge the tone.";
    } else if (rule.type === "present") {
      met = wordCount(text) >= 8;
      reason = met ? "There's a real deliverable." : "This is too thin to count as the deliverable.";
    } else {
      const found = hits(hay, rule.terms);
      const missing = rule.terms.filter((term) => !found.includes(term));
      met = rule.terms.length > 0 && includeEnough(found.length, rule.terms.length);
      reason = met
        ? `Found ${humanList(found)}.`
        : `Still missing ${humanList(missing)}.`;
    }
    return { id: item.id, text: item.text, met, reason };
  });
  const open = results.filter((result) => !result.met);
  const summary = open.length === 0
    ? "Every line of the checklist is covered."
    : open.length === 1
      ? `Still open: ${open[0].text}`
      : `${open.length} lines are still open.`;
  return { passed: open.length === 0, summary, items: results, engine: "demo" };
}

export function sampleFor(items, mode, ctx = {}) {
  const kind = ctx.kind === "shoutout" ? "shoutout" : "work";
  if (mode === "fail") {
    let text = kind === "shoutout"
      ? "Hey, happy birthday. Have a good one. I made a joke about you being late."
      : "Done. I will send a file later.";
    const terms = items.filter((item) => item.rule.type === "forbid").flatMap((item) => item.rule.terms);
    for (const term of terms) {
      if (!norm(text).includes(term)) text += ` ${term}`;
    }
    return {
      text,
      cardLine: kind === "shoutout" ? "Happy birthday." : "Still working on it.",
    };
  }
  const cardLine = kind === "shoutout" ? "This one is just for you." : "It's ready to use.";
  const lines = [cardLine];
  const name = (ctx.creatorName || "").split(" ")[0];
  if (name) lines.push(`${name} here.`);
  for (const item of items) {
    if (item.rule.type === "include" && item.rule.terms?.length) {
      lines.push(`I included ${humanList(item.rule.terms)}.`);
    } else if (item.rule.type === "tone" && item.rule.terms?.length) {
      lines.push(`I kept the tone ${humanList(item.rule.terms)}.`);
    } else if (item.rule.type === "duration") {
      lines.push(`The cut is ${item.rule.seconds} seconds long.`);
    } else if (item.rule.type === "present") {
      lines.push(kind === "shoutout"
        ? "I am speaking on camera, straight to you."
        : "The finished work is attached and ready to use.");
    }
  }
  return { text: lines.join(" "), cardLine };
}
