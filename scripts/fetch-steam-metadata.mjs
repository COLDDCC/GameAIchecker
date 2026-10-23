import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const CACHE = join(ROOT, 'data', 'steam');
const CONCURRENCY = 4;
const RETRY_DAYS = 7;
const FORCE = process.argv.includes('--force');

mkdirSync(CACHE, { recursive: true });

const { getAllGames } = await import(pathToFileURL(join(ROOT, 'src', 'lib', 'games.js')).href);
const games = getAllGames();
const ids = [...new Set(games.map((game) => game.appId).filter(Boolean))];

function isFresh(file) {
  if (FORCE || !existsSync(file)) return false;
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!data?.unavailable) return true;
    const age = Date.now() - new Date(data.fetchedAt || 0).getTime();
    return Number.isFinite(age) && age < RETRY_DAYS * 86400000;
  } catch {
    return false;
  }
}

async function fetchJson(url, timeout = 10000) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'GameAIChecker/1.0 (gameaichecker.com)',
    },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchOne(id) {
  const appUrl = `https://store.steampowered.com/api/appdetails?appids=${id}&l=schinese&cc=cn`;
  const reviewUrl = `https://store.steampowered.com/appreviews/${id}?json=1&language=all&purchase_type=all&num_per_page=0&filter=all`;
  const playerUrl = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${id}`;

  const [appResult, reviewResult, playerResult] = await Promise.allSettled([
    fetchJson(appUrl),
    fetchJson(reviewUrl),
    fetchJson(playerUrl),
  ]);

  if (appResult.status === 'rejected') throw appResult.reason;
  const entry = appResult.value?.[id];
  const data = entry?.success ? entry.data : null;
  if (!data) throw new Error('Steam returned no app data');

  const screenshots = (data.screenshots || [])
    .map((shot) => ({ thumbnail: shot.path_thumbnail || null, full: shot.path_full || null }))
    .filter((shot) => shot.thumbnail || shot.full);

  const movies = (data.movies || [])
    .map((movie) => ({
      name: movie.name || null,
      thumbnail: movie.thumbnail || null,
      mp4: movie.mp4?.max || movie.mp4?.['480'] || null,
      webm: movie.webm?.max || movie.webm?.['480'] || null,
    }))
    .filter((movie) => movie.thumbnail && (movie.mp4 || movie.webm));

  const platforms = data.platforms
    ? [
        data.platforms.windows ? 'Windows' : null,
        data.platforms.mac ? 'macOS' : null,
        data.platforms.linux ? 'Linux / SteamOS' : null,
      ].filter(Boolean)
    : null;

  const releaseRaw = data.release_date?.date || null;
  const releaseTime = releaseRaw ? new Date(releaseRaw) : null;
  const review = reviewResult.status === 'fulfilled' ? reviewResult.value?.query_summary : null;
  const players = playerResult.status === 'fulfilled' ? playerResult.value?.response?.player_count : null;

  return {
    id: String(id),
    fetchedAt: new Date().toISOString(),
    name: data.name || null,
    developers: data.developers || [],
    publishers: data.publishers || [],
    releaseDate: releaseRaw,
    releaseTime: releaseTime && !Number.isNaN(releaseTime.getTime()) ? releaseTime.toISOString() : null,
    comingSoon: Boolean(data.release_date?.coming_soon),
    genres: (data.genres || []).map((genre) => genre.description).filter(Boolean),
    categories: (data.categories || []).map((category) => category.description).filter(Boolean),
    languages: data.supported_languages || null,
    description: data.short_description || null,
    website: data.website || null,
    price: data.is_free ? '免费开玩' : data.price_overview?.final_formatted || null,
    priceValue: data.is_free ? 0 : data.price_overview?.final != null ? data.price_overview.final / 100 : null,
    priceCurrency: data.is_free ? 'CNY' : data.price_overview?.currency || null,
    platforms,
    metacritic: data.metacritic?.score || null,
    header: data.header_image || null,
    background: data.background_raw || data.background || null,
    screenshots,
    movies,
    steamUrl: `https://store.steampowered.com/app/${id}/`,
    review: review
      ? {
          scoreDesc: review.review_score_desc || null,
          total: review.total_reviews ?? null,
          positive: review.total_positive ?? null,
          negative: review.total_negative ?? null,
        }
      : null,
    players: players != null ? { current: players } : null,
  };
}

async function run() {
  console.log(`[fetch-steam-metadata] ${ids.length} Steam App IDs found`);
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (let index = 0; index < ids.length; index += CONCURRENCY) {
    const batch = ids.slice(index, index + CONCURRENCY);
    await Promise.all(batch.map(async (id) => {
      const file = join(CACHE, `${id}.json`);
      if (isFresh(file)) {
        skipped += 1;
        return;
      }
      try {
        const data = await fetchOne(id);
        writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
        fetched += 1;
        console.log(`  ${id}: ok`);
      } catch (error) {
        failed += 1;
        writeFileSync(file, `${JSON.stringify({ id: String(id), unavailable: true, fetchedAt: new Date().toISOString(), error: String(error?.message || error) }, null, 2)}\n`, 'utf8');
        console.log(`  ${id}: failed (${error?.message || error})`);
      }
    }));
  }

  console.log(`[fetch-steam-metadata] ${fetched} fetched, ${skipped} cached, ${failed} failed`);
}

await run();
