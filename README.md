# Game AI Checker

Independent evidence-led research into generative AI use in video games.

## Status

This is a static prototype, **not** a functioning AI detector or live Steam disclosure API. The initial game names are a review queue, not verified findings. No level is assigned without reviewable evidence.

## Deploy on Cloudflare Pages

Connect `COLDDCC/GameAIchecker` to Pages (Git integration).

- Framework preset: `Astro` (or `None` with the explicit build command below)
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank
- Production branch: `main`
- Node.js version: 22 or newer

**Important:** the old configuration (empty build command, output `/`) publishes repository-root HTML and will *not* deploy dynamically generated game pages. Change these settings in **Cloudflare Pages → project → Settings → Builds & deployments**. This repository cannot change existing Pages dashboard configuration by committing source files.

`npm run build` now fails if any of the 11 previously reviewed pages or its locally generated media is missing. `npm run audit:reviewed` rechecks the built `dist/` directory. The build downloads Steam metadata and images; CI must allow outbound access to Steam. If Steam blocks images and no cached local assets exist, the build fails rather than falsely passing a blank gallery.

After deployment, configure `gameaichecker.com` as a custom domain in Cloudflare Pages.

## Evidence requirements

Each future report must contain Steam App ID, original source URL, source date, archived snapshot if permitted, exact AI-use statement or finding, claimed use category, reviewer status, and correction history. Official disclosure, independently reviewed evidence, and unverified reports must remain separate. `Unrated` is the default until sufficient evidence is checked. AI-assisted classification is not independent proof.

## Planned next steps

1. Implement a structured, source-backed game database and real lookup by App ID.
2. Add evidence review UI, reports submission backend, and corrections workflow.
3. Add a Next Fest 2026 event index only after validating the official event game list and source permissions.
4. Add accurate per-game pages and sitemap once substantial original information is available.

Not affiliated with Valve or Steam.