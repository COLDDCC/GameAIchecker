import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const records = JSON.parse(readFileSync('data/i18n/games.en.json', 'utf8'));
export const areaNames = {ingame:'In-game generation',code:'Code',art:'Art',music:'Music & sound',voice:'Voice',writing:'Writing',translation:'Translation',marketing:'Marketing'};
export const stateNames = {used:'AI use disclosed',claimed_none:'Developer claims no AI',none:'Explicitly stated no use',not_stated:'Not stated',unreviewed:'Not reviewed'};
export function editorialDigest(game) {
  return createHash('sha256').update(JSON.stringify([game.name,game.status,game.summary,game.reviewNote,game.aiAreaNotes,game.areas.map(({key,state})=>[key,state]),game.disclosureQuote,game.evidence])).digest('hex');
}
export function englishRecord(game) {
  const record=records[String(game.appId)];
  if (!record) throw new Error(`Missing English editorial record: ${game.appId}`);
  return record;
}
