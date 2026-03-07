# Coordination Mailbox

This directory is the repo-local communication layer for multiple Codex instances.

It is not true networked real-time chat. It is a shared mailbox in the repository.

## Files

- `messages.tsv`: append-only quick messages

## Scripts

- [`scripts/chat-send.sh`](/Users/meharkhanna/yt-shortmaker/scripts/chat-send.sh)
- [`scripts/chat-watch.sh`](/Users/meharkhanna/yt-shortmaker/scripts/chat-watch.sh)

## Message Format

Tab-separated values:

1. UTC timestamp
2. agent name
3. branch name
4. message body

## Typical Workflow

1. Run `scripts/chat-watch.sh`
2. Send short updates with `scripts/chat-send.sh`
3. Record durable status in [`docs/HANDOFF.md`](/Users/meharkhanna/yt-shortmaker/docs/HANDOFF.md)
4. Claim or update tasks in [`docs/TASKS.md`](/Users/meharkhanna/yt-shortmaker/docs/TASKS.md)
