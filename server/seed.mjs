import { deriveEscrow, pubkeyFor } from "./chain.mjs";
import { captionLines, checklistFromBrief, deliverableHash, evaluate } from "./logic.mjs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const PEOPLE = [
  {
    id: "maya",
    name: "Maya Alvarez",
    handle: "maya",
    city: "Brooklyn",
    bio: "Asking for the thing, then keeping it.",
    hue: 16,
    part: "Fan",
    cast: true,
    studio: false,
    jobs: 0,
    earnedCents: 0,
    onTime: 100,
    audience: 12,
    tags: [],
    offers: [],
  },
  {
    id: "leo",
    name: "Leo Park",
    handle: "leo",
    city: "Los Angeles",
    bio: "Short films for birthdays, pep talks, and the group chat.",
    hue: 24,
    part: "On camera",
    cast: true,
    studio: true,
    jobs: 46,
    earnedCents: 184000,
    onTime: 98,
    audience: 2480,
    tags: ["birthday", "pep talk", "comedy"],
    offers: [
      {
        id: "birthday",
        kind: "shoutout",
        title: "Birthday shoutout",
        priceCents: 2800,
        eta: "Usually today",
        prompt: "A 30 second birthday shoutout for Sam. Say her name, mention UT, and end with a cheer.",
      },
      {
        id: "pep",
        kind: "shoutout",
        title: "Pep talk",
        priceCents: 3200,
        eta: "Usually today",
        prompt: "A 30 second pep talk before my first marathon. My name is Maya. Tell me to start slow. Keep it serious.",
      },
    ],
  },
  {
    id: "amina",
    name: "Amina Diallo",
    handle: "amina",
    city: "London",
    bio: "Event photos and short songs, shot for one room.",
    hue: 265,
    part: "On camera",
    cast: false,
    studio: false,
    jobs: 31,
    earnedCents: 264000,
    onTime: 97,
    audience: 5100,
    tags: ["music", "jingle"],
    offers: [
      {
        id: "photos",
        kind: "work",
        title: "Event photos",
        priceCents: 6000,
        eta: "A few days",
        prompt: "Shoot 15 photos at the Longhorn Hack Night. Need a wide crowd shot, 3 speaker close-ups, and the sponsor banner visible.",
      },
      {
        id: "jingle",
        kind: "shoutout",
        title: "A jingle",
        priceCents: 7500,
        eta: "A few days",
        prompt: "A 20 second jingle for Hearth bakery. Mention rye bread and that we're open in the evening. Keep it warm.",
      },
    ],
  },
  {
    id: "noah",
    name: "Noah Chen",
    handle: "noah",
    city: "Vancouver",
    bio: "Pages and product screens for people who don't speak designer.",
    hue: 200,
    part: "Design",
    cast: true,
    studio: true,
    jobs: 22,
    earnedCents: 940000,
    onTime: 96,
    audience: 890,
    tags: ["website", "design", "landing page"],
    offers: [
      {
        id: "page",
        kind: "work",
        title: "Landing page",
        priceCents: 48000,
        eta: "This week",
        prompt: "A one-page website for my bakery, Hearth. Need the name, a menu section, and a way to ask about cakes. Warm, not corporate. It has to work on a phone.",
      },
    ],
  },
  {
    id: "priya",
    name: "Priya Shah",
    handle: "priya",
    city: "Toronto",
    bio: "I cut the video you actually meant to film.",
    hue: 340,
    part: "Editing",
    cast: true,
    studio: true,
    jobs: 38,
    earnedCents: 512000,
    onTime: 99,
    audience: 1320,
    tags: ["editing", "recap", "captions"],
    offers: [
      {
        id: "edit",
        kind: "work",
        title: "Short edit",
        priceCents: 16000,
        eta: "A few days",
        prompt: "Edit a 30 second recap of my sister Priya's graduation. Keep her speech, remove the wind noise, and put captions on.",
      },
    ],
  },
  {
    id: "mateo",
    name: "Mateo Ruiz",
    handle: "mateo",
    city: "Austin",
    bio: "Form checks, and the honest version of your workout.",
    hue: 145,
    part: "On camera",
    cast: false,
    studio: false,
    jobs: 27,
    earnedCents: 98000,
    onTime: 100,
    audience: 3400,
    tags: ["fitness", "form check"],
    offers: [
      {
        id: "form",
        kind: "shoutout",
        title: "Form check",
        priceCents: 3200,
        eta: "Usually today",
        prompt: "A form-check video on my squat. Give me 3 fixes with timestamps. My name is Maya. Keep it honest.",
      },
    ],
  },
  {
    id: "jules",
    name: "Jules Okonkwo",
    handle: "jules",
    city: "Lagos",
    bio: "Portraits, marks, and the odd menu.",
    hue: 48,
    part: "Design",
    cast: false,
    studio: false,
    jobs: 19,
    earnedCents: 245000,
    onTime: 95,
    audience: 760,
    tags: ["logo", "illustration"],
    offers: [
      {
        id: "mark",
        kind: "work",
        title: "A logo",
        priceCents: 14000,
        eta: "This week",
        prompt: "A simple logo for my bakery, Hearth. One color, a small bird, and the name. Not corporate.",
      },
    ],
  },
  {
    id: "harper",
    name: "Harper Quinn",
    handle: "harper",
    city: "Chicago",
    bio: "Career advice, said to your face.",
    hue: 188,
    part: "On camera",
    cast: false,
    studio: false,
    jobs: 41,
    earnedCents: 176000,
    onTime: 99,
    audience: 2210,
    tags: ["advice", "career"],
    offers: [
      {
        id: "advice",
        kind: "shoutout",
        title: "Advice, on camera",
        priceCents: 4800,
        eta: "Usually today",
        prompt: "A 30 second pep talk before my interview at Northroom. My name is Maya. Tell me to talk about the project. Keep it serious.",
      },
      {
        id: "logo",
        kind: "work",
        title: "Logo",
        priceCents: 14000,
        eta: "This week",
        prompt: "A logo for Northroom Coffee. 3 colors max, SVG and PNG, and it has to work on a dark background.",
      },
    ],
  },
  {
    id: "sable",
    name: "Sable Kim",
    handle: "sable",
    city: "Seoul",
    bio: "Songs with someone's name in them.",
    hue: 312,
    part: "On camera",
    cast: false,
    studio: false,
    jobs: 16,
    earnedCents: 112000,
    onTime: 97,
    audience: 1640,
    tags: ["song", "music"],
    offers: [
      {
        id: "song",
        kind: "shoutout",
        title: "A short song",
        priceCents: 5500,
        eta: "A few days",
        prompt: "A short song for my sister Priya. She finished nursing school. Keep it gentle. Don't mention hospitals.",
      },
    ],
  },
  {
    id: "eden",
    name: "Eden Cho",
    handle: "eden",
    city: "Vancouver",
    bio: "I run Northroom. We make small drops with a few people.",
    hue: 222,
    part: "Studio",
    cast: true,
    studio: true,
    jobs: 0,
    earnedCents: 0,
    onTime: 100,
    audience: 640,
    tags: ["northroom"],
    offers: [],
  },
];

