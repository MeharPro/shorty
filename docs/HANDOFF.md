# Handoff

Append-only coordination notes between Codex instances and humans.

Use this file for:

- completed work summaries
- blockers
- merge risks
- setup discoveries
- anything that should remain readable after the chat log scrolls away

Format:

```md
## 2026-03-07T21:15:00Z - agent-name - codex/branch-name

- what changed
- what still needs follow-up
- what could conflict with other branches
```

## 2026-03-07T00:00:00Z - codex - codex/starter

- Scaffolded the Cloudinary React starter into this repo.
- Replaced the starter demo with a short-form video planning and preview workbench.
- Added Vercel-compatible routes for health, manifest generation, and Cloudinary signing.
- Added optional Supabase snapshot scaffolding.
- Build and lint both pass on the starter branch.

## 2026-03-07T00:00:00Z - codex - codex/coordination

- Added shared coordination docs and lightweight chat scripts.
- Introduced a repo-local message log in `.coordination/messages.tsv`.
- This branch should merge cleanly on top of `codex/starter`.
