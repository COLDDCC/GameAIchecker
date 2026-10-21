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

This is a transitional migration preserving existing pages, not yet a full database-driven architecture. Build has not been executed locally in this assistant environment; use the GitHub Actions result as the actual build verification. Feedback voting still needs Cloudflare D1 `DB` binding, `FEEDBACK_SECRET`, and `schema.sql` initialization. Until then the feedback form stays disabled. Legacy HTML routes are discovered automatically from folders containing `index.html`. GitHub Actions runs a build on every push to `main` and checks key output files. Check the **Actions** tab for the first passing build before deploying.
