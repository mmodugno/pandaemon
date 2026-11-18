const { app, BrowserWindow, screen, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createPhone, loadPhoneToken } = require('./phone-server');

const PORT = 47800;
const MAX_SESSIONS = 200;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // sesiones sin novedades en 8 h se descartan
const WIN_W = 260;
const IS_MAC = process.platform === 'darwin';

const PANDA_DIR = path.join(os.homedir(), '.panda');
const TOKEN_PATH = path.join(PANDA_DIR, 'token');
const STATE_PATH = path.join(PANDA_DIR, 'state.json');

// Token secreto: lo genera install.sh en ~/.panda/token (permisos 600).
// Sin el token correcto, el servidor rechaza cualquier evento.
let TOKEN = '';
try {
  TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
} catch (e) {
  console.error('Falta el token. Corre ./install.sh primero (macOS) o crea ~/.panda/token.');
}

// Los equipos se definen en teams.json.
let TEAMS = {};
try {
  TEAMS = JSON.parse(fs.readFileSync(path.join(__dirname, 'teams.json'), 'utf8'));
} catch (e) {
  console.error('No pude leer teams.json:', e.message);
}

// Ajustes en pandaemon.config.json, validados
function loadConfig() {
  const cfg = { style: 'classic', sleepMinutes: 10, escalateMinutes: 5, followCursor: true, phoneAutoOpen: true };
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'pandaemon.config.json'), 'utf8'));
    if (raw.style === 'soft' || raw.style === 'classic') cfg.style = raw.style;
    if (typeof raw.followCursor === 'boolean') cfg.followCursor = raw.followCursor;
    if (typeof raw.phoneAutoOpen === 'boolean') cfg.phoneAutoOpen = raw.phoneAutoOpen;
    if (Number.isFinite(raw.sleepMinutes)) cfg.sleepMinutes = Math.min(240, Math.max(1, raw.sleepMinutes));
    if (Number.isFinite(raw.escalateMinutes)) cfg.escalateMinutes = Math.min(120, Math.max(1, raw.escalateMinutes));
  } catch (e) { /* se usan los valores por defecto */ }
  return cfg;
}
const CONFIG = loadConfig();

// Formatos permitidos para cada campo que llega por la red
const RE_TEAM = /^[A-Za-z0-9_-]{1,32}$/;
const RE_SESSION = /^[A-Za-z0-9_.:-]{1,80}$/;
const RE_TTY = /^\/dev\/ttys\d{1,4}$/;
const TYPES = new Set(['start', 'working', 'done', 'ask', 'end']);

function clean(str, max) {
  return String(str || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// sessions: id -> { id, team, cwd, folder, status, tty, since, seen, ignored }
// ignored: la ocultaste con clic derecho. Vuelve a aparecer cuando le escribís
// (working) o cuando te pide algo (ask).
const sessions = new Map();
let win = null;
let tray = null;
let muted = false;
let followCursor = CONFIG.followCursor;

/* ---------- Ventana ---------- */

function loadPos() {
  try {
    const p = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (Number.isFinite(p.x) && Number.isFinite(p.bottom)) return p;
  } catch (e) { /* primera vez */ }
  return null;
}

function savePos() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  try {
    fs.mkdirSync(PANDA_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(STATE_PATH, JSON.stringify({ x: b.x, bottom: b.y + b.height }), { mode: 0o600 });
  } catch (e) { /* no es crítico */ }
}

// Mantiene la ventana dentro de la pantalla donde está
function fit(x, bottom, h) {
  const wa = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(bottom) }).workArea;
  return {
    x: Math.round(clamp(x, wa.x, wa.x + wa.width - WIN_W)),
    y: Math.round(clamp(bottom - h, wa.y, wa.y + wa.height - h)),
  };
}

