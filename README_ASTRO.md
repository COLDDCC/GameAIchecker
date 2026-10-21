# Game AI Checker — Astro deployment

The site now uses Astro 5 static output. Existing HTML files remain the source during migration, prerendered to the same routes. JSON from `data/` is copied into `dist/data/` by the build script.

Cloudflare Pages settings:
- Production branch: `main`
- Framework: **Astro**
- Build command: `npm run build`
- Build output: `dist`
- Root directory: default
- Set `NODE_VERSION=22` if Cloudflare uses an older Node runtime.

Run locally: `npm install && npm run build && npm run preview`.

This is a transitional migration preserving existing pages, not yet a full database-driven architecture. Feedback voting still needs Cloudflare D1 `DB` binding, `FEEDBACK_SECRET`, and `schema.sql` initialization. Until then the feedback form stays disabled. When adding a new legacy HTML route, add it to the route list in `src/pages/[...slug].astro`.
