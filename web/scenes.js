// Flat illustrations for the feed cards. Each scene is drawn in a 360x150 box
// with one character and the thing they made. Colors match the app palette.

const C = {
  green: "#1dff8a",
  blue: "#5b7cff",
  violet: "#9b6bff",
  pink: "#ff4d9a",
  orange: "#ff8a3d",
  cyan: "#5ee0ff",
  yellow: "#ffd84d",
  ink: "#1b120c",
  panel: "#141722",
  panel2: "#1f2436",
  paper: "#f5f7ff",
  shoe: "#f5f7ff",
};

const FONT = `font-family="Inter,sans-serif" font-weight="800"`;

function sceneSvg(kind) {
  const art = {
    shoutout: shoutoutScene,
    photos: photosScene,
    logo: logoScene,
    squat: squatScene,
    edit: editScene,
    song: songScene,
    page: pageScene,
  };
  const draw = art[kind] || shoutoutScene;
  return `<svg class="scene-art" viewBox="0 0 360 150" preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true">${draw()}</svg>`;
}

function hairFor(style, x, y, color) {
  const top = `<path d="M${x - 19} ${y - 1} Q${x - 21} ${y - 23} ${x} ${y - 22} Q${x + 21} ${y - 23} ${x + 19} ${y - 1} Q${x + 11} ${y - 12} ${x - 1} ${y - 11} Q${x - 12} ${y - 10} ${x - 19} ${y - 1} Z" fill="${color}"/>`;
  if (style === "bun") return `<circle cx="${x + 2}" cy="${y - 24}" r="8" fill="${color}"/>${top}`;
  if (style === "curly") {
    const puffs = [-16, -9, -1, 7, 15].map((dx, i) => `<circle cx="${x + dx}" cy="${y - 16 - (i % 2 ? 5 : 0)}" r="8" fill="${color}"/>`).join("");
    return `${puffs}<circle cx="${x - 18}" cy="${y - 5}" r="5" fill="${color}"/><circle cx="${x + 18}" cy="${y - 5}" r="5" fill="${color}"/>`;
  }
  if (style === "cap") {
    return `<path d="M${x - 19} ${y - 4} Q${x - 19} ${y - 24} ${x} ${y - 24} Q${x + 19} ${y - 24} ${x + 19} ${y - 4} Z" fill="${color}"/>
      <path d="M${x + 4} ${y - 6} H${x + 32} Q${x + 34} ${y - 2} ${x + 28} ${y - 1} H${x + 4} Z" fill="${color}"/>`;
  }
  return top;
}

// Long hair sits behind the head, so it is drawn first.
function hairBack(style, x, y, color) {
  if (style !== "long") return "";
  return `<path d="M${x - 21} ${y - 4} Q${x - 22} ${y - 26} ${x} ${y - 25} Q${x + 22} ${y - 26} ${x + 21} ${y - 4} L${x + 23} ${y + 24} Q${x} ${y + 30} ${x - 23} ${y + 24} Z" fill="${color}"/>`;
}

