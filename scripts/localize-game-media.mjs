import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// Expand this list when the next batch of detail pages is reviewed.
const ids = process.argv.length > 2 ? process.argv.slice(2) : ['1222140', '4019220', '2456740', '1889620', '2275940', '4189910'];
const root = process.cwd();
for (const id of ids) {
  const dir = join(root, 'public/images/steam/apps', id);
  await mkdir(dir, { recursive: true });
  // Reviewed galleries are checked into the repository as individual files.
  // Reuse a complete gallery so deployments do not depend on Steam availability.
  try {
    const saved = JSON.parse(await readFile(join(dir, 'gallery.json'), 'utf8'));
    if (!saved.images?.length) throw new Error('Empty gallery');
    const paths = saved.images.flatMap(image => [image.src, image.thumbnail, image.full]);
    paths.push(...(saved.movies || []).map(movie => movie.thumbnail).filter(Boolean));
    await Promise.all(paths.map(path => access(join(root, 'public', path.split('?')[0]))));
    console.log(`[localize-game-media] ${id}: using ${saved.images.length} saved images`);
    continue;
  } catch {}

  const metadata = JSON.parse(await readFile(join(root, 'data/steam', `${id}.json`), 'utf8'));
  const urls = [metadata.background, metadata.header, ...(metadata.screenshots || []).map(s => s.full || s.thumbnail)].filter(Boolean);
  if (!urls.length) throw new Error(`Missing gallery metadata for ${id}`);
  const images = [];
  const unique = [...new Set(urls)];
  for (let i = 0; i < unique.length; i += 4) {
    const batch = await Promise.all(unique.slice(i, i + 4).map(async url => {
      const key = createHash('sha256').update(url).digest('hex').slice(0, 16);
      const base = `/images/steam/apps/${id}/${key}`;
      const variants = [['.webp', 1280, 78], ['-thumb.webp', 160, 65], ['-full.webp', 1920, 85]];
      try { await Promise.all(variants.map(([suffix]) => access(join(root, 'public', base + suffix)))); }
      catch {
        let buffer;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            buffer = Buffer.from(await response.arrayBuffer());
            break;
          } catch (error) { if (attempt === 2) throw error; }
        }
        await Promise.all(variants.map(([suffix, width, quality]) => sharp(buffer).resize({ width, withoutEnlargement: true }).webp({ quality }).toFile(join(root, 'public', base + suffix))));
      }
      return { src: base + '.webp?v=gallery1', thumbnail: base + '-thumb.webp?v=gallery1', full: base + '-full.webp?v=gallery1', label: '官方图片', kind: 'screenshot', source: url };
    }));
    images.push(...batch);
  }
  const movies = await Promise.all((metadata.movies || []).map(async (movie, index) => {
    if (!movie.thumbnail) return movie;
    const path = `/images/steam/apps/${id}/video-${index}.webp`;
    try {
      const response = await fetch(movie.thumbnail, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('video thumbnail unavailable');
      await sharp(Buffer.from(await response.arrayBuffer())).resize({width: 320, withoutEnlargement: true}).webp({quality: 70}).toFile(join(root, 'public', path));
      return {...movie, thumbnail: path};
    } catch { return {...movie, thumbnail: null}; }
  }));
  await writeFile(join(dir, 'gallery.json'), JSON.stringify({ images, movies }));
  console.log(`[localize-game-media] ${id}: ${images.length} local images`);
}
