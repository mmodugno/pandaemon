// Pandaemon en el celular: el mismo panda, servido en /phone/ por el servidor local.
// Se usa por cable USB: `adb reverse` lleva el localhost:47800 del celular al de la
// computadora, así el servidor sigue escuchando solo en 127.0.0.1.
//
// El celular usa su propia clave (~/.panda/phone-token), distinta de la de los hooks:
// con ella se puede ver el estado y saltar a una pestaña, pero no mandar eventos.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const RENDERER = path.join(__dirname, 'renderer');

// Únicos archivos que se sirven. Nunca se arma una ruta con lo que llega por la red.
const FILES = {
  'panda.css': 'text/css; charset=utf-8',
  'panda.js': 'text/javascript; charset=utf-8',
  'phone.css': 'text/css; charset=utf-8',
  'phone.js': 'text/javascript; charset=utf-8',
  'phone.webmanifest': 'application/manifest+json',
  'phone-icon.svg': 'image/svg+xml',
};

const CSP = "default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'";
const MAX_CLIENTS = 4;
const MAX_BODY = 2000;
const AUTO_OPEN_WAIT_MS = 5000;
const RE_SERIAL = /^[A-Za-z0-9._:-]{1,64}$/;
const RE_TOKEN = /^[0-9a-f]{64}$/;

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Clave del celular: se genera la primera vez y se reutiliza (permisos 600)
function loadPhoneToken(dir) {
  const file = path.join(dir, 'phone-token');
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    if (RE_TOKEN.test(t)) return t;
  } catch (e) { /* primera vez */ }
  const t = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, t + '\n', { mode: 0o600 });
  } catch (e) {
    console.error('No pude guardar la clave del celular:', e.message);
  }
  return t;
}

