import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getAllGames } from '../src/lib/games.js';

// The original three "renovation" batches were thin static pages.
// Replace them with actual output from the shared Astro detail template.
const ids = ["1889620","2295170","2800150","2861080","2870790","3517740","3519780","3629430","3670600","3782550","4106650","4348910","4541470","4544110","4576390","4736090","4794490","4824220","4955250","4982910","5004560","5037200","5053550","5117550","5120010","5182120","5315310","5323250","5391500","1222140"];
const games = getAllGames();
let changed = 0;
for (const id of ids) {
  const game = games.find(g => String(g.appId) === id);
  if (!game) throw new Error('Missing game record: ' + id);
  const src = join('dist', 'games', game.slug, 'index.html');
  if (!existsSync(src)) throw new Error('Missing Astro output: ' + src);
  let html = readFileSync(src, 'utf8');
  // Never mistake the lightweight historical HTML for the complete Astro layout.
  const required = ['class="game-top"', 'class="section-nav"', 'id="evidence"'];
  if (game.images.length > 1) required.push('id="thumbs"');
  for (const marker of required) {
    if (!html.includes(marker)) throw new Error('Missing full template marker ' + marker + ' for ' + id);
  }
  const stylesheet = /<link[^>]+rel="stylesheet"[^>]+href="\/(_astro\/[^"]+\.css)"[^>]*>/g;
  html = html.replace(stylesheet, (tag, asset) => {
    const path = join('dist', asset);
    if (!existsSync(path)) throw new Error('Missing CSS asset: ' + path);
    return '<style>' + readFileSync(path, 'utf8') + '</style>';
  });
  if (html.length < 15000) throw new Error('Suspiciously short detail output: ' + id);
  if (!html.includes(game.name)) throw new Error('Missing game title: ' + id);
  const target = join('games', game.slug, 'index.html');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, 'utf8');
  changed++;
  console.log('[rebuild-first-30] ' + game.slug + ' ' + html.length + ' chars');
}
if (changed !== 30) throw new Error('Expected exactly 30 pages; got ' + changed);
console.log('[rebuild-first-30] 30 full-template pages regenerated.');
