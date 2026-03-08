#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/.codex-backups/20260307-youtube-theme"

cp "$BACKUP_DIR/App.tsx.bak" "$ROOT_DIR/src/App.tsx"
cp "$BACKUP_DIR/index.css.bak" "$ROOT_DIR/src/index.css"
cp "$BACKUP_DIR/App.css.bak" "$ROOT_DIR/src/App.css"

printf 'Restored style files from %s\n' "$BACKUP_DIR"
