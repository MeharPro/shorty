#!/usr/bin/env bash
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
MAILBOX_DIR="$ROOT_DIR/.coordination"
LOG_FILE="$MAILBOX_DIR/messages.tsv"

agent="${CODEX_AGENT_NAME:-$(whoami)}"
branch=""

usage() {
  cat <<'EOF'
Usage:
  scripts/chat-send.sh [-a agent] [-b branch] "message"

Examples:
  scripts/chat-send.sh "Starting caption branch work"
  scripts/chat-send.sh -a codex-brother -b codex/captions "Touching src/lib/rendering.ts"
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -a|--agent)
      agent="$2"
      shift 2
      ;;
    -b|--branch)
      branch="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [ "$#" -eq 0 ]; then
  usage
  exit 1
fi

mkdir -p "$MAILBOX_DIR"

if [ -z "$branch" ]; then
  branch="$(git -C "$ROOT_DIR" branch --show-current 2>/dev/null || printf 'unknown')"
fi

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
message="$*"
message="$(printf '%s' "$message" | tr '\t\r\n' '   ')"

if [ ! -f "$LOG_FILE" ]; then
  printf '# timestamp\tagent\tbranch\tmessage\n' > "$LOG_FILE"
fi

printf '%s\t%s\t%s\t%s\n' "$timestamp" "$agent" "$branch" "$message" >> "$LOG_FILE"
printf 'logged message to %s\n' "$LOG_FILE"
