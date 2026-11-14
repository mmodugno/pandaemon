# Pandaemon 🐼

A desktop panda mascot that keeps an eye on your Claude Code sessions.

- Changes its face when a session finishes or needs you.
- Counts how many sessions are waiting for you, per team or project.
- One click jumps to the matching iTerm2 tab.
- Paints every iTerm2 tab with its team's title and color, so you never lose track of six terminals.

## What works where

| Part | macOS + iTerm2 | Windows / Linux |
| --- | --- | --- |
| The panda and its faces | Yes | Yes |
| Demo with `npm run demo` | Yes | Yes |
| Claude Code hooks | Yes | No |
| Tab title and color | Yes (iTerm2) | No |
| Jump to tab | Yes | No |

## Requirements

- Node.js 18 or newer.
- For hooks and tabs: macOS, iTerm2 and `jq` (`brew install jq`).

## Install (macOS)

```bash
git clone https://github.com/mmodugno/pandaemon.git
cd pandaemon
./install.sh
```

The installer downloads dependencies, generates a secret token in `~/.panda/token` and prints the next steps.

## Configure your teams

Everything lives in `teams.json`. Each team has a key, a name, a short name, a color and an emoji:

```json
"team1": { "name": "Equipo 1", "short": "E1", "color": "#dc2828", "emoji": "🔴" }
```

You can delete, add or rename teams. Restart Pandaemon after editing the file.

## Usage

1. In the root of each project, create a `.claude-tab` file containing the team key, for example `team1`.
2. Start Pandaemon with `npm start`.
3. Open Claude Code as usual.

The first time you click to jump to a tab, macOS asks for automation permission to control iTerm2. Accept it.

## See the panda without hooks

With Pandaemon running:

```bash
npm run demo
```

The script sends fake events so you can watch the faces change. In the panda window, keys 1 to 5 also show each face. It needs a token in `~/.panda/token` (on macOS `install.sh` creates it).

To create it by hand on Windows or Linux:

```bash
node -e "const fs=require('fs'),os=require('os'),p=os.homedir()+'/.panda';fs.mkdirSync(p,{recursive:true});fs.writeFileSync(p+'/token',require('crypto').randomBytes(32).toString('hex'))"
```

## Security

- The server listens only on `127.0.0.1`, meaning your own machine. Nothing is sent to the internet.
- Every event must carry the secret token in the `X-Panda-Token` header.
- Requests coming from a web page (`Origin` header) or with a `Host` other than the local one are rejected, which prevents DNS rebinding attacks.
- Every incoming field is validated, and the tab jump passes the terminal identifier as an argument, never as part of the AppleScript code.
- The window runs isolated: no Node integration, sandboxed, with a restrictive Content Security Policy.

Any program running as your user can read the token, so it does not protect against malware that is already installed.

## License

MIT
