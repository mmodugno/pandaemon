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

# PANDA_TEAM (variable de entorno) fuerza el equipo, por ejemplo:
#   PANDA_TEAM=team1 claude
# Si no está, busca .claude-tab en la carpeta actual y en las de arriba.
# Así un solo archivo en la carpeta del equipo marca a todos sus proyectos.
TEAM="${PANDA_TEAM:-}"
DIR_SEARCH="$PWD"
[ -n "$TEAM" ] && DIR_SEARCH=""
while [ -n "$DIR_SEARCH" ] && [ "$DIR_SEARCH" != "/" ]; do
  if [ -f "$DIR_SEARCH/.claude-tab" ]; then
    TEAM="$(tr -d '[:space:]' < "$DIR_SEARCH/.claude-tab")"
    break
  fi
  DIR_SEARCH="$(dirname "$DIR_SEARCH")"
done
[ -z "$TEAM" ] && exit 0

# La clave del equipo solo puede tener letras, numeros, guion y guion bajo
case "$TEAM" in
  *[!A-Za-z0-9_-]*) exit 0 ;;
esac

SESSION="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)"
MESSAGE="$(echo "$INPUT" | jq -r '.message // empty' 2>/dev/null)"
[ -z "$SESSION" ] && SESSION="$PPID"

# El hook corre sin terminal propia: busca la de Claude Code subiendo
# por los procesos padre hasta encontrar uno con tty (ttysNNN).
TTY=""
PID_SEARCH="$PPID"
for _ in 1 2 3 4 5 6; do
  T="$(ps -o tty= -p "$PID_SEARCH" 2>/dev/null | tr -d ' ')"
  case "$T" in
    ttys[0-9]*) TTY="/dev/$T"; break ;;
  esac
  PID_SEARCH="$(ps -o ppid= -p "$PID_SEARCH" 2>/dev/null | tr -d ' ')"
  [ -z "$PID_SEARCH" ] || [ "$PID_SEARCH" -le 1 ] && break
done

# Pestaña: título, color y campanita según el evento
case "$TYPE" in
  done|ask) PANDA_TTY="$TTY" "$HOOK_DIR/../bin/panda-tab" "$TEAM" "🔔" 2>/dev/null ;;
  *)        PANDA_TTY="$TTY" "$HOOK_DIR/../bin/panda-tab" "$TEAM" 2>/dev/null ;;
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
