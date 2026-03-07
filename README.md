# yt-shortmaker

Cloudinary-first hackathon build for turning longer-form video into vertical social cuts for YouTube Shorts, Instagram Reels, and TikTok.

This README is intentionally exhaustive. It captures:

- what the application currently does
- what it does not do yet
- the product and technical decisions made so far
- how the sponsor fit was evaluated
- how to run and test it locally
- how uploads, Vercel, and Supabase fit into the plan

It does **not** include raw private chain-of-thought. It does include the practical decision log and rationale behind the implementation.

## 1. Project Status

Current state:

- The app is scaffolded from Cloudinary's React starter.
- The UI is a working short-form video planning and preview tool.
- It generates Cloudinary delivery URLs for multiple social platforms.
- It supports sample media mode immediately.
- It supports real uploads once an unsigned Cloudinary upload preset is configured.
- It supports local browser snapshot saving now.
- It supports optional Supabase snapshot syncing if env vars are configured.
- It includes Vercel-compatible API routes for health checks, manifest generation, and signed upload preparation.

Current maturity:

- This is an MVP / starter, not a production-complete editor.
- It is optimized for the Cloudinary challenge first.
- It is not yet a full end-to-end AI shortmaker with automatic captions, transcript scoring, or final composite rendering.

Verification completed:

- `npm run build` passes
- `npm run lint` passes

## 2. Why This Exists

Original idea:

- Build a "YouTube shortmaker / Instagram reel maker"
- Turn regular videos into vertical outputs
- Potentially place gameplay or another motion bed underneath
- Use Cloudinary strongly enough to compete for the Cloudinary challenge
- Consider whether the concept could also be adapted toward Reactiv

Hackathon context:

- The main sponsor fit here is **Cloudinary**
- The product direction is a media-heavy web experience
- The build should feel production-ready enough to demo clearly

High-level product thesis:

- One source video should fan out into multiple social-ready outputs
- The app should make that transformation legible and fast
- Cloudinary should do the media-heavy work
- Vercel should orchestrate and host, not act as a video rendering farm
- Supabase should be optional and limited to app state, not raw media

## 3. Sponsor Fit Summary

### Cloudinary

This project is a strong Cloudinary fit because the current app is built around:

- Cloudinary starter tooling
- Cloudinary upload widget
- Cloudinary URL generation
- Cloudinary crop/trim/delivery recipes
- Cloudinary poster generation from video
- Cloudinary preview URL generation

The app demonstrates how one source asset can become multiple delivery outputs with different vertical presets.

### Reactiv

Important finding from the planning phase:

- A generic web-based shortmaker is **not** a natural Reactiv submission by itself.
- Reactiv's challenge is App Clip / iPhone / Swift based and lives in a separate starter repo.
- If Reactiv is pursued later, it should be a **separate companion experience**, not forced into this web app.

Practical conclusion:

- This repo should remain the Cloudinary-first web app.
- Any Reactiv submission should be built later in the Reactiv Swift starter as a separate repo or separate codebase.

## 4. Research / Planning Findings

The main conclusions reached during planning were:

- Use Cloudinary's official React starter instead of building the stack manually.
- Keep the frontend TypeScript-first.
- Keep the deployment target Vercel-friendly.
- Avoid using Vercel as the place where heavy video rendering happens.
- Use Supabase only if there is a clear need for persistence, auth, or saved jobs.
- Do not use Supabase Storage for the actual media; Cloudinary should own media storage and delivery.
- Treat Reactiv as a second-track opportunity, not something this repo must satisfy today.

Specific implementation-direction conclusions:

- Frontend: React + Vite + TypeScript
- Media layer: Cloudinary
- Hosting/orchestration: Vercel
- Persistence: local-first, optional Supabase
- Upload security strategy: unsigned preset for MVP, signed upload route available for later

## 5. What The App Currently Has

### Product-level features

- A branded landing/workbench UI for the shortmaker concept
- Sample source media and sample gameplay media out of the box
- Story presets for different content directions
- Editable hook headline, CTA, caption seed, duration, and start offset
- Platform-specific selection for Shorts / Reels / TikTok
- Preview cards for each selected platform
- Export manifest generation
- Local snapshot saving
- Optional Supabase sync for snapshot data

