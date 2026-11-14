#!/bin/bash
# Uso: panda-hook.sh <start|working|done|ask|end>
# Lo llaman los hooks de Claude Code. Pinta la pestaña de iTerm2 y le avisa a Pandaemon.

TYPE="$1"
INPUT="$(cat)"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN_FILE="$HOME/.panda/token"

# Sin token no hay nada que enviar
[ -f "$TOKEN_FILE" ] || exit 0
TOKEN="$(cat "$TOKEN_FILE")"

TEAM=""
[ -f .claude-tab ] && TEAM="$(tr -d '[:space:]' < .claude-tab)"
[ -z "$TEAM" ] && exit 0

# La clave del equipo solo puede tener letras, numeros, guion y guion bajo
case "$TEAM" in
  *[!A-Za-z0-9_-]*) exit 0 ;;
esac

SESSION="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
MESSAGE="$(echo "$INPUT" | jq -r '.message // empty' 2>/dev/null)"
[ -z "$SESSION" ] && SESSION="$PPID"

TTY="$(ps -o tty= -p $PPID 2>/dev/null | tr -d ' ')"
[ -n "$TTY" ] && TTY="/dev/$TTY"

# Pestaña: título, color y campanita según el evento
case "$TYPE" in
  done|ask) "$HOOK_DIR/../bin/panda-tab" "$TEAM" "🔔" 2>/dev/null ;;
  *)        "$HOOK_DIR/../bin/panda-tab" "$TEAM" 2>/dev/null ;;
esac

PAYLOAD="$(jq -n \
  --arg type "$TYPE" --arg team "$TEAM" --arg session "$SESSION" \
  --arg cwd "$PWD" --arg tty "$TTY" --arg message "$MESSAGE" \
  '{type:$type, team:$team, session:$session, cwd:$cwd, tty:$tty, message:$message}')"

curl -s -m 1 -X POST \
  -H 'Content-Type: application/json' \
  -H "X-Panda-Token: $TOKEN" \
  -d "$PAYLOAD" http://127.0.0.1:47800/event >/dev/null 2>&1 || true
exit 0