function person(id) {
  return PEOPLE.find((entry) => entry.id === id);
}

function releasedJob({ id, buyerId, creatorId, offerId, brief, text, quote, at, studio = false, items, amountCents, title }) {
  const creator = person(creatorId);
  const offer = creator.offers.find((entry) => entry.id === offerId) || creator.offers[0];
  const checklist = items || checklistFromBrief(brief, offer.kind);
  const verdict = evaluate(checklist, text);
  verdict.at = at + HOUR;
  return {
    id: `j${id}`,
    buyerId,
    creatorId,
    offerId: offer.id,
    kind: offer.kind,
    title: title || offer.title,
    brief,
    items: checklist,
    amountCents: amountCents || offer.priceCents,
    status: verdict.passed ? "released" : "flagged",
    deliverable: { text, link: "", hash: deliverableHash(text), at: at + HOUR },
    verdict,
    escrowId: id,
    refund: { buyer: false, creator: false },
    createdAt: at,
    releasedAt: verdict.passed ? at + HOUR : null,
    counted: true,
    studio,
    checklistEngine: "demo",
    quote,
  };
}

function openJob({ id, buyerId, creatorId, offerId, brief, at, studio = false, amountCents }) {
  const creator = person(creatorId);
  const offer = creator.offers.find((entry) => entry.id === offerId) || creator.offers[0];
  return {
    id: `j${id}`,
    buyerId,
    creatorId,
    offerId: offer.id,
    kind: offer.kind,
    title: offer.title,
    brief,
    items: checklistFromBrief(brief, offer.kind),
    amountCents: amountCents || offer.priceCents,
    status: "funded",
    deliverable: null,
    verdict: null,
    escrowId: id,
    refund: { buyer: false, creator: false },
    createdAt: at,
    releasedAt: null,
    counted: false,
    studio,
    checklistEngine: "demo",
  };
}

