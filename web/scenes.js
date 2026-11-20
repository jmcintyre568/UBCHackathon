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

function shoutoutScene() {
  return `
    <ellipse cx="250" cy="150" rx="70" ry="12" fill="rgba(0,0,0,.25)"/>
    <path d="M214 78c8-28 40-36 52-14 8 14 2 32-12 38l-8 28h-28l-6-24c-14-2-24-16-20-28z" fill="#ffe1c4"/>
    <circle cx="236" cy="62" r="22" fill="#ffd2ad"/>
    <path d="M218 58c2-14 16-20 28-12 4 8-2 14-8 14" fill="#3a2418"/>
    <circle cx="228" cy="64" r="2.2" fill="#1b120c"/>
    <circle cx="242" cy="64" r="2.2" fill="#1b120c"/>
    <path d="M230 72c4 4 10 4 14 0" fill="none" stroke="#1b120c" stroke-width="2" stroke-linecap="round"/>
    <path d="M188 96c-22 6-34 22-30 34" fill="none" stroke="#ffe1c4" stroke-width="10" stroke-linecap="round"/>
    <circle cx="154" cy="78" r="14" fill="#fff"/>
    <path d="M148 78h12M154 72v12" stroke="#120818" stroke-width="2"/>
    <path d="M70 46h78c8 0 12 6 10 12l-8 28c-2 8-10 12-18 10H78c-10 0-16-8-14-16l6-26c2-6 6-8 14-8z" fill="#1dff8a"/>
    <text x="86" y="78" font-family="Inter,sans-serif" font-size="16" font-weight="800" fill="#04140c">Hey Sam!</text>`;
}

function photosScene() {
  return `
    <circle cx="78" cy="58" r="10" fill="#fff" opacity=".85"/>
    <circle cx="108" cy="48" r="12" fill="#ffd2ad"/>
    <circle cx="138" cy="56" r="10" fill="#5b7cff"/>
    <rect x="64" y="70" width="88" height="28" rx="8" fill="#ff4d9a"/>
    <text x="78" y="88" font-family="Inter,sans-serif" font-size="11" font-weight="800" fill="#fff">HACK NIGHT</text>
    <ellipse cx="250" cy="150" rx="64" ry="12" fill="rgba(0,0,0,.25)"/>
    <path d="M214 86c6-20 34-26 46-8 6 10 2 22-8 28l-4 26h-26l-4-22c-12 0-20-12-16-24z" fill="#5ee0ff"/>
    <circle cx="236" cy="70" r="20" fill="#ffd2ad"/>
    <path d="M220 66c4-12 18-14 26-6" fill="#2a1a12"/>
    <rect x="168" y="88" width="36" height="24" rx="6" fill="#141722" stroke="#fff" stroke-width="3"/>
    <circle cx="186" cy="100" r="7" fill="#9b6bff"/>
    <circle cx="186" cy="100" r="3" fill="#1dff8a"/>
    <path d="M196 92h10l4 6h-8z" fill="#fff"/>`;
}

function logoScene() {
  return `
    <rect x="48" y="36" width="120" height="96" rx="18" fill="#141722" stroke="#fff" stroke-width="3"/>
    <circle cx="108" cy="78" r="22" fill="none" stroke="#1dff8a" stroke-width="6"/>
    <path d="M96 86c8-18 22-18 28-4" fill="none" stroke="#ff4d9a" stroke-width="5" stroke-linecap="round"/>
    <circle cx="86" cy="46" r="6" fill="#5b7cff"/>
    <circle cx="104" cy="46" r="6" fill="#1dff8a"/>
    <circle cx="122" cy="46" r="6" fill="#ff4d9a"/>
    <ellipse cx="268" cy="150" rx="58" ry="12" fill="rgba(0,0,0,.25)"/>
    <path d="M236 92c8-24 36-28 44-6 4 12-2 24-14 28l-2 22h-24l-2-20c-10 0-18-10-14-24z" fill="#ffe1c4"/>
    <circle cx="258" cy="72" r="20" fill="#ffd2ad"/>
    <path d="M242 68c6-14 22-14 28-2" fill="#3a2418"/>
    <path d="M210 108l18-34 8 6-16 36z" fill="#ffb703"/>`;
}

function squatScene() {
  return `
    <path d="M40 132h280" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="168" cy="48" r="18" fill="#ffd2ad"/>
    <path d="M154 44c4-10 20-10 26 0" fill="#2a1a12"/>
    <path d="M150 66c8 10 28 10 36 0l18 28c-8 8-16 10-24 6l-8 22h-16l-6-20c-10 4-20 0-26-8z" fill="#1dff8a"/>
    <path d="M132 96c-16 8-22 20-16 28M214 100c18 6 24 18 16 28" fill="none" stroke="#ffe1c4" stroke-width="8" stroke-linecap="round"/>
    <rect x="236" y="40" width="86" height="54" rx="12" fill="#141722"/>
    <text x="248" y="62" font-family="Inter,sans-serif" font-size="12" font-weight="800" fill="#1dff8a">0:12 knees</text>
    <text x="248" y="80" font-family="Inter,sans-serif" font-size="12" font-weight="800" fill="#fff">0:28 depth</text>`;
}

function editScene() {
  return `
    <rect x="36" y="96" width="200" height="36" rx="10" fill="#141722"/>
    <rect x="48" y="104" width="48" height="20" rx="6" fill="#5b7cff"/>
    <rect x="102" y="104" width="36" height="20" rx="6" fill="#1dff8a"/>
    <rect x="144" y="104" width="70" height="20" rx="6" fill="#ff4d9a"/>
    <rect x="248" y="34" width="78" height="28" rx="14" fill="#ff4d9a"/>
    <text x="260" y="53" font-family="Inter,sans-serif" font-size="12" font-weight="800" fill="#fff">missing</text>
    <ellipse cx="188" cy="78" rx="46" ry="10" fill="rgba(0,0,0,.2)"/>
    <circle cx="150" cy="46" r="16" fill="#ffd2ad"/>
    <path d="M138 42c4-8 16-8 20 0" fill="#2a1a12"/>
    <path d="M132 62c10 8 28 8 36 0l8 16h-52z" fill="#9b6bff"/>`;
}

function songScene() {
  return `
    <rect x="150" y="70" width="16" height="52" rx="6" fill="#141722"/>
    <circle cx="146" cy="124" r="16" fill="#1dff8a"/>
    <circle cx="196" cy="46" r="28" fill="#ff4d9a"/>
    <circle cx="196" cy="46" r="12" fill="#141722"/>
    <circle cx="120" cy="70" r="16" fill="#ffd2ad"/>
    <path d="M108 66c4-8 16-8 20 0" fill="#2a1a12"/>
    <path d="M104 86c8 10 26 10 34 0l6 18h-46z" fill="#5b7cff"/>`;
}

function pageScene() {
  return `
    <rect x="70" y="28" width="150" height="110" rx="16" fill="#141722" stroke="#fff" stroke-width="3"/>
    <rect x="86" y="44" width="70" height="10" rx="5" fill="#1dff8a"/>
    <rect x="86" y="64" width="118" height="8" rx="4" fill="#5b7cff"/>
    <rect x="86" y="80" width="90" height="8" rx="4" fill="#ff4d9a"/>
    <rect x="86" y="100" width="46" height="20" rx="8" fill="#1dff8a"/>
    <circle cx="268" cy="78" r="18" fill="#ffd2ad"/>
    <path d="M254 74c4-10 18-10 24 0" fill="#2a1a12"/>
    <path d="M248 98c10 8 28 8 36 0l6 20h-48z" fill="#9b6bff"/>`;
}
