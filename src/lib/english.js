import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const records = JSON.parse(readFileSync('data/i18n/games.en.json', 'utf8'));
export const areaNames = {ingame:'In-game generation',code:'Code',art:'Art',music:'Music & sound',voice:'Voice',writing:'Writing',translation:'Translation',marketing:'Marketing'};
export const stateNames = {used:'AI use disclosed',claimed_none:'Developer claims no AI',none:'Explicitly stated no use',not_stated:'Not stated',unreviewed:'Not reviewed'};
const embeddedCache = new Map();
// Intake writes the English editorial text inside the canonical game record, so the card
// index (which only carries appId) can still resolve it. Older games keep games.en.json.
function embedded(appId) {
  if (appId === undefined || appId === null) return null;
  const key = String(appId);
  if (!embeddedCache.has(key)) {
    let value = null;
    if (existsSync(`data/games/${key}.json`)) {
      const raw = JSON.parse(readFileSync(`data/games/${key}.json`, 'utf8'));
      if (raw.english) {
        const { english, ...original } = raw;
        const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
        if (createHash('sha256').update(JSON.stringify(stable(original))).digest('hex') !== english.sourceRecordHash) {
          throw new Error(`Stale embedded English record: ${key}`);
        }
        value = english;
      }
    }
    embeddedCache.set(key, value);
  }
  return embeddedCache.get(key);
}
export function editorialDigest(game) {
  return createHash('sha256').update(JSON.stringify([game.name,game.status,game.summary,game.reviewNote,game.aiAreaNotes,game.areas.map(({key,state})=>[key,state]),game.disclosureQuote,game.evidence])).digest('hex');
}
export function englishRecord(game) {
  const embeddedRecord = game.english || embedded(game.appId);
  if (embeddedRecord) return embeddedRecord;
  const record = records[String(game.appId)];
  if (!record) throw new Error(`Missing English editorial record: ${game.appId}`);
  return record;
}
