import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const ids = ['4576390', '4982910', '5182120', '5004560', '4794490', '5391500',
  '5323250', '1889620', '2800150', '4544110', '3519780', '3782550', '4106650', '3670600', '5053550', '4955250', '4348910', '5120010', '5315310', '3517740', '2295170', '5086350', '4598530', '2870790', '4824220', '4736090', '5037200', '3629430', '5117550', '2861080', '4541470', '4868310', '1853440', '3642910', '4900890', '3680170', '4740930', '5175310', '4487060', '4163270', '3421660', '2153760', '3218350', '5160800', '2988120', '3734220', '3796150', '4058300', '4943260', '3109590', '3284200', '4264000', '4045480', '3161310', '4410710', '4521650', '4395320', '4093320', '4110770', '4462580', '3616280', '4490840', '4450660', '4553100', '4709270', '864170', '3717830', '3078120', '1889700', '2708040', '4180840', '4484810', '3419080', '3405680', '4826820', '2677980', '4225280', '3465440', '4210140', '4142360', '5272230', '3432860', '5285650', '4929280', '1975650', '5073550'];
const areaKeys = new Set(['ingame', 'code', 'art', 'music', 'voice', 'writing', 'translation', 'marketing']);
const slugify = name => String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,64);
let errors = [];
for (const id of ids) {
  const game = JSON.parse(readFileSync(join(root, 'data/games', id + '.json'), 'utf8'));
  const slug = id + '-' + slugify(game.name);
  const error = message => errors.push(slug + ': ' + message);
  if (String(game.appId) !== id) error('App ID mismatch');
  if (!game.sources?.some(s => {
    try {
      const url = new URL(s.url);
      return url.protocol === 'https:' && url.hostname === 'store.steampowered.com' &&
        url.pathname.split('/')[1] === 'app' && url.pathname.split('/')[2] === id;
    } catch { return false; }
  })) error('Steam source missing');
  if (!Array.isArray(game.aiUsageCategories) || !game.aiUsageCategories.every(k => areaKeys.has(k) && game.aiAreas?.[k] === 'used') || (game.category === 'official_ai_disclosure' && game.aiUsageCategories.length === 0))
    error('AI area states inconsistent');
  const htmlPath = join(root, 'dist', 'games', slug, 'index.html');
  if (!existsSync(htmlPath)) error('Astro build output HTML missing');
  else {
    const html = readFileSync(htmlPath, 'utf8');
    // Titles such as "Farm & Feast" are HTML-escaped in the rendered page.
    const escaped = String(game.name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    if (!html.includes(game.name) && !html.includes(escaped)) error('Game title missing from exported HTML');
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
  console.log(`[audit-reviewed-games] PASS: ${ids.length} games have sources, Astro output and local images`);
}
