import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const escapeXml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)'|([^\s>]+))/g)]
    .map(([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare]));
}

// Inspect final HTML so legacy catch-all pages and native Astro routes share
// the same inclusion rules. Never advertise partially translated noindex copies.
export function generateSitemap(directory, site) {
  const base = new URL(site);
  const urls = [];
  let redirects = new Set();
  try {
    redirects = new Set(readFileSync(join(directory, '_redirects'), 'utf8').split(/\r?\n/)
      .map(line => line.trim().split(/\s+/)).filter(parts => /^3\d\d!?$/.test(parts[2] || '')).map(parts => parts[0]));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const walk = folder => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = join(folder, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
      const path = '/' + relative(directory, file).replaceAll('\\', '/').replace(/index\.html$/, '');
      if (/^\/(sample(?:\/|$)|game(?:\/|$)|404(?:\.html|\/|$))/.test(path) || redirects.has(path)) continue;
      const html = readFileSync(file, 'utf8');
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || html;
      const tags = [...head.matchAll(/<(meta|link)\b[^>]*>/gi)].map(match => ({ type: match[1].toLowerCase(), ...attributes(match[0]) }));
      if (tags.some(tag => tag.type === 'meta' && (
        /^(robots|googlebot)$/i.test(tag.name || '') && /\b(noindex|none)\b/i.test(tag.content || '') ||
        /^refresh$/i.test(tag['http-equiv'] || '')
      ))) continue;
      const url = new URL(path, base).href;
      const canonical = tags.find(tag => tag.type === 'link' && /(?:^|\s)canonical(?:\s|$)/i.test(tag.rel || ''))?.href;
      if (canonical && new URL(canonical.replaceAll('&amp;', '&'), url).href !== url) continue;
      urls.push(url);
    }
  };
  walk(directory);
  const sorted = [...new Set(urls)].sort();
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + sorted.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n') + '\n</urlset>\n';
  writeFileSync(join(directory, 'sitemap.xml'), xml);
  return sorted;
}

export default function sitemap() {
  return {
    name: 'game-ai-checker-sitemap',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const urls = generateSitemap(fileURLToPath(dir), 'https://gameaichecker.com/');
        logger.info(`sitemap.xml: ${urls.length} indexable pages`);
      },
    },
  };
}
