import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { generateSitemap } from './sitemap.mjs';

test('includes built legacy and game pages; excludes non-indexable URLs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gac-sitemap-'));
  const page = (path, head = '') => {
    const file = join(directory, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `<html><head>${head}</head><body>Game records</body></html>`);
  };
  try {
    page('index.html');
    page('browse/index.html');
    page('games/123-example/index.html', '<link href="https://gameaichecker.com/games/123-example/" rel="canonical">');
    page('games/en/123-example/index.html', "<META CONTENT='noindex,follow' NAME='robots'>");
    page('ja/index.html', '<meta name=googlebot content=noindex>');
    page('hidden/index.html', '<meta name="robots" content="none">');
    page('events/next-fest/index.html', '<meta content="0;url=/#next-fest" http-equiv="refresh">');
    page('old/index.html', '<link rel="canonical" href="/browse/">');
    page('redirect/index.html');
    page('sample/example/index.html');
    page('404.html');
    page('game/index.html');
    writeFileSync(join(directory, '_redirects'), '/redirect/ /browse/ 301\n');
    const urls = generateSitemap(directory, 'https://gameaichecker.com/');
    assert.deepEqual(urls, ['https://gameaichecker.com/', 'https://gameaichecker.com/browse/', 'https://gameaichecker.com/games/123-example/']);
    assert.match(readFileSync(join(directory, 'sitemap.xml'), 'utf8'), /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