function createWindow() {
  const H = 200;
  const wa = screen.getPrimaryDisplay().workArea;
  const saved = loadPos();
  const x = saved ? saved.x : wa.x + wa.width - WIN_W - 16;
  const bottom = saved ? saved.bottom : wa.y + wa.height - 12;
  const pos = fit(x, bottom, H);

  win = new BrowserWindow({
    width: WIN_W, height: H, x: pos.x, y: pos.y,
    transparent: true, frame: false, hasShadow: false,
    resizable: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: false,          // no le roba el foco a tu terminal
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // La ventana nunca navega ni abre otras ventanas
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('closed', () => { win = null; });
}

/* ---------- Sesiones ---------- */

function list() {
  return [...sessions.values()].map((s) => ({
    id: s.id, team: s.team, folder: s.folder, status: s.status, since: s.since, ignored: !!s.ignored,
  }));
}

function fullState() {
  return { teams: TEAMS, sessions: list(), muted, config: CONFIG };
}

function pushState(extra = {}) {
  const data = { sessions: list(), muted, ...extra };
  if (win && !win.isDestroyed()) win.webContents.send('panda-state', data);
  phone.broadcast(data);
  buildTrayMenu();
}

function notify(title, body, teamKey) {
  if (muted || !Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on('click', () => focusTeam(teamKey));
  n.show();
}

// Salta a la pestaña de iTerm2 cuyo tty coincide (solo macOS).
// El tty se valida con una expresión estricta y se pasa como argumento
// de AppleScript, nunca pegado dentro del texto del script.
function focusTty(tty) {
  if (!IS_MAC) return;
  if (!tty || !RE_TTY.test(tty)) return;
  const script = [
    'on run argv',
    '  set target to item 1 of argv',
    '  tell application "iTerm2"',
    '    activate',
    '    repeat with w in windows',
    '      repeat with t in tabs of w',
    '        repeat with s in sessions of t',
    '          if tty of s is target then',
    '            select w',
    '            select t',
    '            select s',
    '            return',
    '          end if',
    '        end repeat',
    '      end repeat',
    '    end repeat',
    '  end tell',
    'end run',
  ].join('\n');
  execFile('osascript', ['-e', script, tty], (err) => {
    if (err) console.error('No pude saltar a la pestaña:', err.message);
  });
}

function focusTeam(teamKey) {
  const mine = [...sessions.values()].filter((s) => s.team === teamKey && !s.ignored);
  const pick = mine.find((s) => s.status === 'ask') || mine.find((s) => s.status === 'done') || mine[0];
  if (pick) focusTty(pick.tty);
}

function focusSession(id) {
  const s = typeof id === 'string' ? sessions.get(id) : null;
  if (s) focusTty(s.tty);
}

function handleEvent(raw) {
  if (!raw || typeof raw !== 'object') return;

  // Validación estricta de cada campo
  if (!TYPES.has(raw.type)) return;
  if (typeof raw.team !== 'string' || !RE_TEAM.test(raw.team)) return;
  if (typeof raw.session !== 'string' || !RE_SESSION.test(raw.session)) return;
  if (!has(TEAMS, raw.team)) return;

  const team = TEAMS[raw.team];
  const tty = typeof raw.tty === 'string' && RE_TTY.test(raw.tty) ? raw.tty : '';
  const cwd = clean(raw.cwd, 300);
  const message = clean(raw.message, 200);
  const folder = cwd ? clean(path.basename(cwd), 60) : '';
  const id = raw.session;

  if (raw.type === 'end') {
    sessions.delete(id);
    pushState();
    return;
  }

  // Tope de sesiones para que nadie llene la memoria
  if (!sessions.has(id) && sessions.size >= MAX_SESSIONS) return;

  const statusByType = { start: 'idle', working: 'working', done: 'done', ask: 'ask' };
  const status = statusByType[raw.type];
  const prev = sessions.get(id);
  const now = Date.now();
  // Si la ignoraste, sigue oculta hasta que vuelvas a escribirle o te pida algo
  const ignored = !!(prev && prev.ignored) && raw.type !== 'working' && raw.type !== 'ask';

  sessions.set(id, {
    id,
    team: raw.team,
    cwd,
    folder: folder || (prev && prev.folder) || '',
    tty: tty || (prev && prev.tty) || '',
    status,
    since: prev && prev.status === status ? prev.since : now,
    seen: now,
    ignored,
  });

  if (ignored) { pushState(); return; }

  const shown = folder || (prev && prev.folder) || '';
  const base = { team: raw.team, color: team.color };
  if (raw.type === 'done') {
    pushState({ ...base, reaction: 'happy', text: `${team.name} terminó · ${shown}` });
    notify(`${team.name} terminó`, shown, raw.team);
  } else if (raw.type === 'ask') {
    pushState({ ...base, reaction: 'ask', text: `${team.name} te necesita · ${shown}` });
    notify(`${team.name} te necesita`, message || shown, raw.team);
  } else if (raw.type === 'working') {
    pushState({ ...base, reaction: 'working' });
  } else {
    pushState({ ...base, reaction: 'start', text: `${team.name} arrancó · ${shown}` });
  }
}

/* ---------- Servidor local ---------- */

// Comparación del token en tiempo constante
function tokenOk(header) {
  if (!TOKEN || typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Mientras el celular muestra el panda, el de escritorio se esconde solo.
// Vuelve cuando el celular se desconecta, salvo que lo hayas escondido vos.
let hiddenForPhone = false;
function onPhoneViewers(count) {
  if (!win || win.isDestroyed()) return;
  if (count > 0 && win.isVisible()) {
    win.hide();
    hiddenForPhone = true;
  } else if (count === 0 && hiddenForPhone) {
    win.showInactive();
    hiddenForPhone = false;
  }
  buildTrayMenu();
}

// El panda en el celular (ver phone-server.js): su propia clave, solo para mirar
const phone = createPhone({
  port: PORT,
  token: loadPhoneToken(PANDA_DIR),
  getState: fullState,
  focusSession,
  focusTeam: (key) => { if (typeof key === 'string' && has(TEAMS, key)) focusTeam(key); },
  onViewers: onPhoneViewers,
  autoOpen: CONFIG.phoneAutoOpen,
});

function startServer() {
  const server = http.createServer((req, res) => {
    const deny = (code) => { res.writeHead(code); res.end(); };

    // Solo se acepta si el Host es el de la propia máquina (anti DNS rebinding)
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return deny(403);

    // Página del celular: tiene sus propias reglas y su propia clave
    if (phone.handle(req, res)) return;

    // Los navegadores siempre mandan Origin en peticiones entre sitios:
    // si viene, no es un hook, es una página web, y se rechaza.
    if (req.headers.origin) return deny(403);

    if (req.method !== 'POST' || req.url !== '/event') return deny(404);
    if (!tokenOk(req.headers['x-panda-token'])) return deny(401);
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return deny(415);

    let body = '';
    let tooBig = false;
    req.on('data', (c) => {
      body += c;
      if (body.length > 20000) { tooBig = true; req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) return;
      try { handleEvent(JSON.parse(body)); } catch (e) { /* ignorado */ }
      res.writeHead(200); res.end('ok');
    });
  });

  // Solo escucha en local
  server.listen(PORT, '127.0.0.1');
}

/* ---------- Barra de menú / bandeja ---------- */

function menuTemplate() {
  const visible = !!win && win.isVisible();
  return [
    {
      label: visible ? 'Ocultar el panda' : 'Mostrar el panda',
      // A mano siempre gana: si lo mostrás con el celular conectado, queda a la vista
      click: () => { if (win) { hiddenForPhone = false; win.isVisible() ? win.hide() : win.showInactive(); buildTrayMenu(); } },
    },
    {
      label: 'Los ojos siguen el cursor',
      type: 'checkbox',
      checked: followCursor,
      click: (item) => {
        followCursor = item.checked;
        // Al apagarlo los ojos vuelven al centro
        if (!followCursor && win && !win.isDestroyed()) win.webContents.send('panda-cursor', null);
        lastCursor = '';
        buildTrayMenu();
      },
    },
    {
      label: 'Silenciar notificaciones',
      type: 'checkbox',
      checked: muted,
      click: (item) => { muted = item.checked; pushState(); },
    },
    { type: 'separator' },
    { label: `Sesiones activas: ${[...sessions.values()].filter((s) => !s.ignored).length}`, enabled: false },
    {
      label: 'Mostrar sesiones ignoradas',
      enabled: [...sessions.values()].some((s) => s.ignored),
      click: () => { for (const s of sessions.values()) s.ignored = false; pushState(); },
    },
    { type: 'separator' },
    {
      label: phone.devices().length ? 'Abrir el panda en el celular' : 'Celular: sin conectar por cable',
      enabled: phone.devices().length > 0,
      click: () => phone.openOnDevices(),
    },
    { type: 'separator' },
    { label: 'Salir de Pandaemon', click: () => app.quit() },
  ];
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
    if (IS_MAC) icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Pandaemon');
    buildTrayMenu();
  } catch (e) {
    console.error('No pude crear el ícono de la barra de menú:', e.message);
  }
}

/* ---------- IPC ---------- */

ipcMain.handle('get-state', fullState);

// Clic derecho sobre el panda: mismo menú que la bandeja
ipcMain.on('context-menu', () => {
  if (win && !win.isDestroyed()) Menu.buildFromTemplate(menuTemplate()).popup({ window: win });
});

ipcMain.on('focus-team', (_e, key) => {
  if (typeof key === 'string' && has(TEAMS, key)) focusTeam(key);
});
// Clic derecho en una fila o un chip: ocultar hasta que haya novedades.
// También se le saca la campanita a la pestaña de iTerm2.
function ignore(list) {
  for (const s of list) {
    s.ignored = true;
    if (IS_MAC && s.tty && RE_TTY.test(s.tty)) {
      execFile(path.join(__dirname, 'bin', 'panda-tab'), [s.team], { env: { ...process.env, PANDA_TTY: s.tty } }, () => {});
    }
  }
  if (list.length) pushState();
}
ipcMain.on('ignore-session', (_e, id) => {
  const s = typeof id === 'string' ? sessions.get(id) : null;
  if (s) ignore([s]);
});
ipcMain.on('ignore-team', (_e, key) => {
  if (typeof key === 'string' && has(TEAMS, key)) ignore([...sessions.values()].filter((s) => s.team === key && !s.ignored));
});
ipcMain.on('focus-session', (_e, id) => focusSession(id));

// La ventana se ajusta a su contenido y mantiene el borde inferior fijo
ipcMain.on('resize', (_e, h) => {
  if (!win || win.isDestroyed() || !Number.isFinite(h)) return;
  const height = Math.round(clamp(h, 120, 640));
  const b = win.getBounds();
  if (b.height === height) return;
  const pos = fit(b.x, b.y + b.height, height);
  win.setBounds({ x: pos.x, y: pos.y, width: WIN_W, height });
});

// Arrastre desde el cuerpo del panda
let dragOrigin = null;
ipcMain.on('drag-start', () => { if (win && !win.isDestroyed()) dragOrigin = win.getBounds(); });
ipcMain.on('drag-move', (_e, dx, dy) => {
  if (!dragOrigin || !win || win.isDestroyed() || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const pos = fit(dragOrigin.x + dx, dragOrigin.y + dragOrigin.height + dy, dragOrigin.height);
  win.setBounds({ x: pos.x, y: pos.y, width: WIN_W, height: dragOrigin.height });
});
ipcMain.on('drag-end', () => { if (dragOrigin) { dragOrigin = null; savePos(); } });

/* ---------- Arranque ---------- */

// Los ojos del panda siguen al cursor en toda la pantalla
let lastCursor = '';
function trackCursor() {
  setInterval(() => {
    if (!followCursor || !win || win.isDestroyed() || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const rel = { x: p.x - b.x, y: p.y - b.y };
    const key = `${rel.x},${rel.y}`;
    if (key === lastCursor) return;
    lastCursor = key;
    win.webContents.send('panda-cursor', rel);
  }, 100);
}

app.whenReady().then(() => {
  if (IS_MAC) app.dock.hide();
  createWindow();
  createTray();
  startServer();
  phone.startUsb(buildTrayMenu);
  trackCursor();
  // Limpieza de sesiones abandonadas (terminal cerrada sin avisar)
  setInterval(() => {
    const now = Date.now();
    let changed = false;
    for (const [id, s] of sessions) {
      if (now - s.seen > SESSION_TTL_MS) { sessions.delete(id); changed = true; }
    }
    if (changed) pushState();
  }, 60000);
});

app.on('before-quit', savePos);
app.on('window-all-closed', () => app.quit());