### Current story presets

- `Clip Commander`
- `Launch Loop`
- `Gameplay Stack`

### Current caption themes

- `Impact`
- `Clean Room`
- `Night Shift`

### Current platform outputs

- YouTube Shorts
- Instagram Reels
- TikTok

### Cloudinary functionality already used

- Cloudinary React starter scaffolding
- Cloudinary Upload Widget
- Cloudinary URL generation
- Cloudinary `trim()` video editing
- Cloudinary `preview()` URL generation
- Cloudinary smart crop / gravity for vertical outputs
- Cloudinary auto format / auto quality delivery
- Cloudinary poster extraction from video

### Persistence features

- Draft state saved in local storage
- Export snapshots saved in local storage
- Optional remote snapshot sync via Supabase

### Backend / Vercel features

- `/api/health`
- `/api/render-manifest`
- `/api/sign-cloudinary`

### Developer-experience features

- `.mcp.json` generated from the Cloudinary starter
- `.env.example`
- Supabase schema file
- README instructions
- Build and lint clean

## 6. What The App Does Not Have Yet

This is the critical section.

The application currently does **not** do the following yet:

- It does not auto-transcribe uploaded videos.
- It does not auto-burn real captions into final Cloudinary video outputs.
- It does not perform true split-screen or underlay compositing of source video plus gameplay in the final delivery URL.
- It does not score clips from transcripts using an LLM or other AI ranking service.
- It does not automatically find the "best moment" in a video beyond the generated preview URL strategy.
- It does not provide real timeline editing.
- It does not support user accounts or auth flows.
- It does not support project sharing between users.
- It does not have analytics.
- It does not deploy itself automatically.
- It does not yet integrate with the Reactiv App Clip kit.
- It does not yet connect the signed upload route into the browser widget.
- It does not yet run background jobs or queue-based rendering.
- It does not yet store jobs in Supabase by default.
- It does not yet turn gameplay stacking into a fully rendered production export.

## 7. What Exists As Scaffold Or Partial Work

These pieces exist, but are not fully production-wired:

- AI preview URL generation is present, but first-hit derived media generation may still take time on Cloudinary.
- Signed upload infrastructure exists as an API route, but the current browser flow still assumes the easier MVP path: unsigned preset upload.
- Supabase sync exists in code, but only works if env vars and the included schema are configured.
- Gameplay support exists as a staged asset in the UI and manifest, not as a true final composite render.
- The app is deployment-shaped for Vercel, but it has not been pushed live from this repo by default.

## 8. Detailed Feature Inventory

### A. Frontend

Implemented:

- Hero/workbench interface
- Story preset selection
- Platform selection toggles
- Caption seed input
- CTA input
- Start offset range control
- Duration selector
- Preview cards for every selected platform
- Copy manifest button
- Save snapshot button
- Sample mode for both main source and gameplay bed

Not implemented:

- Real timeline editor
- Multi-scene editing
- Drag and drop sequencing
- Visual subtitle editing
- Asset library

### B. Cloudinary Integration

Implemented:

- Configured Cloudinary URL client
- Configured upload widget
- Cloudinary-based source playback URLs
- Cloudinary-based poster URLs
- Cloudinary-based platform delivery URLs
- Cloudinary-based AI preview URLs

Not implemented:

- Final burned subtitle tracks
- Composite talking-head + gameplay exports
- Full signed upload browser flow
- Cloudinary admin-side asset search or management inside the UI

### C. Data / Persistence

Implemented:

- Local draft persistence
- Local export history
- Optional Supabase snapshot insert

Not implemented:

- Authentication
- User ownership rules
- Team collaboration
- Project loading dashboard

### D. API Layer

Implemented:

- Health route
- Manifest generation route
- Signed upload signature route

Not implemented:

- Queue orchestration
- Webhook handling
- Async render state polling
- Job cancellation

## 9. Current User Flow

The current intended local flow is:

1. Open the app
2. Use demo media immediately, or configure uploads
3. Pick a preset
4. Set headline, CTA, caption seed, clip length, and start offset
5. Toggle target platforms
6. Optionally queue gameplay media
7. Inspect each platform card
8. Copy or open the generated Cloudinary delivery URLs
9. Save a snapshot locally
10. Optionally sync snapshot data to Supabase

