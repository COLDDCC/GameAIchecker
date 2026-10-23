import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/export-static-game.mjs <slug>');
  process.exit(1);
}

const root = process.cwd();
const source = join(root, 'dist', 'games', slug, 'index.html');
if (!existsSync(source)) {
  console.error(`Missing ${source}. Run the Astro build first.`);
  process.exit(1);
}

let html = readFileSync(source, 'utf8');
html = html.replace(/<link[^>]+rel="stylesheet"[^>]+href="\/(_astro\/[^"]+\.css)"[^>]*>/g, (_match, href) => {
  const file = join(root, 'dist', href);
  if (!existsSync(file)) return _match;
  const css = readFileSync(file, 'utf8');
  return `<style>${css}</style>`;
});

const target = join(root, 'games', slug, 'index.html');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, html, 'utf8');
console.log(`[export-static-game] wrote ${target}`);
