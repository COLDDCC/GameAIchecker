import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const ids = ['4576390', '4982910', '5182120', '5004560', '4794490', '5391500',
  '5323250', '1889620', '2800150', '4544110', '3519780'];
const areaKeys = new Set(['ingame', 'code', 'art', 'music', 'voice', 'writing', 'translation', 'marketing']);
const slugify = name => String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,64);
let errors = [];
for (const id of ids) {
  const game = JSON.parse(readFileSync(join(root, 'data/games', id + '.json'), 'utf8'));
  const slug = id + '-' + slugify(game.name);
  const error = message => errors.push(slug + ': ' + message);
  if (String(game.appId) !== id) error('App ID mismatch');
  if (!game.sources?.some(s => s.url === 'https://store.steampowered.com/app/' + id + '/')) error('Steam source missing');
  if (!game.aiUsageCategories?.length || !game.aiUsageCategories.every(k => areaKeys.has(k) && game.aiAreas?.[k] === 'used'))
    error('AI area states inconsistent');
  const htmlPath = join(root, 'dist', 'games', slug, 'index.html');
  if (!existsSync(htmlPath)) error('Astro build output HTML missing');
  else {
    const html = readFileSync(htmlPath, 'utf8');
    if (!html.includes(game.name)) error('Game title missing from exported HTML');
    if (!html.includes('/games/' + slug + '/')) error('Canonical game URL missing');
  }
  const galleryPath = join(root, 'dist/images/steam/apps', id, 'gallery.json');
  if (!existsSync(galleryPath)) { error('Localized gallery missing'); continue; }
  const gallery = JSON.parse(readFileSync(galleryPath, 'utf8'));
  if (!gallery.images?.length) { error('Localized gallery has no images'); continue; }
  for (const image of gallery.images) {
    for (const key of ['src','full']) {
      const path = image[key];
      if (typeof path !== 'string' || !path.startsWith('/images/steam/apps/' + id + '/')) {
        error('Non-local or invalid ' + key + ' gallery URL'); continue;
      }
      if (!existsSync(join(root, 'dist', path.split('?')[0].slice(1)))) error('Missing image file: ' + path);
    }
  }
}
if (errors.length) {
  console.error('[audit-reviewed-games] FAILED (' + errors.length + ' issues)');
  errors.forEach(e => console.error(' - ' + e));
  process.exitCode = 1;
} else {
  console.log('[audit-reviewed-games] PASS: 11 games have sources, Astro output and local images');
}
