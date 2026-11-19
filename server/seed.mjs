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
        prompt: "A 20 second birthday shoutout for my sister Priya. She just finished nursing school. Keep it warm. Please don't joke about her always being late.",
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
    bio: "Twenty-second songs made for one person.",
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
        id: "jingle",
        kind: "shoutout",
        title: "A jingle",
        priceCents: 7500,
        eta: "A few days",
        prompt: "A 20 second jingle for my bakery, Hearth. Mention rye bread and that we're open in the evening. Keep it warm.",
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
        prompt: "A form check for my squat. My name is Maya. Tell me about my knees and to slow the way up. Keep it honest.",
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

function releasedJob({ id, buyerId, creatorId, offerId, brief, text, quote, at, studio = false }) {
  const creator = person(creatorId);
  const offer = creator.offers.find((entry) => entry.id === offerId) || creator.offers[0];
  const items = checklistFromBrief(brief, offer.kind);
  const verdict = evaluate(items, text);
  verdict.at = at + HOUR;
  return {
    id: `j${id}`,
    buyerId,
    creatorId,
    offerId: offer.id,
    kind: offer.kind,
    title: offer.title,
    brief,
    items,
    amountCents: offer.priceCents,
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

  const specs = [
    releasedJob({
      id: 1001,
      buyerId: "maya",
      creatorId: "leo",
      offerId: "birthday",
      at: now - 6 * HOUR,
      quote: "She said yes. Tell her the good part twice.",
      brief: "A 20 second shoutout for my friend Sam. She said yes. Tell her the good part twice. Keep it warm.",
      text: "She said yes. Tell her the good part twice. Sam, this is for you, my friend. The cut is 20 seconds long. I am speaking on camera, straight to you, and I kept it warm.",
    }),
    openJob({
      id: 1002,
      buyerId: "maya",
      creatorId: "priya",
      offerId: "edit",
      at: now - 5 * HOUR,
      brief: "Edit a 30 second recap of my sister Priya's graduation. Keep her speech, remove the wind noise, and put captions on.",
    }),
    openJob({
      id: 1003,
      buyerId: "eden",
      creatorId: "noah",
      offerId: "page",
      at: now - 9 * HOUR,
      studio: true,
      brief: "A one-page website for Northroom's spring drop. Include the date, a lineup of the five members, and a mailing list. Clean, not corporate. It has to work on a phone.",
    }),
    releasedJob({
      id: 1004,
      buyerId: "eden",
      creatorId: "leo",
      offerId: "birthday",
      at: now - 3 * DAY,
      studio: true,
      quote: "Jules, Northroom saved you a seat.",
      brief: "A 15 second birthday shoutout for Jules. Mention Northroom and the spring drop. Keep it playful.",
      text: "Jules, happy birthday. Northroom saved you a seat. The spring drop is yours. The cut is 15 seconds long. I am speaking on camera, straight to you, and I kept the tone playful.",
    }),
    openJob({
      id: 1005,
      buyerId: "eden",
      creatorId: "priya",
      offerId: "edit",
      at: now - 20 * HOUR,
      studio: true,
      brief: "Cut three 15 second member intros for Northroom. Each one says the member name and what they make. Put captions on.",
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

  const posts = [
    {
      id: "p1001",
      creatorId: "leo",
      buyerId: "maya",
      jobId: "j1001",
      kind: "shoutout",
      title: "Birthday shoutout",
      quote: "She said yes. Tell her the good part twice.",
      amountCents: 2800,
      at: now - 5 * HOUR,
    },
    {
      id: "p1004",
      creatorId: "leo",
      buyerId: "eden",
      jobId: "j1004",
      kind: "shoutout",
      title: "Birthday shoutout",
      quote: "Jules, Northroom saved you a seat.",
      amountCents: 2800,
      at: now - 3 * DAY + HOUR,
    },
    {
      id: "p2",
      creatorId: "harper",
      buyerId: "maya",
      jobId: null,
      kind: "shoutout",
      title: "Advice, on camera",
      quote: "Take the interview. You already did the hard part.",
      amountCents: 4800,
      at: now - 26 * HOUR,
    },
    {
      id: "p3",
      creatorId: "amina",
      buyerId: "maya",
      jobId: null,
      kind: "shoutout",
      title: "A jingle",
      quote: "Hearth and rye. The door's open tonight.",
      amountCents: 7500,
      at: now - 2 * DAY,
    },
    {
      id: "p4",
      creatorId: "mateo",
      buyerId: "eden",
      jobId: null,
      kind: "shoutout",
      title: "Form check",
      quote: "Knees out. That's the rep that counts.",
      amountCents: 3200,
      at: now - 4 * DAY,
    },
    {
      id: "p5",
      creatorId: "jules",
      buyerId: "eden",
      jobId: null,
      kind: "work",
      title: "Northroom's mark",
      quote: "Three colors. One sharp bird.",
      amountCents: 14000,
      at: now - 5 * DAY,
    },
    {
      id: "p6",
      creatorId: "sable",
      buyerId: "maya",
      jobId: null,
      kind: "shoutout",
      title: "A short song",
      quote: "I wrote this one for your Tuesday.",
      amountCents: 5500,
      at: now - 8 * DAY,
    },
  ].map((post) => ({ ...post, lines: captionLines(post.quote) }));

  const likes = [
    ["p1001", "maya"],
    ["p1001", "eden"],
    ["p1001", "harper"],
    ["p2", "maya"],
    ["p3", "leo"],
    ["p3", "maya"],
    ["p5", "eden"],
    ["p5", "noah"],
  ].map(([postId, userId]) => ({ postId, userId }));

  return {
    version: 2,
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
