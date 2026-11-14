#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Instalando dependencias..."
cd "$DIR" && npm install

chmod +x "$DIR/hooks/panda-hook.sh" "$DIR/bin/panda-tab"

command -v jq >/dev/null || echo "Falta jq. Instalalo con: brew install jq"

# Token secreto para que solo tus hooks puedan hablarle al panda
mkdir -p "$HOME/.panda"
chmod 700 "$HOME/.panda"
if [ ! -f "$HOME/.panda/token" ]; then
  ( umask 077; openssl rand -hex 32 > "$HOME/.panda/token" )
  echo "Token generado en ~/.panda/token"
fi
chmod 600 "$HOME/.panda/token"

echo
echo "Listo. Pasos que siguen:"
echo "1. Edita $DIR/teams.json con tus equipos y colores."
echo "2. Agrega esto a ~/.claude/settings.json:"
echo
sed "s#RUTA#$DIR#g" "$DIR/hooks/settings-snippet.json"
echo
echo "3. En cada proyecto, crea un archivo .claude-tab con la clave del equipo (por ejemplo team1)."
echo "4. Arranca Pandaemon: cd $DIR && npm start"
