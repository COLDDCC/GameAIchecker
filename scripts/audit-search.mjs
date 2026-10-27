import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {getAllGames} from '../src/lib/games.js';
const games=getAllGames();
const sitemap=readFileSync('dist/sitemap.xml','utf8');
for(const g of games){
 const path=`/games/en/${g.slug}/`,zh=`/games/${g.slug}/`;
 const html=readFileSync(`dist${path}index.html`,'utf8');
 const original=readFileSync(`dist${zh}index.html`,'utf8');
 assert.match(html,/<html lang="en">/);
 assert(!/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html),path);
 assert(html.includes(`rel="canonical" href="https://gameaichecker.com${path}"`),path);
 assert(html.includes(`hreflang="zh-CN" href="https://gameaichecker.com${zh}"`),path);
 assert(original.includes(`hreflang="en" href="https://gameaichecker.com${path}"`),zh);
 assert(sitemap.includes(`https://gameaichecker.com${path}</loc>`),path);
 assert(html.includes('Eight areas, separate answers')&&html.includes('Sources &amp; review limits'),path);
}
for(const p of ['guides/how-to-check-steam-game-ai','events/steam-next-fest-october-2026-ai-disclosures','collections/human-made-steam-games']){
 assert(existsSync(`dist/${p}/index.html`));assert(sitemap.includes(`https://gameaichecker.com/${p}/</loc>`));
}
const partial=readFileSync(`dist/games/ja/${games[0].slug}/index.html`,'utf8');
assert(partial.includes('noindex,follow'));
assert(!sitemap.includes('/games/ja/'));
// Every source-backed existing canonical record is read only; language templates
// may change presentation but must not mutate evidence or owner review data.
console.log(`[audit-search] ${games.length} indexable English records, reciprocal language links, guide and event list passed`);
