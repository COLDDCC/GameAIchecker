import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Export only reviewed game pages into the repository-style /games directory.
// The Astro build itself generates all game pages in dist/games.
const root = process.cwd();
const ids = ['4576390', '4982910', '5182120', '5004560', '4794490', '5391500',
  '5323250', '1889620', '2800150', '4544110', '3519780', '3782550', '4106650', '3670600', '5053550', '4955250', '4348910', '5120010', '5315310', '3517740', '2295170', '5086350', '4598530', '2870790', '4824220', '4736090', '5037200', '3629430', '5117550', '2861080', '4541470', '4868310', '1853440', '3642910', '4900890', '3680170', '4740930', '5175310', '4487060', '4163270', '3421660', '2153760', '3218350', '5160800', '2988120', '3734220', '3796150', '4058300', '4943260', '3109590', '3284200', '4264000', '4045480', '3161310', '4410710', '4521650', '4395320', '4093320', '4110770', '4462580', '3616280', '4490840', '4450660', '4553100', '4709270', '864170', '3717830', '3078120', '1889700', '2708040', '4180840', '4484810', '3419080', '3405680', '4826820', '2677980', '4225280', '3465440', '4210140', '4142360', '5272230', '3432860', '5285650', '4929280', '1975650', '5073550', '4949400', '3265900', '3907570', '3837790', '5285080', '5344070', '5393000', '4570020', '3093990', '2958550', '3218230', '3884860', '5200400', '4858850', '4189910', '2275940', '5012840', '2456740', '2073850', '3658930', '1222140', '4019220', '4693000', '5345260', '4919570'];

function slugify(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'game';
}

let exported = 0;
for (const id of ids) {
  const game = JSON.parse(readFileSync(join(root, 'data', 'games', id + '.json'), 'utf8'));
  if (String(game.appId) !== id) throw new Error('Unexpected App ID in ' + id + '.json');
  const slug = id + '-' + slugify(game.name);
  const src = join(root, 'dist', 'games', slug, 'index.html');
  if (!existsSync(src)) throw new Error('Astro did not generate ' + slug);
  let html = readFileSync(src, 'utf8');
  html = html.replace(/<link[^>]+rel="stylesheet"[^>]+href="\/(_astro\/[^"]+\.css)"[^>]*>/g,
    (original, href) => {
      const cssFile = join(root, 'dist', href);
      return existsSync(cssFile) ? '<style>' + readFileSync(cssFile, 'utf8') + '</style>' : original;
    });
  const dest = join(root, 'games', slug, 'index.html');
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html, 'utf8');
  exported += 1;
  console.log('[export-reviewed-games] ' + slug);
}
if (exported !== ids.length) throw new Error('Incomplete export');
console.log('[export-reviewed-games] exported ' + exported + ' reviewed pages');