## 10. Local Testing

### Start the app

```bash
npm install
npm run dev
```

### Build and lint

```bash
npm run build
npm run lint
```

### What happens with no extra configuration

Without any extra setup:

- The app runs using Cloudinary's `demo` cloud.
- Sample source media is available.
- Upload buttons remain disabled because no upload preset is configured.
- You can still test the full UI and export-manifest flow.

## 11. Environment Variables

Copy [`.env.example`](/Users/meharkhanna/yt-shortmaker/.env.example) to `.env`.

### Client-side env vars

- `VITE_CLOUDINARY_CLOUD_NAME`
- `VITE_CLOUDINARY_UPLOAD_PRESET`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Server-side env vars

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Minimal setup required

To run in sample mode:

- `VITE_CLOUDINARY_CLOUD_NAME=demo`

To upload your own files:

- `VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name`
- `VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_upload_preset`

To use signed uploads later:

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

To use Supabase sync:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 12. Upload Strategy

Current upload strategy:

- The app uses the Cloudinary Upload Widget directly in the browser.
- For the MVP, uploads are expected to use an **unsigned upload preset**.
- This avoids putting API secrets in the browser.

What this means:

- No Cloudinary API key is required in the frontend for basic uploads.
- You only need a cloud name and unsigned preset to upload from the UI.

Why this was chosen:

- It is faster for a hackathon MVP.
- It keeps the local testing path simple.
- It avoids server complexity until the core product direction is validated.

What exists for later:

- A signed upload helper route already exists in [`api/sign-cloudinary.js`](/Users/meharkhanna/yt-shortmaker/api/sign-cloudinary.js)
- That route is intended for a later hardening pass

## 13. Vercel Position

The implementation assumes Vercel is the correct deployment target for:

- hosting the frontend
- running small orchestration routes
- serving manifest generation
- serving signature endpoints

The implementation explicitly does **not** assume Vercel should do heavy raw video rendering itself.

Reason:

- Cloudinary is the better place for media transformation and delivery
- Vercel should stay as the thin orchestration layer

Current Vercel-oriented files:

- [`api/health.js`](/Users/meharkhanna/yt-shortmaker/api/health.js)
- [`api/render-manifest.js`](/Users/meharkhanna/yt-shortmaker/api/render-manifest.js)
- [`api/sign-cloudinary.js`](/Users/meharkhanna/yt-shortmaker/api/sign-cloudinary.js)

## 14. Supabase Position

Supabase was evaluated as optional infrastructure.

Decision:

- Use Supabase for database and light persistence only
- Do not use Supabase Storage for media
- Keep Cloudinary as the media layer

Why:

- Media belongs in Cloudinary
- Database/state can live in Supabase if needed
- This separation keeps the architecture clean

Current Supabase scope:

- optional browser-side snapshot insert
- optional saved job table

Current schema file:

- [`supabase/schema.sql`](/Users/meharkhanna/yt-shortmaker/supabase/schema.sql)

What Supabase does not do yet:

- auth
- row ownership
- project dashboard
- user profiles

## 15. Reactiv Position

Reactiv was considered during brainstorming.

Conclusion:

- This web app should **not** be stretched into the Reactiv submission directly.
- Reactiv's challenge is App Clip / iPhone / Swift oriented.
- If Reactiv is pursued, it should be a separate companion codebase that reuses the product idea at the business level, not this repo at the framework level.

Practical translation:

- `yt-shortmaker` = Cloudinary challenge repo
- Reactiv clip = separate future repo or future parallel app

## 16. Current Architecture

### Frontend

- React 19
- Vite
- TypeScript
- Single-screen workbench UX

### Media layer

- Cloudinary URL generation
- Cloudinary widget uploads
- Cloudinary posters
- Cloudinary delivery URLs

### Persistence layer

- local storage by default
- Supabase optional

### API layer

- Vercel-style serverless endpoints

## 17. File Map

Core UI:

- [`src/App.tsx`](/Users/meharkhanna/yt-shortmaker/src/App.tsx)
- [`src/App.css`](/Users/meharkhanna/yt-shortmaker/src/App.css)
- [`src/index.css`](/Users/meharkhanna/yt-shortmaker/src/index.css)

Cloudinary:

