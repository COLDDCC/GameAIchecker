import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getGameIndex } from '../src/lib/games.js';
import { languages } from '../src/lib/i18n.js';

const games = getGameIndex();
const routes = [
  ['', 'grid', games],
  ...languages.map(lang => [lang, 'grid', games]),
  ['browse', 'grid', games],
  ['games', 'cards', games],
  ['indie-ai', 'grid', JSON.parse(readFileSync('data/indie-roguelike-ai-disclosures.json')).games],
  ['events/steam-next-fest-october-2026', 'grid', JSON.parse(readFileSync('data/next-fest-october-2026.json')).games],
];
for (const [route, id, entries] of routes) {
  const html = readFileSync(join('dist', route, 'index.html'), 'utf8');
  // Strip all scripts: names and links must be present as actual HTML, not only
  // inside serialized data or client-side template strings.
  const staticHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const list = staticHtml.split(new RegExp(`id="${id}"[^>]*>`))[1];
  assert(list, `/${route}: missing list`);
  const ids = new Set(entries.map(g => String(g.appId || g.steamAppId)));
  for (const game of games.filter(g => ids.has(String(g.appId)))) {
    assert(list.includes(`href="/games/${game.slug}/"`), `/${route}: missing static link for ${game.name}`);
  }
  const cardCount = (staticHtml.match(/data-(?:game-id|search)="/g) || []).length;
  assert.equal(cardCount, entries.length, `/${route}: static card count`);
  for (const [, slug] of staticHtml.matchAll(/href="\/games\/([^"/?#]+)\/"/g)) {
    assert(existsSync(join('dist/games', slug, 'index.html')), `/${route}: broken detail link ${slug}`);
  }
  assert(!/Loading…|正在读取游戏档案/.test(staticHtml), `/${route}: loading placeholder`);
  console.log(`[audit-lists] /${route || ''}: ${entries.length} static cards and working detail links`);
}
