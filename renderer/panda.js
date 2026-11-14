const pandaEl = document.getElementById('panda');
const eyes = document.getElementById('eyes');
const mouth = document.getElementById('mouth');
const extra = document.getElementById('extra');
const blushL = document.getElementById('blushL');
const blushR = document.getElementById('blushR');
const bubble = document.getElementById('bubble');
const countersEl = document.getElementById('counters');

let TEAMS = {};

const openEyes = `
  <circle cx="72"  cy="98" r="7" fill="#fff" />
  <circle cx="128" cy="98" r="7" fill="#fff" />
  <circle cx="73"  cy="99" r="3.5" fill="#222" />
  <circle cx="127" cy="99" r="3.5" fill="#222" />`;

const FACES = {
  calm: {
    eyes: openEyes,
    mouth: `<path d="M88 134 Q100 142 112 134" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round" />`,
    extra: '',
    blush: 0,
  },
  happy: {
    eyes: `
      <path d="M62 100 Q72 88 82 100"   fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />
      <path d="M118 100 Q128 88 138 100" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />`,
    mouth: `<path d="M84 130 Q100 152 116 130 Z" fill="#ff7a8a" stroke="#222" stroke-width="3" stroke-linejoin="round" />`,
    extra: '',
    blush: 0.9,
  },
  curious: {
    eyes: `
      <circle cx="72"  cy="98" r="9" fill="#fff" />
      <circle cx="128" cy="98" r="9" fill="#fff" />
      <circle cx="74"  cy="95" r="4.5" fill="#222" />
      <circle cx="130" cy="95" r="4.5" fill="#222" />`,
    mouth: `<ellipse cx="100" cy="138" rx="5" ry="6" fill="#222" />`,
    extra: `<text x="158" y="40" font-size="34" font-weight="700" fill="#f5a623">?</text>`,
    blush: 0,
  },
  sleeping: {
    eyes: `
      <path d="M62 102 Q72 108 82 102"   fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />
      <path d="M118 102 Q128 108 138 102" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />`,
    mouth: `<path d="M92 136 Q100 140 108 136" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round" />`,
    extra: `<text x="150" y="44" font-size="26" font-weight="700" fill="#6b7bd6">z</text>
            <text x="168" y="26" font-size="20" font-weight="700" fill="#6b7bd6">z</text>`,
    blush: 0.4,
  },
  worried: {
    eyes: `
      <circle cx="72"  cy="100" r="6" fill="#fff" />
      <circle cx="128" cy="100" r="6" fill="#fff" />
      <circle cx="72"  cy="102" r="3" fill="#222" />
      <circle cx="128" cy="102" r="3" fill="#222" />
      <path d="M58 78 L84 84"   stroke="#222" stroke-width="4" stroke-linecap="round" />
      <path d="M142 78 L116 84" stroke="#222" stroke-width="4" stroke-linecap="round" />`,
    mouth: `<path d="M86 142 Q93 134 100 142 Q107 150 114 142" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round" />`,
    extra: `<path d="M160 70 Q168 84 160 92 Q152 84 160 70 Z" fill="#5bc0eb" />`,
    blush: 0,
  },
};

let hideTimer = null;
let sleepTimer = null;
const SLEEP_AFTER_MS = 10 * 60 * 1000;

// Solo se aceptan colores hexadecimales, para no meter estilos raros
function safeColor(c) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? c : '#222';
}

function setState(state, text, color) {
  const face = FACES[state] || FACES.calm;
  eyes.innerHTML = face.eyes;
  mouth.innerHTML = face.mouth;
  extra.innerHTML = face.extra;
  blushL.setAttribute('opacity', face.blush);
  blushR.setAttribute('opacity', face.blush);
  pandaEl.className = 'panda ' + (FACES[state] ? state : 'calm');

  if (text) {
    bubble.textContent = text;
    bubble.style.setProperty('--team', safeColor(color));
    bubble.classList.remove('hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => bubble.classList.add('hidden'), 6000);
  }

  clearTimeout(sleepTimer);
  if (state !== 'sleeping') {
    sleepTimer = setTimeout(() => setState('sleeping'), SLEEP_AFTER_MS);
  }
}

function renderCounters(summary) {
  countersEl.innerHTML = '';
  for (const [key, team] of Object.entries(TEAMS)) {
    const s = summary[key];
    if (!s) continue;
    const pending = s.waiting + s.asking;
    if (pending === 0 && s.working === 0) continue;
    const chip = document.createElement('div');
    chip.className = 'chip' + (s.asking ? ' ask' : '');
    chip.style.setProperty('--team', safeColor(team.color));
    const short = team.short || team.name;
    const label = pending > 0 ? `${short} ${pending}` : `${short} …`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(label));
    chip.addEventListener('click', () => window.panda.focusTeam(key));
    countersEl.appendChild(chip);
  }
}

// Modo de prueba: teclas 1 a 5, usando los equipos de teams.json
function setupTestKeys() {
  const keys = Object.keys(TEAMS);
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case '1': return setState('calm', 'Todo tranquilo', '#28aa50');
      case '2': return keys[0] && setState('happy', `${TEAMS[keys[0]].name} terminó`, TEAMS[keys[0]].color);
      case '3': return keys[1] && setState('curious', `${TEAMS[keys[1]].name} te necesita`, TEAMS[keys[1]].color);
      case '4': return setState('sleeping');
      case '5': return keys[2] && setState('worried', `Algo falló en ${TEAMS[keys[2]].name}`, TEAMS[keys[2]].color);
    }
  });
}

pandaEl.addEventListener('click', () => {
  if (window.panda) window.panda.focusUrgent();
});

async function init() {
  if (window.panda) {
    TEAMS = await window.panda.getTeams();
    window.panda.onEvent((ev) => {
      if (ev.summary) renderCounters(ev.summary);
      if (ev.kind === 'event') setState(ev.state, ev.text, ev.color);
    });
  }
  setupTestKeys();
  setState('calm');
}

init();
