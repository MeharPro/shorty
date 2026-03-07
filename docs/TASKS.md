# Tasks

Use this file to claim work and reduce branch collisions.

Rules:

- Claim the task before starting.
- Update status when blocked, done, or abandoned.
- Put the exact branch name in the branch column.
- If two branches touch the same files, note the merge risk explicitly.

## Active / Planned

| Task | Owner | Branch | Status | Notes |
| --- | --- | --- | --- | --- |
| Starter MVP baseline | Codex | `codex/starter` | done | Cloudinary-first starter already pushed |
| Coordination layer | Codex | `codex/coordination` | done | Shared docs + chat scripts |
| Real captioning pipeline | unclaimed |  | todo | Likely touches `src/lib/rendering.ts` and API routes |
| Signed upload wiring | unclaimed |  | todo | Will touch widget flow and `api/sign-cloudinary.js` |
| Vercel deployment setup | unclaimed |  | todo | Can use the local deploy skill if needed |
| Supabase auth and project dashboard | unclaimed |  | todo | Separate concern from media pipeline |

## Collision Watchlist

- `src/App.tsx`: high collision risk for most feature branches
- `src/lib/rendering.ts`: high collision risk for media features
- `README.md`: likely to drift unless changes are deliberate