function face(x, y, mouth = "smile") {
  const eyes = `<ellipse cx="${x - 7}" cy="${y + 1}" rx="2.2" ry="2.6" fill="${C.ink}"/><ellipse cx="${x + 7}" cy="${y + 1}" rx="2.2" ry="2.6" fill="${C.ink}"/>`;
  const cheeks = `<ellipse cx="${x - 12}" cy="${y + 8}" rx="3.6" ry="2.2" fill="#ff7d96" opacity=".55"/><ellipse cx="${x + 12}" cy="${y + 8}" rx="3.6" ry="2.2" fill="#ff7d96" opacity=".55"/>`;
  const lips = mouth === "open"
    ? `<ellipse cx="${x}" cy="${y + 11}" rx="4.2" ry="5" fill="#7a1f33"/>`
    : `<path d="M${x - 6} ${y + 9} Q${x} ${y + 15} ${x + 6} ${y + 9}" fill="none" stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  return eyes + cheeks + lips;
}

function limb(d, color, width = 10) {
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function hand(x, y, skin) {
  return `<circle cx="${x}" cy="${y}" r="5.5" fill="${skin}"/>`;
}

// One friendly character. dir points the reaching arm: 1 right, -1 left.
function figure({
  x,
  ground = 140,
  shirt = C.blue,
  pants = "#2b3150",
  skin = "#ffcfa6",
  hair = "#2b1b14",
  style = "short",
  pose = "stand",
  dir = 1,
}) {
  const squat = pose === "squat";
  const headY = squat ? ground - 80 : ground - 98;
  const sh = headY + 21; // shoulder line
  const hip = squat ? ground - 36 : ground - 42;
  const sx = 16; // half shoulder width
  const L = x - sx + 2;
  const R = x + sx - 2;

  let legs;
  if (squat) {
    legs = limb(`M${x - 7} ${hip} L${x - 27} ${ground - 24} L${x - 16} ${ground - 6}`, pants, 11)
      + limb(`M${x + 7} ${hip} L${x + 27} ${ground - 24} L${x + 16} ${ground - 6}`, pants, 11)
      + `<ellipse cx="${x - 19}" cy="${ground - 3}" rx="9" ry="4.5" fill="${C.shoe}"/><ellipse cx="${x + 19}" cy="${ground - 3}" rx="9" ry="4.5" fill="${C.shoe}"/>`;
  } else {
    legs = limb(`M${x - 7} ${hip} L${x - 8} ${ground - 7}`, pants, 11)
      + limb(`M${x + 7} ${hip} L${x + 8} ${ground - 7}`, pants, 11)
      + `<ellipse cx="${x - 11}" cy="${ground - 3}" rx="9" ry="4.5" fill="${C.shoe}"/><ellipse cx="${x + 11}" cy="${ground - 3}" rx="9" ry="4.5" fill="${C.shoe}"/>`;
  }

  // Each arm is a sleeve path ending in a hand.
  const reach = (from, to, via) => limb(`M${from[0]} ${from[1]} Q${via[0]} ${via[1]} ${to[0]} ${to[1]}`, shirt) + hand(to[0], to[1], skin);
  const left = [L, sh + 5];
  const right = [R, sh + 5];
  let arms;
  let front = "";
  if (pose === "wave") {
    arms = reach(left, [x - 24, sh + 36], [x - 26, sh + 18])
      + reach(right, [x + 30, headY - 20], [x + 38, sh - 2]);
    front = `<path d="M${x + 42} ${headY - 30} q6 4 4 12 M${x + 48} ${headY - 22} q5 4 2 10" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`;
  } else if (pose === "camera") {
    arms = reach(left, [x - 12, sh + 18], [x - 24, sh + 18]) + reach(right, [x + 12, sh + 18], [x + 24, sh + 18]);
  } else if (pose === "point") {
    const out = right[0] === R && dir > 0 ? right : left;
    const rest = out === right ? left : right;
    arms = reach(rest, [rest[0] + (rest === left ? -8 : 8), sh + 36], [rest[0] + (rest === left ? -10 : 10), sh + 18])
      + reach(out, [x + dir * 50, sh - 4], [x + dir * 30, sh + 4]);
  } else if (pose === "sing") {
    arms = reach(left, [x - 34, sh + 4], [x - 28, sh + 20]) + reach(right, [x + 14, headY + 22], [x + 30, sh + 22]);
  } else if (pose === "squat") {
    arms = reach(left, [x - 6, sh + 16], [x - 22, sh + 18]) + reach(right, [x + 6, sh + 16], [x + 22, sh + 18]);
  } else {
    arms = reach(left, [x - 22, sh + 36], [x - 24, sh + 18]) + reach(right, [x + 22, sh + 36], [x + 24, sh + 18]);
  }

  const torso = `<path d="M${x - sx} ${sh + 8} Q${x - sx} ${sh} ${x - sx + 8} ${sh} H${x + sx - 8} Q${x + sx} ${sh} ${x + sx} ${sh + 8} L${x + sx - 2} ${hip + 2} Q${x} ${hip + 6} ${x - sx + 2} ${hip + 2} Z" fill="${shirt}"/>`;
  const head = `<circle cx="${x - 19}" cy="${headY + 3}" r="4" fill="${skin}"/><circle cx="${x + 19}" cy="${headY + 3}" r="4" fill="${skin}"/>
    <circle cx="${x}" cy="${headY}" r="19" fill="${skin}"/>
    ${hairFor(style, x, headY, hair)}
    ${face(x, headY, pose === "sing" ? "open" : "smile")}`;

  return `<g>
    <ellipse cx="${x}" cy="${ground + 2}" rx="${squat ? 36 : 28}" ry="5" fill="rgba(0,0,0,.28)"/>
    ${hairBack(style, x, headY, hair)}
    ${legs}
    <rect x="${x - 5}" y="${headY + 14}" width="10" height="10" rx="3" fill="${skin}"/>
    ${torso}
    ${arms}
    ${head}
    ${front}
  </g>`;
}

function sparkle(x, y, r, color) {
  return `<path d="M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r} Z" fill="${color}"/>`;
}

function confetti(points) {
  return points.map(([x, y, color, rot]) => `<rect x="${x}" y="${y}" width="9" height="4" rx="2" fill="${color}" transform="rotate(${rot} ${x + 4} ${y + 2})"/>`).join("");
}

function shoutoutScene() {
  return `
    <g>
      <rect x="22" y="14" width="56" height="22" rx="11" fill="rgba(7,8,15,.55)"/>
      <circle cx="36" cy="25" r="5" fill="#ff3b5c"/>
      <text x="46" y="30" ${FONT} font-size="12" fill="#fff">REC</text>
    </g>
    <g>
      <rect x="40" y="48" width="132" height="48" rx="18" fill="${C.green}"/>
      <path d="M160 86 L190 98 L170 72 Z" fill="${C.green}"/>
      <text x="106" y="79" text-anchor="middle" ${FONT} font-size="19" fill="#04140c">Hey Sam!</text>
    </g>
    ${confetti([[54, 112, C.yellow, 20], [96, 122, C.pink, -30], [140, 110, C.cyan, 45], [300, 40, C.yellow, -15], [318, 86, C.pink, 30], [292, 118, C.green, 60]])}
    ${sparkle(300, 64, 7, "#fff")}
    ${figure({ x: 238, pose: "wave", shirt: C.orange, style: "short" })}`;
}

function photosScene() {
  const polaroid = (x, y, rot, fill) => `<g transform="rotate(${rot} ${x + 26} ${y + 30})">
      <rect x="${x}" y="${y}" width="52" height="60" rx="4" fill="${C.paper}"/>
      <rect x="${x + 5}" y="${y + 5}" width="42" height="38" rx="2" fill="${fill}"/>
      <circle cx="${x + 18}" cy="${y + 20}" r="6" fill="#ffd2ad"/>
      <path d="M${x + 5} ${y + 43} L${x + 18} ${y + 30} L${x + 30} ${y + 40} L${x + 47} ${y + 26} V${y + 43} Z" fill="rgba(255,255,255,.55)"/>
    </g>`;
  return `
    ${polaroid(32, 54, -12, C.pink)}
    ${polaroid(86, 40, 6, C.blue)}
    ${polaroid(142, 60, -4, C.violet)}
    ${figure({ x: 262, pose: "camera", shirt: C.cyan, style: "bun", hair: "#5a2d1a" })}
    <g>
      <rect x="240" y="66" width="44" height="30" rx="7" fill="${C.panel}"/>
      <rect x="250" y="61" width="14" height="7" rx="2" fill="${C.panel}"/>
      <circle cx="262" cy="81" r="10" fill="${C.panel2}" />
      <circle cx="262" cy="81" r="7" fill="${C.violet}"/>
      <circle cx="259" cy="78" r="2.5" fill="#fff"/>
      <rect x="273" y="70" width="6" height="4" rx="1" fill="${C.yellow}"/>
    </g>
    <g stroke="${C.yellow}" stroke-width="3" stroke-linecap="round">
      <path d="M262 48 V40"/><path d="M247 52 L242 46"/><path d="M277 52 L282 46"/>
    </g>`;
}

function logoScene() {
  return `
    <rect x="34" y="18" width="128" height="112" rx="18" fill="${C.panel}"/>
    <rect x="34" y="18" width="128" height="112" rx="18" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
    <circle cx="98" cy="70" r="30" fill="${C.green}"/>
    <path d="M86 58 h22 v14 a11 11 0 0 1 -22 0 Z" fill="#04140c"/>
    <path d="M108 61 a6 6 0 0 1 0 11" fill="none" stroke="#04140c" stroke-width="3.5"/>
    <path d="M92 52 q3 -5 0 -9 M100 52 q3 -5 0 -9" fill="none" stroke="#04140c" stroke-width="2.5" stroke-linecap="round"/>
    <text x="98" y="118" text-anchor="middle" ${FONT} font-size="12" fill="#fff">BEAN THERE</text>
    <g>
      <circle cx="186" cy="34" r="7" fill="${C.pink}"/>
      <circle cx="186" cy="56" r="7" fill="${C.blue}"/>
      <circle cx="186" cy="78" r="7" fill="${C.green}"/>
    </g>
    ${figure({ x: 262, pose: "point", dir: -1, shirt: C.violet, style: "long", hair: "#1a1a2e", skin: "#c98b62" })}
    <path d="M210 60 L198 66" stroke="${C.yellow}" stroke-width="4" stroke-linecap="round"/>`;
}

function squatScene() {
  return `
    <path d="M24 141 H336" stroke="rgba(255,255,255,.25)" stroke-width="3" stroke-linecap="round"/>
    ${figure({ x: 120, pose: "squat", shirt: C.green, pants: "#22264a", style: "cap", hair: C.pink, skin: "#e6a57e" })}
    <path d="M78 104 q-14 -10 -6 -26" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2.5" stroke-dasharray="4 5" stroke-linecap="round"/>
    <path d="M162 104 q14 -10 6 -26" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="2.5" stroke-dasharray="4 5" stroke-linecap="round"/>
    <g>
      <rect x="208" y="30" width="126" height="78" rx="16" fill="${C.panel}"/>
      <circle cx="226" cy="54" r="8" fill="${C.green}"/>
      <path d="M222 54 l3 3 l6 -6" fill="none" stroke="#04140c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="240" y="58" ${FONT} font-size="12" fill="#fff">0:12 knees out</text>
      <circle cx="226" cy="84" r="8" fill="${C.green}"/>
      <path d="M222 84 l3 3 l6 -6" fill="none" stroke="#04140c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="240" y="88" ${FONT} font-size="12" fill="#fff">0:28 depth</text>
    </g>`;
}

function editScene() {
  return `
    ${figure({ x: 84, pose: "point", dir: 1, shirt: C.violet, style: "curly", hair: "#2b1b14", skin: "#8d5a3b" })}
    <g>
      <rect x="148" y="20" width="190" height="112" rx="16" fill="${C.panel}"/>
      <rect x="160" y="32" width="166" height="56" rx="10" fill="${C.panel2}"/>
      <circle cx="243" cy="60" r="16" fill="#fff" opacity=".95"/>
      <path d="M238 52 L252 60 L238 68 Z" fill="${C.panel}"/>
      <rect x="196" y="76" width="94" height="8" rx="4" fill="rgba(255,255,255,.85)"/>
      <rect x="160" y="98" width="46" height="22" rx="6" fill="${C.blue}"/>
      <rect x="210" y="98" width="32" height="22" rx="6" fill="${C.green}"/>
      <rect x="246" y="98" width="80" height="22" rx="6" fill="${C.pink}"/>
      <rect x="226" y="92" width="3" height="34" rx="1.5" fill="${C.yellow}"/>
      <circle cx="227.5" cy="92" r="4" fill="${C.yellow}"/>
    </g>
    <rect x="270" y="8" width="72" height="22" rx="11" fill="${C.pink}"/>
    <text x="306" y="23" text-anchor="middle" ${FONT} font-size="11" fill="#fff">captions</text>`;
}

function songScene() {
  const note = (x, y, color, scale = 1) => `<g transform="translate(${x} ${y}) scale(${scale})">
      <rect x="10" y="-26" width="4" height="28" rx="2" fill="${color}"/>
      <path d="M12 -26 q12 4 14 14 q-6 -6 -14 -6 Z" fill="${color}"/>
      <ellipse cx="6" cy="2" rx="8" ry="6" fill="${color}" transform="rotate(-20 6 2)"/>
    </g>`;
  return `
    ${figure({ x: 120, pose: "sing", shirt: C.blue, style: "long", hair: "#7a3b1d", skin: "#ffd6b8" })}
    <g>
      <rect x="128" y="62" width="7" height="18" rx="3" fill="#9aa3c0" transform="rotate(25 131 71)"/>
      <ellipse cx="139" cy="58" rx="8" ry="9" fill="${C.panel2}" stroke="#9aa3c0" stroke-width="2"/>
    </g>
    <g fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round">
      <path d="M160 50 q10 8 0 16"/><path d="M170 42 q16 16 0 32"/>
    </g>
    ${note(200, 70, C.pink)}
    ${note(244, 46, C.green, 0.85)}
    ${note(286, 82, C.yellow, 1.1)}
    ${sparkle(318, 40, 7, "#fff")}
    ${sparkle(226, 112, 5, C.cyan)}`;
}

function pageScene() {
  return `
    <g>
      <rect x="28" y="16" width="168" height="120" rx="14" fill="${C.paper}"/>
      <path d="M28 30 a14 14 0 0 1 14 -14 H182 a14 14 0 0 1 14 14 V36 H28 Z" fill="#dfe3f3"/>
      <circle cx="42" cy="26" r="3.5" fill="${C.pink}"/><circle cx="54" cy="26" r="3.5" fill="${C.yellow}"/><circle cx="66" cy="26" r="3.5" fill="${C.green}"/>
      <rect x="42" y="48" width="96" height="12" rx="6" fill="${C.panel}"/>
      <rect x="42" y="68" width="136" height="7" rx="3.5" fill="#b9c0da"/>
      <rect x="42" y="81" width="110" height="7" rx="3.5" fill="#b9c0da"/>
      <rect x="42" y="100" width="58" height="22" rx="11" fill="${C.blue}"/>
      <rect x="140" y="96" width="42" height="30" rx="8" fill="${C.green}" opacity=".9"/>
    </g>
    ${figure({ x: 272, pose: "point", dir: -1, shirt: C.orange, style: "short", hair: "#e8c35a", skin: "#ffcfa6" })}
    ${sparkle(330, 34, 7, C.yellow)}`;
}
