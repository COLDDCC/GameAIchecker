import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const { getGameIndex } = await import(pathToFileURL(join(ROOT, 'src', 'lib', 'games.js')).href);
const games = getGameIndex();
const output = {
  updatedAt: new Date().toISOString().slice(0, 10),
  count: games.length,
  games,
};
writeFileSync(join(ROOT, 'data', 'game-index.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`[build-game-index] wrote ${games.length} games to data/game-index.json`);
