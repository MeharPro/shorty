# Decisions

This file is the shared source of truth for stable facts that both Codex instances should respect.

Update this file when a decision becomes durable. Do not use it for transient status updates.

## Current Product Direction

- This repo is the **Cloudinary-first** web app.
- Reactiv, if pursued, should be a separate Swift/App Clip codebase.
- The current app is an MVP starter, not a full automated editor.

## Architecture

- Frontend: React 19 + Vite + TypeScript
- Media layer: Cloudinary
- Hosting/orchestration: Vercel-style serverless routes
- Persistence: local storage first, optional Supabase
- Media storage/delivery belongs in Cloudinary, not Supabase

## Current Feature Boundary

Implemented:

- sample-media mode
- Cloudinary upload widget integration
- vertical delivery URL generation
- poster generation from video
- story presets, platform presets, caption themes
- local snapshot saving
- optional Supabase snapshot sync
- Vercel-compatible helper routes

Not implemented yet:

- real auto-transcription
- real caption burn-in
- final split-screen gameplay compositing
- AI clip scoring / highlight extraction
- auth or collaboration UI

## Branch Policy

- Branch names must use the `codex/` prefix.
- `codex/starter` is the baseline starter branch.
- Coordination work lives on `codex/coordination`.
- New feature branches should be task-specific, for example:
  - `codex/captions`
  - `codex/deploy`
  - `codex/auth`

## Secrets Policy

- Never commit `.env`.
- Never place secrets in `VITE_` variables unless they are safe for the browser.
- Cloudinary API secret is server-only.
- If a secret was pasted into chat, assume it may need rotation later.

## Coordination Policy

- Use [`docs/TASKS.md`](/Users/meharkhanna/yt-shortmaker/docs/TASKS.md) to claim work.
- Use [`docs/HANDOFF.md`](/Users/meharkhanna/yt-shortmaker/docs/HANDOFF.md) for durable human-readable updates.
- Use `.coordination/messages.tsv` for quick repo-local chat-style messages.
- Before starting a new task, read this file first.