// Comparación en tiempo constante
function safeEqual(given, secret) {
  if (!secret || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Misma página que la ventana de escritorio, con el adaptador del celular antes de panda.js.
// La política de seguridad va en la cabecera HTTP (la del <meta> no deja conectarse al servidor).
function phonePage() {
  const html = fs.readFileSync(path.join(RENDERER, 'index.html'), 'utf8');
  const out = html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, '')
    .replace('</head>', [
      '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
      '  <meta name="theme-color" content="#14121f" />',
      '  <link rel="manifest" href="phone.webmanifest" />',
      '  <link rel="icon" href="phone-icon.svg" />',
      '  <link rel="stylesheet" href="phone.css" />',
      '  <title>Pandaemon</title>',
      '</head>',
    ].join('\n'))
    .replace('<script src="panda.js"></script>', '<script src="phone.js"></script>\n  <script src="panda.js"></script>');
  if (!out.includes('phone.js') || !out.includes('phone.css') || /Content-Security-Policy/.test(out)) {
    throw new Error('renderer/index.html cambió y no pude armar la página del celular');
  }
  return out;
}

function createPhone({ port, token, getState, focusSession, focusTeam, onViewers = () => {}, autoOpen = true, log = console.log }) {
  const selfOrigins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  const clients = new Set();

  // Avisa cuántos celulares están mirando. Al irse el último espera unos segundos:
  // si el celular solo se está reconectando, el panda de escritorio no parpadea.
  const VIEWER_GRACE_MS = 6000;
  let viewers = 0;
  let leaveTimer = null;
  function viewersChanged() {
    clearTimeout(leaveTimer);
    if (clients.size > 0) {
      if (viewers === 0) { viewers = clients.size; onViewers(viewers); }
      viewers = clients.size;
      return;
    }
    leaveTimer = setTimeout(() => {
      if (clients.size === 0 && viewers !== 0) { viewers = 0; onViewers(0); }
    }, VIEWER_GRACE_MS);
  }

  function send(res, code, type, body) {
    res.writeHead(code, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': CSP,
    });
    res.end(body);
  }
  const empty = (res, code) => { res.writeHead(code); res.end(); };

  // Devuelve true si el pedido era para /phone (respondido acá), false si no.
  // El servidor principal ya comprobó que el Host es el local.
  function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/phone' && !url.pathname.startsWith('/phone/')) return false;

    // Una página web de otro sitio nunca puede hablar con el panda
    const origin = req.headers.origin;
    if (origin && !selfOrigins.has(origin)) { empty(res, 403); return true; }

    if (url.pathname === '/phone') {
      res.writeHead(301, { Location: '/phone/' });
      res.end();
      return true;
    }
    const name = url.pathname.slice('/phone/'.length);

    // Página y archivos estáticos: no llevan datos, no piden clave
    if (req.method === 'GET' && name === '') {
      try { send(res, 200, 'text/html; charset=utf-8', phonePage()); } catch (e) {
        console.error(e.message);
        send(res, 500, 'text/plain; charset=utf-8', 'error');
      }
      return true;
    }
    if (req.method === 'GET' && has(FILES, name)) {
      fs.readFile(path.join(RENDERER, name), (err, buf) => {
        if (err) send(res, 404, 'text/plain; charset=utf-8', '');
        else send(res, 200, FILES[name], buf);
      });
      return true;
    }

    // El resto necesita la clave del celular (EventSource no manda cabeceras: va en ?k=)
    if (!safeEqual(req.headers['x-panda-view'] || url.searchParams.get('k'), token)) {
      empty(res, 401);
      return true;
    }

    if (req.method === 'GET' && name === 'state') {
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify(getState()));
      return true;
    }

    if (req.method === 'GET' && name === 'stream') {
      if (clients.size >= MAX_CLIENTS) { empty(res, 503); return true; }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Connection: 'keep-alive',
      });
      res.write(`retry: 3000\ndata: ${JSON.stringify(getState())}\n\n`);
      clients.add(res);
      viewersChanged();
      req.on('close', () => { clients.delete(res); viewersChanged(); });
      return true;
    }

    // Tocar una sesión o un equipo en el celular salta a esa pestaña en la computadora
    if (req.method === 'POST' && name === 'focus') {
      if (!/^application\/json/.test(req.headers['content-type'] || '')) { empty(res, 415); return true; }
      let body = '';
      let tooBig = false;
      req.on('data', (c) => {
        body += c;
        if (body.length > MAX_BODY) { tooBig = true; req.destroy(); }
      });
      req.on('end', () => {
        if (tooBig) return;
        try {
          const msg = JSON.parse(body);
          if (msg && typeof msg.id === 'string') focusSession(msg.id);
          else if (msg && typeof msg.team === 'string') focusTeam(msg.team);
        } catch (e) { /* ignorado */ }
        empty(res, 204);
      });
      return true;
    }

    empty(res, 404);
    return true;
  }

  function broadcast(data) {
    if (!clients.size) return;
    const line = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(line);
  }

  // Mantiene viva la conexión aunque no pase nada
  setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

  /* ---------- Cable USB (Android) ---------- */

  const bridged = new Set();
  const pending = new Set();
  let adbMissing = false;
  let onChange = () => {};

  const adb = (args, cb) => execFile('adb', args, { timeout: 8000, windowsHide: true }, cb);

  function pollUsb() {
    if (adbMissing) return;
    adb(['devices'], (err, out) => {
      if (err) {
        if (err.code === 'ENOENT') {
          adbMissing = true;
          log('[celular] No encontré adb: el panda en el celular por cable queda apagado.');
        }
        return;
      }
      // Solo los autorizados ("device"); "unauthorized" espera que aceptes en el celular
      const now = new Set();
      for (const line of String(out).split('\n')) {
        const [serial, status] = line.trim().split(/\s+/);
        if (status === 'device' && RE_SERIAL.test(serial)) now.add(serial);
      }
      for (const s of [...bridged]) {
        if (!now.has(s)) { bridged.delete(s); onChange(); }
      }
      // Si adb se reinició, el puente se pierde aunque el celular siga enchufado:
      // se comprueba en cada vuelta y, si falta, se vuelve a armar.
      for (const s of bridged) {
        if (!now.has(s) || pending.has(s)) continue;
        adb(['-s', s, 'reverse', '--list'], (e, list) => {
          if (e || String(list).includes(`tcp:${port}`) || pending.has(s)) return;
          pending.add(s);
          adb(['-s', s, 'reverse', `tcp:${port}`, `tcp:${port}`], () => pending.delete(s));
        });
      }
      for (const s of now) {
        if (bridged.has(s) || pending.has(s)) continue;
        pending.add(s);
        adb(['-s', s, 'reverse', `tcp:${port}`, `tcp:${port}`], (e) => {
          pending.delete(s);
          if (e) return; // se reintenta en la próxima vuelta
          bridged.add(s);
          log(`[celular] Conectado por cable: ${s}`);
          onChange();
          // Al enchufarlo, el panda se muda al celular. Antes espera un poco:
          // si la página ya estaba abierta, se reconecta sola y no hace falta abrirla.
          if (autoOpen) {
            setTimeout(() => { if (bridged.has(s) && clients.size === 0) openOn(s); }, AUTO_OPEN_WAIT_MS);
          }
        });
      }
    });
  }

  function startUsb(changed) {
    if (typeof changed === 'function') onChange = changed;
    pollUsb();
    setInterval(pollUsb, 4000).unref();
  }

  // Abre la página en el navegador del celular con la clave: viaja solo por el cable
  function openOn(serial) {
    const link = `http://localhost:${port}/phone/?k=${token}`;
    adb(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`], (e) => {
      if (e) log(`[celular] No pude abrir la página en ${serial}: ${e.message}`);
    });
  }
  function openOnDevices() {
    for (const s of bridged) openOn(s);
  }

  return { handle, broadcast, startUsb, openOnDevices, devices: () => [...bridged] };
}

module.exports = { createPhone, loadPhoneToken };