- [`src/cloudinary/config.ts`](/Users/meharkhanna/yt-shortmaker/src/cloudinary/config.ts)
- [`src/cloudinary/UploadWidget.tsx`](/Users/meharkhanna/yt-shortmaker/src/cloudinary/UploadWidget.tsx)
- [`src/lib/rendering.ts`](/Users/meharkhanna/yt-shortmaker/src/lib/rendering.ts)
- [`.mcp.json`](/Users/meharkhanna/yt-shortmaker/.mcp.json)

Data / persistence:

- [`src/lib/persistence.ts`](/Users/meharkhanna/yt-shortmaker/src/lib/persistence.ts)
- [`src/lib/supabase.ts`](/Users/meharkhanna/yt-shortmaker/src/lib/supabase.ts)
- [`supabase/schema.sql`](/Users/meharkhanna/yt-shortmaker/supabase/schema.sql)

API routes:

- [`api/health.js`](/Users/meharkhanna/yt-shortmaker/api/health.js)
- [`api/render-manifest.js`](/Users/meharkhanna/yt-shortmaker/api/render-manifest.js)
- [`api/sign-cloudinary.js`](/Users/meharkhanna/yt-shortmaker/api/sign-cloudinary.js)

Project docs/config:

- [`.env.example`](/Users/meharkhanna/yt-shortmaker/.env.example)
- [`package.json`](/Users/meharkhanna/yt-shortmaker/package.json)
- [`README.md`](/Users/meharkhanna/yt-shortmaker/README.md)

## 18. Known Limitations

- Cloudinary transformed video URLs may need a first-hit generation delay.
- The preview cards are poster-driven, not full transformed video playback cards.
- Gameplay support is product-level and manifest-level today, not a fully rendered composite export.
- Caption styling is modeled in the UI, not baked into final media yet.
- Supabase sync is optional and currently minimal.
- Signed uploads exist server-side but are not yet wired to the browser widget flow.

## 19. What Was Brainstormed But Not Yet Built

These were part of the planning conversation and remain future work:

- automatic transcript generation
- automatic caption burn-in
- real split-screen export with gameplay underneath
- long-video-to-highlight AI selection
- richer social export variants
- sponsor-specific showcase moments for Cloudinary side quests
- a later Reactiv companion experience
- production deployment pipeline

## 20. Recommended Next Steps

Highest-value next moves:

1. Connect a real Cloudinary cloud and unsigned upload preset.
2. Verify real uploads end-to-end in the browser.
3. Wire the signed upload route into the upload flow if needed.
4. Decide whether the next milestone is:
   - auto-captioning
   - real compositing
   - smarter clip selection
   - Vercel preview deployment
5. If Reactiv is still desired, start a separate Swift repo instead of bending this repo.

## 21. Short Plain-English Summary

Right now this app is best described as:

> a Cloudinary-powered short-form video planner and export generator with sample/demo mode, real upload capability once configured, platform delivery recipes, manifest export, and optional Supabase snapshot storage

It is **not yet** a full automated AI video editor.

That is deliberate. The current build establishes the correct product direction and sponsor architecture first.

## 22. Multi-Codex Coordination

There is no native live Codex-to-Codex chat channel, so this repo now includes a lightweight coordination layer.

Shared docs:

- [`docs/DECISIONS.md`](/Users/meharkhanna/yt-shortmaker/docs/DECISIONS.md)
- [`docs/HANDOFF.md`](/Users/meharkhanna/yt-shortmaker/docs/HANDOFF.md)
- [`docs/TASKS.md`](/Users/meharkhanna/yt-shortmaker/docs/TASKS.md)

Quick message log:

- [`.coordination/messages.tsv`](/Users/meharkhanna/yt-shortmaker/.coordination/messages.tsv)

Scripts:

- [`scripts/chat-send.sh`](/Users/meharkhanna/yt-shortmaker/scripts/chat-send.sh)
- [`scripts/chat-watch.sh`](/Users/meharkhanna/yt-shortmaker/scripts/chat-watch.sh)

Example usage:

```bash
scripts/chat-watch.sh
scripts/chat-send.sh "Starting work on captions"
scripts/chat-send.sh -a codex-brother -b codex/captions "Touching src/lib/rendering.ts"
```
