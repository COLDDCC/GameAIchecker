import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'images', 'steam', 'apps');
const CONCURRENCY = 8;

function collectIds() {
  const ids = new Set();
  const add = (v) => { if (v && /^\d+$/.test(String(v))) ids.add(String(v)); };

  const files = [
    'data/games.json',
    'data/game-index.json',
    'data/next-fest-100.json',
    'data/community-game-submissions.json',
    'data/indie-roguelike-ai-disclosures.json',
    'data/human-made-game-claims.json',
    'data/next-fest-october-2026.json',
    'data/taptap-ai-candidates.json',
  ];
  for (const f of files) {
    const p = join(root, f);
    if (!existsSync(p)) continue;
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const arr = data.games || data.submissions || [];
    for (const g of arr) {
      add(g.appId);
      add(g.steamAppId);
      add(g.demoAppId);
    }
  }

  const gamesDir = join(root, 'data', 'games');
  if (existsSync(gamesDir)) {
    for (const file of readdirSync(gamesDir).filter((name) => name.endsWith('.json'))) {
      const game = JSON.parse(readFileSync(join(gamesDir, file), 'utf8'));
      add(game.appId);
    }
  }

  for (const htmlFile of ['index.html', 'browse/index.html', 'games/index.html', 'game/index.html']) {
    const p = join(root, htmlFile);
    if (!existsSync(p)) continue;
    const html = readFileSync(p, 'utf8');
    for (const m of html.matchAll(/id:(\d+)/g)) add(m[1]);
  }

  return [...ids];
}

function curl(url, outPath) {
  return new Promise((resolve) => {
    const child = spawn('curl', [
      '-sL',
      '-f',
      '--connect-timeout', '4',
      '--max-time', '8',
      '-A', 'GameAIChecker/1.0 (gameaichecker.com)',
      '-o', outPath,
      url,
    ], { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}

async function downloadImage(id) {
  const dir = join(outDir, id);
  const path = join(dir, 'header.jpg');
  if (existsSync(path)) return { id, status: 'exists', path };
  // A complete persisted gallery already supplies this game's cover and screenshots.
  try {
    const gallery = JSON.parse(readFileSync(join(dir, 'gallery.json'), 'utf8'));
    if (gallery.images?.length && gallery.images.every(image =>
      ['src', 'full'].every(key => typeof image[key] === 'string' &&
        image[key].startsWith(`/images/steam/apps/${id}/`) &&
        existsSync(join(root, 'public', image[key].split('?')[0]))))) {
      return { id, status: 'exists', path: join(dir, 'gallery.json') };
    }
  } catch { /* No complete gallery: try the legacy cover URLs below. */ }

  mkdirSync(dir, { recursive: true });
  const urls = [
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
  ];

  for (const url of urls) {
    const ok = await curl(url, path);
    if (!ok) continue;
    const stats = await import('node:fs/promises').then(fs => fs.stat(path));
    if (stats.size < 1024) continue;
    return { id, status: 'downloaded', path, size: stats.size };
  }

  import('node:fs/promises').then(fs => fs.unlink(path).catch(() => {}));
  return { id, status: 'failed' };
}

async function runInBatches(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

const ids = collectIds();
console.log(`[fetch-steam-images] ${ids.length} game IDs found`);
mkdirSync(outDir, { recursive: true });

const results = await runInBatches(ids, async (id) => {
  const res = await downloadImage(id);
  if (res.status === 'downloaded') console.log(`  ${id}: downloaded (${res.size} bytes)`);
  else if (res.status === 'exists') console.log(`  ${id}: exists`);
  else console.log(`  ${id}: failed (will fallback to Steam CDN)`);
  return res;
}, CONCURRENCY);

const ok = results.filter(r => r.status !== 'failed').length;
const failed = results.filter(r => r.status === 'failed').length;
console.log(`[fetch-steam-images] ${ok} OK, ${failed} failed, ${ids.length} total`);

// Missing local images still have Steam CDN fallbacks, so don't fail the build.
process.exitCode = 0;
