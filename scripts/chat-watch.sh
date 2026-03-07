#!/usr/bin/env bash
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
MAILBOX_DIR="$ROOT_DIR/.coordination"
LOG_FILE="$MAILBOX_DIR/messages.tsv"
lines=20

usage() {
  cat <<'EOF'
Usage:
  scripts/chat-watch.sh [-n lines]

Example:
  scripts/chat-watch.sh
  scripts/chat-watch.sh -n 50
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -n|--lines)
      lines="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

mkdir -p "$MAILBOX_DIR"

if [ ! -f "$LOG_FILE" ]; then
  printf '# timestamp\tagent\tbranch\tmessage\n' > "$LOG_FILE"
fi

printf 'watching %s\n' "$LOG_FILE"
tail -n "$lines" -f "$LOG_FILE" | awk -F '\t' '
  /^#/ { next }
  {
    printf "[%s] %s @ %s: %s\n", $1, $2, $3, $4
    fflush()
  }
'
