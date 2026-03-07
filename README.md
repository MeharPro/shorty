# Shorty

Shorty turns long videos into short-form content.

Current product scope:
- Feature 1: turn existing videos into ranked reels
- Feature 2: brain rot AI reels (planned / partial)
- Base requirements: login, past work, upload, download

## Current status

The current app is a React + Vite frontend with Vercel-style API routes.

What works now:
- Email signup / login with Supabase when browser auth env vars are set
- Local fallback session when Supabase browser config is missing
- Source video upload through Cloudinary Upload Widget
- Feature 1 reel generation from:
  - uploaded Cloudinary source video
  - Google Drive link
- Reel ranking with virality scoring
- Past work history stored locally and optionally synced to Supabase
- Download links for generated reels
- Feature 2 route and product placeholder

Validation status:
- `npm run lint` passes
- `npm run build` passes

## Product flows

### Dashboard
Route: [/](src/App.tsx#L57)

The dashboard is intentionally minimal and focused on the required product surface:
- auth entry / session state
- source upload
- Feature 1 access
- past work visibility through reel history
- Feature 2 summary

### Feature 1
Route: [src/pages/Feature1Page.tsx](src/pages/Feature1Page.tsx)

Goal:
- turn long videos into 30–60 second short-form clips
- generate as many clips as make sense
- rank them by virality score
- let the user review and download results

Inputs:
- uploaded source video
- Google Drive link
- optional transcript text
- optional auto-transcription through the backend

Outputs:
- ranked reel batch
- recommended top clip
- downloadable reel URLs
- saved past work entries

### Feature 2
Route: [src/pages/Feature2Page.tsx](src/pages/Feature2Page.tsx)

Planned scope:
- Minecraft gameplay base
- topic selection
- ElevenLabs voice selection
- 10–50 generated outputs
- ranking by brain rot score

This is not fully implemented yet.

## Tech stack

- React 19
- Vite
- TypeScript
- React Router
- Cloudinary
- Supabase
- Vercel serverless-style API routes

Key dependencies are listed in [package.json](package.json).

## Project structure

Main app files:
- [src/App.tsx](src/App.tsx)
- [src/pages/DashboardPage.tsx](src/pages/DashboardPage.tsx)
- [src/pages/AuthPage.tsx](src/pages/AuthPage.tsx)
- [src/pages/Feature1Page.tsx](src/pages/Feature1Page.tsx)
- [src/pages/Feature2Page.tsx](src/pages/Feature2Page.tsx)

Feature 1 helpers:
- [src/components/ReelGeneratorPanel.tsx](src/components/ReelGeneratorPanel.tsx)
- [src/lib/reels.ts](src/lib/reels.ts)
- [src/lib/transcription.ts](src/lib/transcription.ts)
- [lib/reelPipeline.js](lib/reelPipeline.js)
- [api/generate-reels.js](api/generate-reels.js)
- [api/transcribe-video.js](api/transcribe-video.js)
- [lib/transcription.js](lib/transcription.js)

Auth and persistence:
- [src/lib/supabase.ts](src/lib/supabase.ts)
- [src/lib/session.ts](src/lib/session.ts)
- [src/lib/persistence.ts](src/lib/persistence.ts)
- [supabase/schema.sql](supabase/schema.sql)

Cloudinary:
- [src/cloudinary/config.ts](src/cloudinary/config.ts)
- [src/cloudinary/UploadWidget.tsx](src/cloudinary/UploadWidget.tsx)

## Local development

Install dependencies:

```bash
npm install
```

Run frontend only:

```bash
npm run dev
```

Run the local startup script:

```bash
npm start
```

What `npm start` does:
- starts Vite on `127.0.0.1:5173` by default
- starts Vercel dev on `127.0.0.1:3000` if the Vercel CLI is installed and authenticated
- skips backend startup cleanly if Vercel CLI is unavailable

Startup script: [start.sh](start.sh)

## Environment variables

See [.env.example](.env.example).

### Minimum useful setup

#### Cloudinary
Required for real uploads:
- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`

Required for server-side Cloudinary routes:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

How to get them:
1. Open the Cloudinary console.
2. Copy your cloud name, API key, and API secret.
3. Create an **unsigned** upload preset under Settings → Upload → Upload presets.
4. Put that preset name into `VITE_CLOUDINARY_UPLOAD_PRESET`.

#### Supabase
Required for real login / saved-user history:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Optional server-side Supabase config:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

If browser auth works already, these can stay as-is.

#### Transcription
Optional, but needed for auto-transcription:
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_TRANSCRIPTION_MODEL`

The transcription backend is OpenAI-compatible, so it can point at:
- OpenAI
- a local Whisper-compatible server
- another OpenAI-compatible transcription endpoint

## Local Whisper-compatible transcription

The app expects an OpenAI-compatible transcription API.

That means the easiest local path is:
- run a local Whisper-compatible server
- point `OPENAI_BASE_URL` at it
- set `OPENAI_API_KEY` if the server expects one
- set `OPENAI_TRANSCRIPTION_MODEL` to the model name that server exposes

Example shape:

```dotenv
OPENAI_API_KEY=local
OPENAI_BASE_URL=http://127.0.0.1:8000/v1
OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

Notes:
- exact startup depends on the server you choose
- this repo does not currently bundle the local Whisper server itself
- the backend already supports the compatible API pattern

## Database setup

If you want Supabase-backed past work, apply the schema in:
- [supabase/schema.sql](supabase/schema.sql)

That file includes the reel history table and policies used by the app.

## API routes

Current API routes:
- [api/health.js](api/health.js)
- [api/render-manifest.js](api/render-manifest.js)
- [api/resolve-gameplay.js](api/resolve-gameplay.js)
- [api/sign-cloudinary.js](api/sign-cloudinary.js)
- [api/generate-reels.js](api/generate-reels.js)
- [api/transcribe-video.js](api/transcribe-video.js)

## Testing

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

Smoke test:

```bash
npm run test:smoke
```

Optional env vars for auth-aware smoke coverage:
- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`

## What is not finished yet

- Feature 2 generation pipeline is not complete
- Real brain rot scoring is not implemented yet
- ElevenLabs integration is not wired yet
- The dedicated feature pages are larger / older than the new minimal dashboard shell
- Full production hardening is still pending

## Security notes

- Do not commit `.env`
- Keep `CLOUDINARY_API_SECRET` server-only
- If a secret was exposed during development, rotate it
- Do not put server secrets into `VITE_` variables

## Summary

Shorty currently ships a real Feature 1 MVP:
- authenticate users
- upload a source video
- generate ranked reels
- save past work
- download outputs

Feature 2 is intentionally present as the next build target, not as a completed workflow.
