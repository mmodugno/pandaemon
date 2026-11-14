// Demo: sends fake events to Pandaemon so you can watch every state.
// Works on macOS, Linux and Windows. Start Pandaemon first (npm start) and
// make sure a token exists in ~/.panda/token.
//
// Usage: npm run demo

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
  console.error(`Token not found at ${tokenPath}.`);
  console.error('Create it (see README, "See the panda without hooks") and restart Pandaemon.');
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
      console.error('Could not connect. Is Pandaemon running (npm start)?');
      process.exit(1);
    });
    req.end(body);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const step = async (text, ms, ...args) => { console.log(text); await send(...args); await wait(ms); };

(async () => {
  console.log('Tip: click the panda to open the session panel while the demo runs.\n');

  await step('Team 1 starts a session in "checkout-api"...', 2500, 'start', 'team1', 'demo-1', '/work/checkout-api');
  await step('Team 2 starts a session in "mobile-app"...', 2500, 'start', 'team2', 'demo-2', '/work/mobile-app');
  await step('Both start working (coffee time)...', 6000, 'working', 'team1', 'demo-1', '/work/checkout-api');
  await send('working', 'team2', 'demo-2', '/work/mobile-app');
  await wait(1000);
  await step('Team 1 finishes (happy)...', 6000, 'done', 'team1', 'demo-1', '/work/checkout-api');
  await step('Team 3 needs you (curious)...', 7000, 'ask', 'team3', 'demo-3', '/work/docs-site');
  await step('Team 2 finishes...', 6000, 'done', 'team2', 'demo-2', '/work/mobile-app');

  console.log('Cleaning up the demo sessions.');
  for (const [team, id] of [['team1', 'demo-1'], ['team2', 'demo-2'], ['team3', 'demo-3']]) {
    await send('end', team, id, '');
  }
  console.log('Done. The panda falls asleep after a while without activity.');
})();
