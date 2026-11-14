const { app, BrowserWindow, screen, ipcMain, Notification } = require('electron');
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = 47800;
const MAX_SESSIONS = 200;
const IS_MAC = process.platform === 'darwin';

// Token secreto: lo genera install.sh en ~/.panda/token (permisos 600).
// Sin el token correcto, el servidor rechaza cualquier evento.
const TOKEN_PATH = path.join(os.homedir(), '.panda', 'token');
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

// Formatos permitidos para cada campo que llega por la red
const RE_TEAM = /^[A-Za-z0-9_-]{1,32}$/;
const RE_SESSION = /^[A-Za-z0-9_.:-]{1,80}$/;
const RE_TTY = /^\/dev\/ttys\d{1,4}$/;
const TYPES = new Set(['start', 'working', 'done', 'ask', 'end']);

function clean(str, max) {
  return String(str || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, max);
}

// sessions: id de sesión -> { team, cwd, status, tty }
const sessions = new Map();
let win;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const W = 340, H = 320;
  win = new BrowserWindow({
    width: W, height: H,
    x: width - W - 20, y: height - H - 20,
    transparent: true, frame: false, hasShadow: false,
    resizable: false, alwaysOnTop: true, skipTaskbar: true,
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
}

function summary() {
  const out = {};
  for (const key of Object.keys(TEAMS)) {
    out[key] = { waiting: 0, asking: 0, working: 0 };
  }
  for (const s of sessions.values()) {
    const t = out[s.team];
    if (!t) continue;
    if (s.status === 'done') t.waiting++;
    if (s.status === 'ask') t.asking++;
    if (s.status === 'working') t.working++;
  }
  return out;
}

function send(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('panda-event', payload);
}

function notify(title, body, teamKey) {
  if (!Notification.isSupported()) return;
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
  const list = [...sessions.values()].filter((s) => s.team === teamKey);
  const pick =
    list.find((s) => s.status === 'ask') ||
    list.find((s) => s.status === 'done') ||
    list[0];
  if (pick) focusTty(pick.tty);
}

function handleEvent(raw) {
  if (!raw || typeof raw !== 'object') return;

  // Validación estricta de cada campo
  if (!TYPES.has(raw.type)) return;
  if (typeof raw.team !== 'string' || !RE_TEAM.test(raw.team)) return;
  if (typeof raw.session !== 'string' || !RE_SESSION.test(raw.session)) return;
  if (!Object.prototype.hasOwnProperty.call(TEAMS, raw.team)) return;

  const team = TEAMS[raw.team];
  const tty = typeof raw.tty === 'string' && RE_TTY.test(raw.tty) ? raw.tty : '';
  const cwd = clean(raw.cwd, 300);
  const message = clean(raw.message, 200);
  const folder = cwd ? path.basename(cwd) : '';
  const ev = { type: raw.type, team: raw.team, session: raw.session, tty, cwd, message };

  if (ev.type === 'end') {
    sessions.delete(ev.session);
    send({ kind: 'summary', summary: summary() });
    return;
  }

  // Tope de sesiones para que nadie llene la memoria
  if (!sessions.has(ev.session) && sessions.size >= MAX_SESSIONS) return;

  const statusByType = { start: 'idle', working: 'working', done: 'done', ask: 'ask' };
  sessions.set(ev.session, {
    team: ev.team,
    cwd: ev.cwd,
    tty: ev.tty || (sessions.get(ev.session) || {}).tty || '',
    status: statusByType[ev.type],
  });

  const base = { kind: 'event', team: ev.team, color: team.color, summary: summary() };

  if (ev.type === 'done') {
    send({ ...base, state: 'happy', text: `${team.name} terminó · ${folder}` });
    notify(`${team.name} terminó`, folder, ev.team);
  } else if (ev.type === 'ask') {
    send({ ...base, state: 'curious', text: `${team.name} te necesita · ${folder}` });
    notify(`${team.name} te necesita`, ev.message || folder, ev.team);
  } else if (ev.type === 'working') {
    send({ ...base, state: 'calm', text: null });
  } else {
    send({ ...base, state: 'calm', text: `${team.name} arrancó · ${folder}` });
  }
}

// Comparación del token en tiempo constante
function tokenOk(header) {
  if (!TOKEN || typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function startServer() {
  const server = http.createServer((req, res) => {
    const deny = (code) => { res.writeHead(code); res.end(); };

    // Los navegadores siempre mandan Origin en peticiones entre sitios:
    // si viene, no es un hook, es una página web, y se rechaza.
    if (req.headers.origin) return deny(403);

    // Solo se acepta si el Host es el de la propia máquina (anti DNS rebinding)
    const host = String(req.headers.host || '');
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return deny(403);

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

ipcMain.handle('get-teams', () => TEAMS);
ipcMain.on('focus-team', (_e, teamKey) => {
  if (typeof teamKey === 'string' && Object.prototype.hasOwnProperty.call(TEAMS, teamKey)) {
    focusTeam(teamKey);
  }
});
ipcMain.on('focus-urgent', () => {
  const list = [...sessions.values()];
  const pick = list.find((s) => s.status === 'ask') || list.find((s) => s.status === 'done');
  if (pick) focusTty(pick.tty);
});

app.whenReady().then(() => {
  if (IS_MAC) app.dock.hide();
  createWindow();
  startServer();
});

app.on('window-all-closed', () => app.quit());
