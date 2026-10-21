# Game AI Checker

Independent evidence-led research into generative AI use in video games.

## Status

This is a static prototype, **not** a functioning AI detector or live Steam disclosure API. The initial game names are a review queue, not verified findings. No level is assigned without reviewable evidence.

## Deploy on Cloudflare Pages

Connect `COLDDCC/GameAIchecker` to Pages (Git integration).

- Framework preset: `None`
- Build command: leave blank
- Build output directory: `/`
- Root directory: leave blank
- Production branch: `main`

After deployment, configure `gameaichecker.com` as a custom domain in Cloudflare Pages.

## Evidence requirements

Each future report must contain Steam App ID, original source URL, source date, archived snapshot if permitted, exact AI-use statement or finding, claimed use category, reviewer status, and correction history. Official disclosure, independently reviewed evidence, and unverified reports must remain separate. `Unrated` is the default until sufficient evidence is checked. AI-assisted classification is not independent proof.

## Planned next steps

1. Implement a structured, source-backed game database and real lookup by App ID.
2. Add evidence review UI, reports submission backend, and corrections workflow.
3. Add a Next Fest 2026 event index only after validating the official event game list and source permissions.
4. Add accurate per-game pages and sitemap once substantial original information is available.

Not affiliated with Valve or Steam.