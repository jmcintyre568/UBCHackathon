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
  return `<svg class="scene-art" viewBox="0 0 360 168" role="img" aria-hidden="true">${draw()}</svg>`;
}

function figure({ x, ground = 150, shirt = "#5b7cff", pose = "stand" }) {
  const squat = pose === "squat";
  const skin = "#ffd0a8";
  const hair = "#2b1b14";
  const ink = "#1b120c";
  const headY = squat ? 78 : 48;
  const shoulder = headY + 20;
  const hip = squat ? 118 : 104;
  const torsoH = hip - shoulder + 6;
  const arm = (d) => `<path d="${d}" fill="none" stroke="${skin}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;
  let arms = "";
  if (pose === "wave") {
    arms = arm(`M${x - 14} ${shoulder + 6} Q${x - 32} ${shoulder + 18} ${x - 24} ${shoulder + 34}`)
      + arm(`M${x + 14} ${shoulder + 4} Q${x + 36} ${shoulder - 8} ${x + 28} ${headY - 18}`)
      + `<circle cx="${x + 28}" cy="${headY - 22}" r="5" fill="${skin}"/>`;
  } else if (pose === "camera") {
    arms = arm(`M${x - 14} ${shoulder + 8} L${x - 4} ${shoulder + 22}`)
      + arm(`M${x + 14} ${shoulder + 8} L${x + 6} ${shoulder + 22}`);
  } else if (pose === "draw") {
    arms = arm(`M${x - 14} ${shoulder + 8} L${x - 28} ${shoulder + 28}`)
      + arm(`M${x + 14} ${shoulder + 6} L${x + 46} ${shoulder + 16}`)
      + `<circle cx="${x + 50}" cy="${shoulder + 16}" r="5" fill="${skin}"/>`;
  } else if (pose === "sing") {
    arms = arm(`M${x - 14} ${shoulder + 8} L${x - 22} ${shoulder + 30}`)
      + arm(`M${x + 14} ${shoulder + 8} L${x + 8} ${shoulder + 28}`);
  } else if (pose === "squat") {
    arms = arm(`M${x - 14} ${shoulder + 8} L${x - 32} ${shoulder + 22}`)
      + arm(`M${x + 14} ${shoulder + 8} L${x + 34} ${shoulder + 20}`);
  } else {
    arms = arm(`M${x - 14} ${shoulder + 8} L${x - 24} ${shoulder + 32}`)
      + arm(`M${x + 14} ${shoulder + 8} L${x + 26} ${shoulder + 30}`);
  }
  const legs = squat
    ? `<path d="M${x - 7} ${hip} L${x - 26} ${ground - 10} L${x - 6} ${ground}" fill="none" stroke="${skin}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M${x + 7} ${hip} L${x + 28} ${ground - 8} L${x + 8} ${ground}" fill="none" stroke="${skin}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${x - 7} ${hip} L${x - 11} ${ground}" fill="none" stroke="${skin}" stroke-width="8" stroke-linecap="round"/>
       <path d="M${x + 7} ${hip} L${x + 12} ${ground}" fill="none" stroke="${skin}" stroke-width="8" stroke-linecap="round"/>`;
  return `
    <ellipse cx="${x}" cy="${ground + 4}" rx="26" ry="5" fill="rgba(0,0,0,.25)"/>
    ${legs}
    <rect x="${x - 15}" y="${shoulder}" width="30" height="${torsoH}" rx="11" fill="${shirt}"/>
    ${arms}
    <circle cx="${x}" cy="${headY}" r="16" fill="${skin}"/>
    <path d="M${x - 15} ${headY - 2} Q${x} ${headY - 24} ${x + 15} ${headY - 1} L${x + 12} ${headY + 2} Q${x} ${headY - 12} ${x - 12} ${headY + 1} Z" fill="${hair}"/>
    <circle cx="${x - 5}" cy="${headY + 2}" r="1.7" fill="${ink}"/>
    <circle cx="${x + 5}" cy="${headY + 2}" r="1.7" fill="${ink}"/>
    <path d="M${x - 4} ${headY + 8} q4 4 8 0" fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`;
}

function shoutoutScene() {
  return `
    ${figure({ x: 230, pose: "wave", shirt: "#ff8a3d" })}
    <path d="M48 38h118c10 0 16 8 14 16l-8 22c-2 8-10 12-18 10H62c-10 0-16-8-14-16l8-24c2-6 8-8 16-8z" fill="#1dff8a"/>
    <text x="64" y="72" font-family="Inter,sans-serif" font-size="16" font-weight="800" fill="#04140c">Hey Sam!</text>`;
}

function photosScene() {
  return `
    <rect x="36" y="78" width="92" height="26" rx="8" fill="#ff4d9a"/>
    <text x="48" y="96" font-family="Inter,sans-serif" font-size="11" font-weight="800" fill="#fff">HACK NIGHT</text>
    <circle cx="58" cy="52" r="10" fill="#fff"/>
    <circle cx="86" cy="42" r="12" fill="#ffd2ad"/>
    <circle cx="114" cy="50" r="10" fill="#5b7cff"/>
    ${figure({ x: 230, pose: "camera", shirt: "#5ee0ff" })}
    <g transform="translate(196 78)">
      <rect width="40" height="26" rx="6" fill="#141722" stroke="#fff" stroke-width="3"/>
      <circle cx="20" cy="13" r="7" fill="#9b6bff"/>
      <circle cx="20" cy="13" r="3" fill="#1dff8a"/>
      <path d="M30 6h10l4 6h-8z" fill="#fff"/>
    </g>`;
}

function logoScene() {
  return `
    <rect x="36" y="28" width="108" height="108" rx="16" fill="#141722" stroke="#fff" stroke-width="3"/>
    <circle cx="70" cy="46" r="6" fill="#5b7cff"/>
    <circle cx="90" cy="46" r="6" fill="#1dff8a"/>
    <circle cx="110" cy="46" r="6" fill="#ff4d9a"/>
    <circle cx="90" cy="86" r="22" fill="none" stroke="#1dff8a" stroke-width="6"/>
    <path d="M78 94c8-18 22-18 28-4" fill="none" stroke="#ff4d9a" stroke-width="5" stroke-linecap="round"/>
    ${figure({ x: 250, pose: "draw", shirt: "#9b6bff" })}`;
}

function squatScene() {
  return `
    <path d="M28 150h304" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/>
    ${figure({ x: 150, pose: "squat", shirt: "#1dff8a" })}
    <rect x="230" y="36" width="98" height="58" rx="12" fill="#141722"/>
    <text x="242" y="60" font-family="Inter,sans-serif" font-size="12" font-weight="800" fill="#1dff8a">0:12 knees</text>
    <text x="242" y="78" font-family="Inter,sans-serif" font-size="12" font-weight="800" fill="#fff">0:28 depth</text>`;
}

function editScene() {
  return `
    ${figure({ x: 118, pose: "stand", shirt: "#9b6bff" })}
    <rect x="168" y="96" width="160" height="36" rx="10" fill="#141722"/>
    <rect x="180" y="106" width="40" height="16" rx="5" fill="#5b7cff"/>
    <rect x="226" y="106" width="28" height="16" rx="5" fill="#1dff8a"/>
    <rect x="260" y="106" width="52" height="16" rx="5" fill="#ff4d9a"/>
    <rect x="250" y="28" width="78" height="26" rx="13" fill="#ff4d9a"/>
    <text x="262" y="46" font-family="Inter,sans-serif" font-size="12" font-weight="800" fill="#fff">captions</text>`;
}

function songScene() {
  return `
    ${figure({ x: 150, pose: "sing", shirt: "#5b7cff" })}
    <g transform="translate(176 78)">
      <rect x="10" y="0" width="10" height="40" rx="4" fill="#141722"/>
      <circle cx="8" cy="44" r="12" fill="#1dff8a"/>
      <circle cx="40" cy="-8" r="18" fill="#ff4d9a"/>
      <circle cx="40" cy="-8" r="7" fill="#141722"/>
    </g>`;
}

function pageScene() {
  return `
    <rect x="40" y="28" width="140" height="112" rx="16" fill="#141722" stroke="#fff" stroke-width="3"/>
    <rect x="56" y="46" width="70" height="10" rx="5" fill="#1dff8a"/>
    <rect x="56" y="66" width="108" height="8" rx="4" fill="#5b7cff"/>
    <rect x="56" y="82" width="84" height="8" rx="4" fill="#ff4d9a"/>
    <rect x="56" y="104" width="46" height="20" rx="8" fill="#1dff8a"/>
    ${figure({ x: 250, pose: "stand", shirt: "#ff8a3d" })}`;
}
