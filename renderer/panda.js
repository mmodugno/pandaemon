const $ = (id) => document.getElementById(id);
const els = {
  panda: $('panda'), svg: $('pandaSvg'), eyes: $('eyes'), mouth: $('mouth'),
  extra: $('extra'), prop: $('prop'), blushL: $('blushL'), blushR: $('blushR'),
  bubble: $('bubble'), bubbleText: $('bubbleText'), counters: $('counters'),
  panel: $('panel'), rows: $('rows'), panelMeta: $('panelMeta'), stack: $('stack'),
};

const OUT = '#2f2b4d';
const EYE_L = [53, 82];
const EYE_R = [107, 82];
const bridge = window.panda || null;

let TEAMS = {};
let CONFIG = { style: 'classic', sleepMinutes: 10, escalateMinutes: 5 };
let sessions = [];
let muted = false;
let currentState = null;
let lastActivity = Date.now();
let hideTimer = null;
let fadeTimer = null;
let reactionTimer = null;
let panelOpen = false;
let eyeOffset = { x: 0, y: 0 };

/* ---------- Caras ---------- */

// Ojo brillante, sin esclerótica: iris oscuro con dos destellos
function eye([cx, cy], { rx = 6.2, ry = 7, dx = 0, dy = 0, shine = 1 } = {}) {
  return `<g class="blink"><g class="pupil"><g transform="translate(${dx} ${dy})">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#eyeG)"/>
    <circle cx="${cx + rx * .34}" cy="${cy - ry * .36}" r="${2.3 * shine}" fill="#fff"/>
    <circle cx="${cx - rx * .36}" cy="${cy + ry * .36}" r="${1.1 * shine}" fill="#fff" opacity=".85"/>
  </g></g></g>`;
}
const arcUp = ([cx, cy]) => `<path d="M${cx - 8} ${cy + 3} Q${cx} ${cy - 9} ${cx + 8} ${cy + 3}" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>`;
const arcDown = ([cx, cy]) => `<path d="M${cx - 8} ${cy - 1} Q${cx} ${cy + 7} ${cx + 8} ${cy - 1}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>`;
const lid = ([cx, cy]) => `<path d="M${cx - 9} ${cy - 10} L${cx + 9} ${cy - 10} L${cx + 9} ${cy} Q${cx} ${cy + 3} ${cx - 9} ${cy} Z" class="patch"/>
  <path d="M${cx - 9} ${cy} Q${cx} ${cy + 3} ${cx + 9} ${cy}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.8" stroke-linecap="round"/>`;
const spark = (x, y, s, cls) => `<path class="spark ${cls}" d="M${x} ${y - s} L${x + s * .3} ${y - s * .3} L${x + s} ${y} L${x + s * .3} ${y + s * .3} L${x} ${y + s} L${x - s * .3} ${y + s * .3} L${x - s} ${y} L${x - s * .3} ${y - s * .3} Z" fill="#ffc83d"/>`;