const POST_ON_X = new Set(["leo", "amina"]);

function applyAnnouncements() {
  for (const person of PEOPLE) person.announce = POST_ON_X.has(person.id);
}

export async function buildSeed() {
  applyAnnouncements();
  const now = Date.now();
  const wallets = Object.fromEntries(await Promise.all(PEOPLE.map(async (entry) => [entry.id, await pubkeyFor(entry.id)])));
  const users = PEOPLE.map((entry) => {
    const { audience, ...rest } = entry;
    return {
      ...rest,
      first: entry.name.split(" ")[0],
      initials: entry.name.split(" ").slice(0, 2).map((part) => part[0]).join(""),
      wallet: wallets[entry.id],
      audienceBase: audience,
    };
  });

  const follows = [
    ["maya", "leo"],
    ["maya", "amina"],
    ["maya", "harper"],
    ["maya", "mateo"],
    ["eden", "priya"],
    ["eden", "noah"],
    ["eden", "leo"],
    ["leo", "amina"],
    ["priya", "noah"],
    ["noah", "jules"],
    ["harper", "sable"],
    ["mateo", "leo"],
  ].map(([followerId, creatorId]) => ({ followerId, creatorId }));

  for (const user of users) {
    const real = follows.filter((row) => row.creatorId === user.id).length;
    user.audienceBase = Math.max(0, user.audienceBase - real);
  }

  const line = (id, text, type, terms = [], seconds) => ({
    id, text, required: true, rule: { type, terms, seconds },
  });
  const specs = [
    releasedJob({
      id: 1001,
      buyerId: "maya",
      creatorId: "leo",
      offerId: "birthday",
      at: now - 2 * HOUR,
      brief: "A 30 second birthday shoutout for Sam. Say her name, mention UT, and end with a cheer.",
      items: [
        line("c1", "Say her name", "include", ["sam"]),
        line("c2", "Mention UT", "include", ["texas"]),
        line("c3", "End with a cheer", "include", ["cheer"]),
      ],
      text: "Sam, happy birthday. This one mentions Texas and I end with a cheer. I am speaking on camera, straight to you.",
    }),
    releasedJob({
      id: 1002,
      buyerId: "maya",
      creatorId: "priya",
      offerId: "edit",
      at: now - 5 * HOUR,
      title: "Graduation recap",
      brief: "Edit a 30 second graduation recap for Maya. Keep her speech, remove the wind, and put captions on.",
      items: [
        line("c1", "Keep her speech", "include", ["speech"]),
        line("c2", "Remove the wind", "include", ["wind"]),
        line("c3", "Put captions on", "include", ["captions"]),
        line("c4", "At least 30 seconds", "duration", [], 30),
      ],
      text: "A 30 second graduation recap for Maya. I kept her speech and removed the wind noise. The finished work is attached and ready to use.",
    }),
    openJob({
      id: 1003,
      buyerId: "eden",
      creatorId: "noah",
      offerId: "page",
      at: now - 9 * HOUR,
      studio: true,
      brief: "A one-page site for Northroom Coffee. Include the menu, the address, and a phone-friendly layout. Clean, not corporate.",
    }),
    releasedJob({
      id: 1004,
      buyerId: "maya",
      creatorId: "amina",
      offerId: "photos",
      at: now - 1 * DAY,
      brief: "Shoot 15 photos at the Longhorn Hack Night. Need a wide crowd shot, 3 speaker close-ups, and the sponsor banner visible.",
      items: [
        line("c1", "Wide crowd shot", "include", ["crowd"]),
        line("c2", "3 speaker close-ups", "include", ["speaker"]),
        line("c3", "Sponsor banner visible", "include", ["sponsor", "banner"]),
      ],
      text: "Shot 15 photos at the Longhorn Hack Night. Wide crowd shot, three speaker close-ups, and the sponsor banner is visible. The finished set is attached and ready to use.",
    }),
    releasedJob({
      id: 1005,
      buyerId: "eden",
      creatorId: "harper",
      offerId: "logo",
      at: now - 2 * DAY,
      brief: "A logo for Northroom Coffee. 3 colors max, SVG and PNG, and it has to work on a dark background.",
      items: [
        line("c1", "3 colors max", "include", ["colors"]),
        line("c2", "SVG and PNG", "include", ["svg", "png"]),
        line("c3", "Works on a dark background", "include", ["dark"]),
      ],
      text: "Logo for Northroom Coffee. Three colors, delivered as SVG and PNG, and it works on a dark background. The finished files are attached and ready to use.",
    }),
    releasedJob({
      id: 1006,
      buyerId: "maya",
      creatorId: "mateo",
      offerId: "form",
      at: now - 3 * DAY,
      brief: "A form-check video on my squat. Give me 3 fixes with timestamps.",
      items: [
        line("c1", "3 fixes", "include", ["fixes"]),
        line("c2", "With timestamps", "include", ["timestamps"]),
        line("c3", "On the squat", "include", ["squat"]),
      ],
      text: "Form-check video on your squat. Three fixes with timestamps: knees at 0:12, depth at 0:28, lockout at 0:41. I am speaking on camera, straight to you.",
    }),
  ];

  const jobs = [];
  for (const spec of specs) {
    const addresses = await deriveEscrow(wallets[spec.buyerId], spec.escrowId);
    const events = [
      { action: "fund", at: spec.createdAt, cluster: "demo", signature: null },
    ];
    if (spec.status === "released") {
      events.push({ action: "release", at: spec.releasedAt, cluster: "demo", signature: null });
    }
    jobs.push({
      ...spec,
      escrow: {
        id: spec.escrowId,
        status: spec.status === "released" ? "completed" : "active",
        totalCents: spec.amountCents,
        releasedCents: spec.status === "released" ? spec.amountCents : 0,
        milestone: spec.status === "released" ? "paid" : "pending",
        hash: spec.deliverable?.hash || null,
        pda: addresses.escrow,
        vault: addresses.vault,
        client: wallets[spec.buyerId],
        freelancer: wallets[spec.creatorId],
        events,
      },
    });
    delete jobs.at(-1).escrowId;
  }

  const cards = {
    j1001: {
      scene: "shoutout",
      quote: "Leo completed: 30s birthday shoutout for Sam — say her name, mention UT, end with a cheer",
      requirements: ["Say her name", "Mention UT", "End with a cheer"],
    },
    j1002: {
      scene: "edit",
      quote: "Priya submitted: 30s graduation recap for Maya — keep the speech, drop the wind, add captions",
      requirements: ["Keep her speech", "Remove the wind", "Put captions on", "At least 30 seconds"],
    },
    j1004: {
      scene: "photos",
      quote: "Amina completed: Shoot 15 photos at the Longhorn Hack Night — wide crowd shot, 3 speaker close-ups, sponsor banner visible",
      requirements: ["Wide crowd shot", "3 speaker close-ups", "Sponsor banner visible"],
    },
    j1005: {
      scene: "logo",
      quote: "Harper completed: Logo for Northroom Coffee — 3 colors max, SVG + PNG, works on dark background",
      requirements: ["3 colors max", "SVG and PNG", "Works on a dark background"],
    },
    j1006: {
      scene: "squat",
      quote: "Mateo completed: Form-check video on your squat — 3 fixes with timestamps",
      requirements: ["3 fixes", "With timestamps", "On the squat"],
    },
  };
  const posts = specs.filter((job) => cards[job.id]).map((job) => {
    const card = cards[job.id];
    const results = job.verdict.items;
    const met = results.filter((item) => item.met).length;
    const requirements = card.requirements.map((text) => ({
      text,
      met: results.find((item) => item.text === text)?.met !== false,
    }));
    const missing = requirements.filter((item) => !item.met).length;
    return {
      id: `p${job.id.slice(1)}`,
      creatorId: job.creatorId,
      buyerId: job.buyerId,
      jobId: job.id,
      kind: job.kind,
      title: job.title,
      quote: card.quote,
      requirements,
      verdict: {
        passed: job.verdict.passed,
        met,
        total: results.length,
        label: job.verdict.passed
          ? `Judge: ${met}/${results.length} requirements met`
          : `Judge flagged ${missing} of ${requirements.length} · resubmit`,
      },
      scene: card.scene,
      status: job.status,
      amountCents: job.amountCents,
      at: job.releasedAt || job.createdAt,
      lines: captionLines(card.quote),
    };
  });

  const likes = [
    ["p1001", "maya"],
    ["p1001", "eden"],
    ["p1001", "harper"],
    ["p1004", "leo"],
    ["p1004", "maya"],
    ["p1005", "eden"],
    ["p1005", "noah"],
    ["p1006", "maya"],
  ].map(([postId, userId]) => ({ postId, userId }));

  return {
    version: 3,
    users,
    follows,
    likes,
    jobs,
    posts,
    announcements: [],
    live: [],
    mentions: [],
  };
}
