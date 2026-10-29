import { pathToFileURL } from 'node:url';
import { getAllGames } from '../src/lib/games.js';
import { englishRecord, editorialDigest } from '../src/lib/english.js';
export function validateEnglish(games) {
 const errors=[];
 for (const game of games) {
  try {
   const en=englishRecord(game);
   for (const [key,value] of Object.entries({summary:en.summary,reviewNote:en.reviewNote,...Object.fromEntries(game.areas.map(a=>[`aiAreaNotes.${a.key}`,en.aiAreaNotes?.[a.key]]))})) {
    if (typeof value!=='string'||value.trim().length<12||/[\u3400-\u9fff]/.test(value)) errors.push(`${game.appId}: missing or untranslated ${key}`);
   }
   // Embedded intake records already pin the whole source file through sourceRecordHash;
   // only the games.en.json editorials carry a sourceDigest to recheck.
   if(!en.sourceRecordHash&&en.sourceDigest!==editorialDigest(game)) errors.push(`${game.appId}: English review is stale; review translations against changed source record`);
  }catch(error){errors.push(error.message);}
 }
 if(errors.length) throw new Error(errors.join('\n'));
 return games.length;
}
// npm passes a relative argv[1]; new URL(x,'file:') never matched import.meta.url, so this
// gate silently did nothing. Resolve against the real cwd instead.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(`[check-english] ${validateEnglish(getAllGames())} complete, current English records`);