const mx = 80, my = 102;
const FACES = {
  calm: {
    eyes: () => eye(EYE_L) + eye(EYE_R),
    mouth: `<path d="M${mx} ${my} v2.5 M${mx - 7} ${my + 3.5} Q${mx - 3.5} ${my + 8} ${mx} ${my + 2.5} Q${mx + 3.5} ${my + 8} ${mx + 7} ${my + 3.5}" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    extra: '', prop: '', blush: .55,
  },
  working: {
    eyes: () => eye([EYE_L[0], EYE_L[1] + 2], { dy: 1 }) + eye([EYE_R[0], EYE_R[1] + 2], { dy: 1 }) + lid([EYE_L[0], EYE_L[1] + 1]) + lid([EYE_R[0], EYE_R[1] + 1]),
    mouth: `<path d="M${mx - 5} ${my + 6} Q${mx} ${my + 7.5} ${mx + 5} ${my + 6}" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/>`,
    extra: '',
    prop: `<g transform="translate(80 151) scale(1.32) translate(-80 -151)"><g class="cup">
      <path d="M66 118 L94 118 L90 148 Q80 151 70 148 Z" fill="#f7f1e6" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M67.3 128 L92.7 128 L91.5 141 Q80 144.5 68.5 141 Z" fill="#c98552"/>
      <text x="80" y="138.5" font-size="9.5" font-weight="800" fill="#fff" text-anchor="middle" font-family="ui-monospace,Menlo,monospace">&gt;_</text>
      <ellipse cx="80" cy="117.5" rx="16" ry="4.2" fill="#f3efe6" stroke="${OUT}" stroke-width="2.8"/>
      <rect x="73" y="112.5" width="14" height="5" rx="2.4" fill="#f3efe6" stroke="${OUT}" stroke-width="2.4"/>
      <ellipse cx="63" cy="132" rx="7.5" ry="11.5" class="patch out" transform="rotate(-24 63 132)"/>
      <ellipse cx="97" cy="132" rx="7.5" ry="11.5" class="patch out" transform="rotate(24 97 132)"/>
    </g></g>`,
    blush: .55,
  },
  happy: {
    eyes: () => arcUp(EYE_L) + arcUp(EYE_R),
    mouth: `<path d="M${mx - 9} ${my + 1} Q${mx} ${my + 17} ${mx + 9} ${my + 1} Z" fill="#ff7d92" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>`,
    extra: spark(146, 22, 7, 'a') + spark(136, 36, 4, 'b') + spark(16, 30, 5, 'c'),
    prop: '', blush: .95,
  },
  curious: {
    eyes: () => eye(EYE_L, { rx: 6.8, ry: 7.6, dx: 1, dy: -1.4 }) + eye(EYE_R, { rx: 6.8, ry: 7.6, dx: 1, dy: -1.4 }),
    mouth: `<ellipse cx="${mx}" cy="${my + 6}" rx="3.6" ry="4.4" fill="${OUT}"/>`,
    extra: `<text class="qmark" x="132" y="30" font-size="30" font-weight="800" fill="#ffb02e" stroke="${OUT}" stroke-width="1.2" paint-order="stroke" font-family="system-ui,sans-serif">?</text>`,
    prop: '', blush: .4,
  },
  sleeping: {
    eyes: () => arcDown(EYE_L) + arcDown(EYE_R),
    mouth: `<path d="M${mx - 4} ${my + 5} Q${mx} ${my + 8} ${mx + 4} ${my + 5}" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/>`,
    extra: `<text class="zz" x="128" y="26" font-size="19" font-weight="800" fill="#8b9cf5" stroke="${OUT}" stroke-width="1" paint-order="stroke" font-family="system-ui,sans-serif">z</text>
            <text class="zz b" x="141" y="12" font-size="13" font-weight="800" fill="#8b9cf5" stroke="${OUT}" stroke-width=".8" paint-order="stroke" font-family="system-ui,sans-serif">z</text>`,
    prop: '', blush: .5,
  },
  worried: {
    eyes: () => eye(EYE_L, { rx: 5.6, ry: 6.4, dy: 1.2, shine: .85 }) + eye(EYE_R, { rx: 5.6, ry: 6.4, dy: 1.2, shine: .85 }) +
      `<path d="M38 60 L58 54" stroke="${OUT}" stroke-width="3.4" stroke-linecap="round"/>
       <path d="M122 60 L102 54" stroke="${OUT}" stroke-width="3.4" stroke-linecap="round"/>`,
    mouth: `<path d="M${mx - 7} ${my + 8} Q${mx - 3.5} ${my + 2} ${mx} ${my + 6} Q${mx + 3.5} ${my + 10} ${mx + 7} ${my + 8}" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/>`,
    extra: `<path class="drop" d="M128 56 Q136 68 128 76 Q120 68 128 56 Z" fill="#7fd0ff" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`,
    prop: '', blush: .2,
  },
};

/* ---------- Estado del panda ---------- */

function setState(state, text, color) {
  if (!FACES[state]) state = 'calm';
  const changed = state !== currentState;
  if (changed) {
    const face = FACES[state];
    const wasSleeping = currentState === 'sleeping';
    els.eyes.innerHTML = face.eyes();
    els.mouth.innerHTML = face.mouth;
    els.extra.innerHTML = face.extra;
    els.prop.innerHTML = face.prop;
    els.blushL.style.opacity = face.blush;
    els.blushR.style.opacity = face.blush;
    els.panda.className = 'panda ' + state;
    els.svg.classList.remove('pop');
    void els.svg.getBoundingClientRect();
    els.svg.classList.add('pop');
    if (wasSleeping) {
      els.panda.classList.add('wake');
      setTimeout(() => els.panda.classList.remove('wake'), 850);
    }
    currentState = state;
    applyEyeOffset();
  }
  if (text) showBubble(text, color);
}

function showBubble(text, color) {
  els.bubbleText.textContent = text;
  els.bubble.style.setProperty('--team', safeColor(color));
  els.bubble.classList.remove('hidden', 'fade');
  clearTimeout(hideTimer);
  clearTimeout(fadeTimer);
  hideTimer = setTimeout(() => {
    els.bubble.classList.add('fade');
    fadeTimer = setTimeout(() => els.bubble.classList.add('hidden'), 240);
  }, 5500);
}

// Solo colores hexadecimales: nada raro dentro de los estilos
function safeColor(c) {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? c : '#a39fbd';
}

function deriveBase() {
  const now = Date.now();
  const asking = sessions.filter((s) => s.status === 'ask');
  if (asking.some((s) => now - s.since > CONFIG.escalateMinutes * 60000)) return 'worried';
  if (asking.length) return 'curious';
  if (sessions.some((s) => s.status === 'working')) return 'working';
  return 'calm';
}

function settle() {
  if (currentState === 'sleeping') return;
  setState(deriveBase());
}

/* ---------- Ojos que siguen al cursor ---------- */

function applyEyeOffset() {
  els.eyes.querySelectorAll('.pupil').forEach((p) => {
    p.style.transform = `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`;
  });
}

function onCursor(pos) {
  // null = seguimiento apagado: ojos al centro
  if (!pos) { eyeOffset = { x: 0, y: 0 }; applyEyeOffset(); return; }
  const { x, y } = pos;
  if (currentState === 'sleeping' || currentState === 'happy') return;
  const r = els.svg.getBoundingClientRect();
  const k = r.width / 160;
  const cx = r.left + 80 * k;
  const cy = r.top + 82 * k;
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy) || 1;
  const amp = 2.6 * Math.min(1, d / 80);
  eyeOffset = { x: (dx / d) * amp, y: (dy / d) * amp * .8 };
  applyEyeOffset();
}

/* ---------- Contadores y panel ---------- */

const STATUS_ORDER = { ask: 0, done: 1, working: 2, idle: 3 };
const STATUS_TEXT = { ask: 'Te necesita', done: 'Listo', working: 'Trabajando', idle: 'Inactiva' };

function ago(since) {
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  if (s < 45) return 'ahora';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function teamOf(key) {
  return TEAMS[key] || { name: key, short: key, color: '#a39fbd' };
}

function renderCounters() {
  els.counters.textContent = '';
  for (const key of Object.keys(TEAMS)) {
    const mine = sessions.filter((s) => s.team === key);
    const pending = mine.filter((s) => s.status === 'done' || s.status === 'ask').length;
    const busy = mine.some((s) => s.status === 'working');
    if (!pending && !busy) continue;
    const t = TEAMS[key];
    const chip = document.createElement('button');
    chip.className = 'chip' + (mine.some((s) => s.status === 'ask') ? ' ask' : '');
    chip.style.setProperty('--team', safeColor(t.color));
    chip.title = `${t.name}: ${mine.length} sesión(es) · clic derecho para ignorar`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    const label = document.createElement('span');
    label.textContent = t.short || t.name;
    const count = document.createElement('span');
    count.className = 'count' + (pending ? '' : ' busy');
    count.textContent = pending ? String(pending) : '···';
    chip.append(dot, label, count);
    chip.addEventListener('click', () => bridge && bridge.focusTeam(key));
    chip.addEventListener('contextmenu', (e) => { e.preventDefault(); if (bridge) bridge.ignoreTeam(key); });
    els.counters.appendChild(chip);
  }
}

function renderPanel() {
  els.panelMeta.textContent = (sessions.length ? `${sessions.length} activa${sessions.length === 1 ? '' : 's'}` : '') + (muted ? ' · silenciado' : '');
  els.rows.textContent = '';
  const sorted = [...sessions].sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.since - b.since));
  for (const s of sorted) {
    const t = teamOf(s.team);
    const row = document.createElement('button');
    row.className = 'row ' + s.status;
    row.style.setProperty('--team', safeColor(t.color));
    const dot = document.createElement('span');
    dot.className = 'dot';
    const main = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = s.folder || 'sin nombre';
    const team = document.createElement('div');
    team.className = 'team';
    team.textContent = t.name;
    main.append(name, team);
    const side = document.createElement('div');
    side.className = 'side';
    const pill = document.createElement('span');
    pill.className = 'pill ' + s.status;
    pill.textContent = STATUS_TEXT[s.status] || s.status;
    const when = document.createElement('span');
    when.className = 'ago';
    when.textContent = ago(s.since);
    side.append(pill, when);
    row.append(dot, main, side);
    row.title = 'Clic: ir a la pestaña · clic derecho: ignorar hasta que haya novedades';
    row.addEventListener('click', () => bridge && bridge.focusSession(s.id));
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); if (bridge) bridge.ignoreSession(s.id); });
    els.rows.appendChild(row);
  }
}

function openPanel() {
  renderPanel();
  els.panel.hidden = false;
  panelOpen = true;
  requestAnimationFrame(() => requestAnimationFrame(() => els.panel.classList.add('open')));
}
function closePanel() {
  panelOpen = false;
  els.panel.classList.remove('open');
  setTimeout(() => { if (!panelOpen) els.panel.hidden = true; }, 240);
}
// Sin sesiones no hay nada que mostrar: el panda queda solo
const togglePanel = () => {
  if (panelOpen) closePanel();
  else if (sessions.length) openPanel();
};

/* ---------- Mensajes de la app ---------- */

function onState(msg) {
  // Las ignoradas no cuentan para nada: ni chips, ni panel, ni la cara del panda
  sessions = (Array.isArray(msg.sessions) ? msg.sessions : []).filter((s) => !s.ignored);
  muted = !!msg.muted;
  renderCounters();
  if (panelOpen && !sessions.length) closePanel();
  else if (panelOpen) renderPanel();

  if (msg.reaction) {
    lastActivity = Date.now();
    clearTimeout(reactionTimer);
    if (msg.reaction === 'happy') {
      setState('happy', msg.text, msg.color);
      reactionTimer = setTimeout(settle, 2300);
    } else if (msg.reaction === 'ask') {
      setState('curious', msg.text, msg.color);
    } else {
      setState(deriveBase(), msg.reaction === 'start' ? msg.text : null, msg.color);
    }
  } else if (currentState !== 'happy') {
    settle();
  }
}

// Cada 15 s: tiempos, escalada a "preocupado" y sueño
setInterval(() => {
  if (panelOpen) renderPanel();
  if (currentState === 'happy') return;
  const idleMs = Date.now() - lastActivity;
  if (currentState !== 'sleeping' && deriveBase() === 'calm' && idleMs > CONFIG.sleepMinutes * 60000) {
    setState('sleeping');
  } else {
    settle();
  }
}, 15000);

/* ---------- Arrastrar y hacer clic ---------- */

let drag = null;
els.panda.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  els.panda.setPointerCapture(e.pointerId);
  drag = { sx: e.screenX, sy: e.screenY, moved: false };
  if (bridge) bridge.dragStart();
});
els.panda.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.screenX - drag.sx, dy = e.screenY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  els.panda.classList.add('dragging');
  if (bridge) bridge.dragMove(dx, dy);
});
const endDrag = () => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  els.panda.classList.remove('dragging');
  if (bridge) bridge.dragEnd();
  if (!moved) togglePanel();
};
els.panda.addEventListener('pointerup', endDrag);
els.panda.addEventListener('pointercancel', endDrag);
els.panda.addEventListener('contextmenu', (e) => { e.preventDefault(); if (bridge) bridge.contextMenu(); });
els.panda.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(); }
  if (e.key === 'Escape') closePanel();
});

// Atajos para ver las caritas (solo si la ventana tiene el foco)
const TEST_STATES = { 1: 'calm', 2: 'working', 3: 'happy', 4: 'curious', 5: 'sleeping', 6: 'worried' };
document.addEventListener('keydown', (e) => { if (TEST_STATES[e.key]) setState(TEST_STATES[e.key]); });

/* ---------- Arranque ---------- */

async function init() {
  if (bridge) {
    const st = await bridge.getState();
    TEAMS = st.teams || {};
    CONFIG = { ...CONFIG, ...(st.config || {}) };
    document.body.dataset.style = CONFIG.style === 'soft' ? 'soft' : 'classic';
    bridge.onState(onState);
    bridge.onCursor(onCursor);
    onState({ sessions: st.sessions, muted: st.muted });
    new ResizeObserver(() => bridge.resize(Math.ceil(els.stack.getBoundingClientRect().height) + 10)).observe(els.stack);
  }
  setState('calm');
}

init();
