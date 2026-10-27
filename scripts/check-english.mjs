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
   if(en.sourceDigest!==editorialDigest(game)) errors.push(`${game.appId}: English review is stale; review translations against changed source record`);
  }catch(error){errors.push(error.message);}
 }
 if(errors.length) throw new Error(errors.join('\n'));
 return games.length;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) console.log(`[check-english] ${validateEnglish(getAllGames())} complete, current English records`);
