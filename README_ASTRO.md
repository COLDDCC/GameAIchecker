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

## Languages

The homepage, searchable game directory, game details and interactive controls support English, Simplified Chinese, Japanese, Traditional Chinese, German, Spanish, French and Brazilian Portuguese.

- Home: `/` for English, `/{lang}/` for other languages.
- Game details: `/games/{slug}/` for Simplified Chinese (existing URLs preserved); `/games/{lang}/{slug}/` for other languages.
- `/en/` and `/games/zh-cn/{slug}/` redirect to their existing canonical URLs on Cloudflare Pages.
- Switching languages preserves the current game, query string and section anchor. Steam links open the corresponding store language. Currency remains the original source currency.
- Secondary editorial pages and the share-card generator still use their original language. Navigation marks links to English editorial pages.

`src/components/GameDetail.astro` is the shared detail layout. `src/lib/home.js` supplies server-rendered cards before the interactive directory loads. `src/middleware.js` translates prerendered HTML (also used in dev); `src/lib/translations.js` stores complete eight-column UI translations. Existing labels remain in `src/lib/detail-labels.js`. Inline script string literals are parsed with Acorn so translated controls do not damage executable code or API paths.

Mark evidence quotes, original Steam text and editorial notes with `data-original="true"` to preserve them verbatim; a localized notice explains the original-language content. Never translate source prose through the UI dictionary. Each language has a canonical URL, reciprocal hreflang links, translated metadata, and sitemap entries at `/sitemap.xml`.

After building, `npm run audit:i18n` validates every locale and evidence preservation. `npm run test:i18n` exercises search, filters, favorites and menu controls in a DOM environment. Both run in the production build. Actual browser layout checks are separate from these DOM tests.
