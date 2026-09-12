#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(python3 - <<'PY' "$ROOT_DIR/manifest.json"
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    print(json.load(f)['version'])
PY
)"
DIST_DIR="$ROOT_DIR/dist"
OUT="$DIST_DIR/api-copy-devtools-v${VERSION}.zip"

mkdir -p "$DIST_DIR"
rm -f "$OUT"

cd "$ROOT_DIR"
zip -q -r "$OUT" \
  manifest.json \
  devtools.html devtools.js \
  panel.html panel.css panel.js \
  icon16.png icon48.png icon128.png

echo "$OUT"
