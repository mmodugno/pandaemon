// Demo: le manda eventos falsos a Pandaemon para ver todas las caritas.
// Funciona en macOS, Linux y Windows. Primero hay que tener Pandaemon corriendo
// (npm start) y un token en ~/.panda/token.
//
// Uso: npm run demo

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 47800;
const tokenPath = path.join(os.homedir(), '.panda', 'token');

let token;
try {
  token = fs.readFileSync(tokenPath, 'utf8').trim();
} catch (e) {
  console.error(`No encuentro el token en ${tokenPath}.`);
  console.error('Crealo con: node -e "require(\'fs\').mkdirSync(require(\'os\').homedir()+\'/.panda\',{recursive:true});require(\'fs\').writeFileSync(require(\'os\').homedir()+\'/.panda/token\',require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('y reinicia Pandaemon.');
  process.exit(1);
}

function send(type, team, session, cwd) {
  const body = JSON.stringify({ type, team, session, cwd, tty: '', message: '' });
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/event',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Panda-Token': token,
        },
      },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }
    );
    req.on('error', () => {
      console.error('No pude conectar. ¿Está corriendo Pandaemon (npm start)?');
      process.exit(1);
    });
    req.end(body);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('Equipo 1 arranca una sesión...');
  await send('start', 'team1', 'demo-1', '/proyectos/api');
  await wait(2500);

  console.log('Equipo 2 está trabajando...');
  await send('working', 'team2', 'demo-2', '/proyectos/web');
  await wait(2500);

  console.log('Equipo 1 terminó (carita contenta)...');
  await send('done', 'team1', 'demo-1', '/proyectos/api');
  await wait(5000);

  console.log('Equipo 3 te necesita (carita curiosa)...');
  await send('ask', 'team3', 'demo-3', '/proyectos/docs');
  await wait(5000);

  console.log('Equipo 2 terminó...');
  await send('done', 'team2', 'demo-2', '/proyectos/web');
  await wait(5000);

  console.log('Cerrando sesiones de la demo.');
  for (const s of ['demo-1', 'demo-2', 'demo-3']) {
    await send('end', 'team1', s, '');
  }
  console.log('Listo.');
})();
