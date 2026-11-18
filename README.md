# Pandaemon 🐼

A tiny desktop panda that keeps an eye on your Claude Code sessions.

- **Reacts to what Claude is doing:** sips coffee while it works, cheers when a session finishes, looks curious when it needs you, gets worried if you leave it waiting, and falls asleep when nothing happens.
- **Session panel:** click the panda to see every session with its team color, project, status and how long it has been in that state. Click a row to jump to that iTerm2 tab. Right-click a row (or a team chip) to ignore it: it disappears, its tab loses the bell, and it only comes back when you type in that session again or it asks you for something. The tray menu can bring back every ignored session.
- **Team counters:** colored chips show how many sessions are waiting for you, per team.
- **Tab titles and colors:** every iTerm2 tab gets its team's title and color, so you never lose track of six terminals.
- **Polished details:** the eyes follow your cursor across the whole screen, it blinks, wakes up with a stretch, remembers where you left it, and never steals focus from your terminal.
- **Menu bar icon:** mute notifications, hide the panda or quit.

## What works where

| Part | macOS + iTerm2 | Windows / Linux |
| --- | --- | --- |
| The panda, panel and animations | Yes | Yes |
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

Teams live in `teams.json`. Each one has a key, a name, a short name, a color and an emoji:

```json
"team1": { "name": "Equipo 1", "short": "E1", "color": "#dc2828", "emoji": "🔴" }
```

You can delete, add or rename teams. Restart Pandaemon after editing the file.

## Settings

`pandaemon.config.json`:

| Key | Default | Meaning |
| --- | --- | --- |
| `style` | `"classic"` | `"classic"` for dark patches, `"soft"` for soft gray patches |
| `followCursor` | `true` | The panda's eyes follow the mouse. Can also be toggled at runtime from the tray menu or by right-clicking the panda |
| `sleepMinutes` | `10` | Minutes without activity before the panda falls asleep |
| `escalateMinutes` | `5` | Minutes a session can wait for you before the panda gets worried |

## Usage

1. Create a `.claude-tab` file containing the team key, for example `team1`. Put it in a project's root, or in a parent folder to mark every project inside it. The closest file wins.
2. Start Pandaemon with `npm start`.
3. Open Claude Code as usual.

The first time you jump to a tab, macOS asks for automation permission to control iTerm2. Accept it.

Drag the panda by its body to move it. Click it to open or close the session panel. Use the menu bar icon to mute notifications or quit.

## The panda on your phone (Android, USB)

Plug an Android phone into the computer and the same panda shows up full screen on it: it reacts the same way, shows the team chips and the session panel, and tapping a session jumps to that iTerm2 tab on the computer.

1. Once: enable **USB debugging** on the phone (Settings → About phone → tap "Build number" 7 times, then Developer options → USB debugging) and install `adb` on the computer (`brew install --cask android-platform-tools`).
2. Start Pandaemon from a terminal (`npm start`) so it can find `adb`, plug in the phone and accept "Allow USB debugging?".
3. Menu bar icon → **Abrir el panda en el celular**. The page opens in the phone's browser; add it to the home screen to open it full screen next time.

Pandaemon sets up `adb reverse` by itself every time you plug the phone in. The server still listens only on `127.0.0.1`: the phone reaches it through the USB cable, never through the network. The phone uses its own key (`~/.panda/phone-token`), separate from the hooks token. With it, the phone can see the sessions and jump to a tab, but it cannot send events. The key travels to the phone over the cable and is not left in the address bar. Since the page is served from `localhost`, the browser keeps the screen on.

## See the panda without hooks

With Pandaemon running:

```bash
npm run demo
```

The script sends fake events so you can watch every state, and the panel fills with demo sessions. It needs a token in `~/.panda/token` (on macOS `install.sh` creates it).

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
