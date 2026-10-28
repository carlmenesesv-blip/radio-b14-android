#!/usr/bin/env bash
# Copia la interfaz web del radio a la app de Windows (www/).
# Uso: ./sync-www.sh [ruta-a-radio-os]   (por defecto ../radio-os)
set -euo pipefail
SRC="${1:-../radio-os}"
DST="www"
[ -f "$SRC/index.html" ] || { echo "No encuentro $SRC/index.html"; exit 1; }
rm -rf "$DST"; mkdir -p "$DST"
cd "$SRC"
find . -type f \
  ! -name 'server.js' ! -name 'package.json' ! -name 'radio-os.zip' ! -name 'LEEME-*.md' \
  ! -path './uploads/*' ! -path './.claude/*' ! -path './node_modules/*' ! -path './.git/*' \
  ! -name 'sw.js' ! -name 'phone.*' ! -path './legacy/*' \
  -print0 | while IFS= read -r -d '' f; do
    mkdir -p "$OLDPWD/$DST/$(dirname "$f")"; cp "$f" "$OLDPWD/$DST/$f"
  done
echo "Interfaz copiada a $DST"
