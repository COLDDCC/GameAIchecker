// Collect Steam facts for review WITHOUT an LLM.
//
// For each App ID this fetches, in plain HTTP:
//   1. appdetails (name, developer, publisher, release, genres, short description, demo ID)
//   2. the English store page HTML, and extracts the "AI Generated Content Disclosure" text verbatim
//      (age-gate cookies are sent, so mature pages such as Detroit: Become Human work too)
//   3. "human made / no AI" claims in the store description (candidate only, needs a human to confirm)
//   4. up to 3 pages of Steam discussion titles, flagging titles with AI / art / plagiarism keywords
//
// It then assigns a route:
//   auto_none   no disclosure, no human-made claim, no flagged thread  -> templated record, zero LLM tokens
//   official    disclosure found                                       -> classify-disclosure.mjs (small model)
//   review      human-made claim or flagged threads                    -> a person / agent reads ONLY the flagged items
//   error       fetch failed                                           -> retry later
//
// Usage (needs network access to Steam, so run it in GitHub Actions or locally, not in a sandbox):
//   node scripts/review/collect-facts.mjs 5345260 2073850 ...
//   node scripts/review/collect-facts.mjs --file ids.txt
//   node scripts/review/collect-facts.mjs --compare            # re-collect all data/games/*.json and compare routes
// Output: scripts/review/facts/<appId>.json and scripts/review/facts/_triage.json

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(HERE, 'facts');
const UA = 'GameAIChecker/1.0 (+https://gameaichecker.com)';
const AGE_COOKIE = 'birthtime=0; lastagecheckage=1-0-1900; wants_mature_content=1; mature_content=1; Steam_Language=english';
const DELAY_MS = Number(process.env.STEAM_DELAY_MS || 1200); // be polite; Steam rate-limits bursts
const MAX_FORUM_PAGES = 3;

// Thread titles that must be opened and read (handoff §2.3). Kept broad on purpose:
// a false positive costs one cheap read, a false negative misses evidence.
const THREAD_KEYWORDS = [
  /\bA\.?I\b/i, /\bAIGC\b/i, /\bgen[- ]?ai\b/i, /slop/i, /asset[- ]?flip/i, /\bgenerat/i,
  /midjourney/i, /stable ?diffusion/i, /chat ?gpt/i, /\bGPT\b/i, /\bLLM\b/i, /suno/i, /elevenlabs/i,
  /\bart(ist|work|s)?\b/i, /stolen/i, /plagiar/i, /copy|copied|clone|rip[- ]?off/i,
  /人工智能/, /生成/, /画师/, /美术/, /立绘/, /抄袭/, /换皮/, /缝合/, /盗用/, /機翻|机翻/, /配音/,
];

// Developer "human made" claims. Style words such as "hand-drawn" or "pixel art" are NOT claims
// about the production method (handoff: 像素画风是风格标签，不是制作方式声明), so they are excluded.
const HUMAN_CLAIM = [
  /human[- ]made/i, /made by (real )?humans/i, /\bno (gen(erative)?[- ]?)?AI\b/i, /\bAI[- ]free\b/i,
  /without (the use of |using )?(any )?(gen(erative)?[- ]?)?AI\b/i, /zero (gen(erative)?[- ]?)?AI/i,
  /not (made|created|generated) (with|by|using) (gen(erative)?[- ]?)?AI/i,
  /(未|没有|没|无|不)使用\s*(任何)?\s*(生成式)?\s*AI/i, /零\s*AI/i, /拒绝\s*AI/i, /无\s*AI\s*(生成|参与)/i, /纯人工/,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = false, cookie = '' } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...(cookie ? { cookie } : {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { ok: false, status: res.status, url: res.url };
      return { ok: true, status: res.status, url: res.url, body: json ? await res.json() : await res.text() };
    } catch (e) {
      if (attempt === 3) return { ok: false, status: 0, error: String(e?.message || e) };
      await sleep(DELAY_MS * attempt * 3);
    }
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Returns the verbatim disclosure text, '' if the section exists but is empty, or null if absent.
export function extractDisclosure(html) {
  const h2 = /<h2[^>]*>\s*AI Generated Content Disclosure\s*<\/h2>/i.exec(html);
  if (!h2) return null;
  const rest = html.slice(h2.index + h2[0].length);
  // The section ends at the next heading, or where the enclosing <div> closes (tracked by depth).
  let stop = rest.search(/<h2[\s>]/i);
  if (stop === -1) stop = rest.length;
  const tag = /<(\/?)div\b[^>]*>/gi;
  let depth = 0, m;
  while ((m = tag.exec(rest)) && m.index < stop) {
    depth += m[1] ? -1 : 1;
    if (depth < 0) { stop = m.index; break; }
  }
  const chunk = rest.slice(0, Math.min(stop, 8000));
  return htmlToText(chunk)
    .replace(/^The developers describe how their game uses AI Generated Content like this:\s*/i, '')
    .trim();
}

export function extractDescription(html) {
  const m = /<div[^>]+id="game_area_description"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]+id="game_area_content_descriptors"|<div class="game_page_autocollapse)/i.exec(html);
  return m ? htmlToText(m[1]).replace(/^About This (Game|Software|Demo)\s*/i, '') : '';
}

export function findHumanClaims(text) {
  const hits = [];
  for (const re of HUMAN_CLAIM) {
    const m = re.exec(text);
    if (!m) continue;
    const start = Math.max(0, m.index - 80), end = Math.min(text.length, m.index + m[0].length + 80);
    hits.push(text.slice(start, end).replace(/\s+/g, ' ').trim());
  }
  return [...new Set(hits)];
}

export function parseForum(html) {
  const topics = [];
  // Each topic row is <div class="forum_topic ..."> ... <a class="forum_topic_overlay" href="URL"> ...
  // <div class="forum_topic_name ...">TITLE</div> ... <div class="forum_topic_reply_count">N</div>
  const rows = html.split(/<div[^>]+class="forum_topic[ "]/i).slice(1);
  for (const row of rows) {
    const url = /<a[^>]+class="forum_topic_overlay"[^>]+href="([^"]+)"/i.exec(row)?.[1]
      || /<a[^>]+href="([^"]+)"[^>]+class="forum_topic_overlay"/i.exec(row)?.[1];
    const nameHtml = /<div[^>]+class="forum_topic_name[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(row)?.[1];
    if (!url || nameHtml == null) continue;
    const title = htmlToText(nameHtml.replace(/<(span|img)[^>]*class="[^"]*(forum_topic_award|pinned|locked)[\s\S]*?(<\/span>|>)/gi, ''));
    const replyHtml = /<div[^>]+class="forum_topic_reply_count"[^>]*>([\s\S]*?)<\/div>/i.exec(row)?.[1] || '';
    const replies = Number((/[\d,]+/.exec(htmlToText(replyHtml))?.[0] || '0').replace(/,/g, ''));
    topics.push({ title, url: url.replace(/&amp;/g, '&'), replies });
  }
  const total = /of\s+([\d,]+)\s+active topics/i.exec(html)?.[1];
  return { topics, total: total ? Number(total.replace(/,/g, '')) : null };
}

export const flagTitle = (title) => THREAD_KEYWORDS.some((re) => re.test(title));

async function appdetails(id) {
  for (const [l, cc] of [['schinese', 'cn'], ['english', 'us']]) {
    const r = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&l=${l}&cc=${cc}`, { json: true });
    const entry = r.ok ? r.body?.[id] : null;
    if (entry?.success) return { lang: l, data: entry.data };
    await sleep(DELAY_MS);
  }
  return null;
}

async function collect(id) {
  const fact = { appId: String(id), collectedAt: new Date().toISOString(), errors: [] };

  const zh = await appdetails(id);
  await sleep(DELAY_MS);
  const en = await get(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english&cc=us`, { json: true });
  const enData = en.ok && en.body?.[id]?.success ? en.body[id].data : null;
  const d = zh?.data || enData;
  if (!d) {
    fact.errors.push('appdetails: no data (removed, region-locked or wrong ID)');
    fact.route = 'error';
    return fact;
  }
  fact.name = d.name;
  fact.type = d.type; // 'game' | 'demo' | 'dlc' ...
  fact.dev = (d.developers || []).join(', ');
  fact.pub = (d.publishers || []).join(', ');
  fact.comingSoon = !!d.release_date?.coming_soon;
  fact.releaseRaw = d.release_date?.date || '';
  fact.genres = (enData?.genres || d.genres || []).map((g) => g.description);
  fact.descZh = htmlToText(zh?.lang === 'schinese' ? d.short_description || '' : '');
  fact.descEn = htmlToText(enData?.short_description || '');
  fact.demo = d.demos?.[0]?.appid ? String(d.demos[0].appid) : null;
  fact.fullgame = d.fullgame?.appid ? String(d.fullgame.appid) : null;
  // Content descriptors (mature content notes) come from the API; useful context, not AI evidence.
  fact.contentNotes = d.content_descriptors?.notes || null;

  await sleep(DELAY_MS);
  const page = await get(`https://store.steampowered.com/app/${id}/?l=english`, { cookie: AGE_COOKIE });
  if (!page.ok) {
    fact.errors.push(`store page: HTTP ${page.status} ${page.error || ''}`.trim());
  } else if (/agecheck/i.test(page.url || '')) {
    fact.errors.push('store page: still behind age check');
  } else {
    fact.disclosure = extractDisclosure(page.body);
    const desc = extractDescription(page.body);
    fact.humanClaims = findHumanClaims(`${desc}\n${fact.descEn}\n${fact.descZh}`);
  }

  // Discussions: titles only; flagged titles are listed for a targeted read.
  const topics = [];
  let total = null;
  for (let p = 1; p <= MAX_FORUM_PAGES; p++) {
    await sleep(DELAY_MS);
    const r = await get(`https://steamcommunity.com/app/${id}/discussions/?l=english${p > 1 ? `&fp=${p}` : ''}`, { cookie: AGE_COOKIE });
    if (!r.ok) { fact.errors.push(`discussions p${p}: HTTP ${r.status} ${r.error || ''}`.trim()); break; }
    const parsed = parseForum(r.body);
    if (p === 1) total = parsed.total;
    const before = topics.length;
    for (const t of parsed.topics) if (!topics.some((x) => x.url === t.url)) topics.push(t);
    if (topics.length === before || parsed.topics.length < 15) break;
  }
  fact.discussions = {
    url: `https://steamcommunity.com/app/${id}/discussions/`,
    total: total ?? topics.length,
    scanned: topics.length,
    flagged: topics.filter((t) => flagTitle(t.title)),
  };

  const storeOk = fact.disclosure !== undefined;
  if (!storeOk) fact.route = 'error';
  else if (fact.disclosure !== null) fact.route = 'official';
  else if (fact.humanClaims.length || fact.discussions.flagged.length) fact.route = 'review';
  else fact.route = 'auto_none';
  // A truncated forum scan cannot prove "no AI threads"; send to review so a person can search it.
  if (fact.route === 'auto_none' && fact.discussions.total > fact.discussions.scanned) {
    fact.route = 'review';
    fact.reviewReason = `讨论区共 ${fact.discussions.total} 个主题，只扫描了前 ${fact.discussions.scanned} 个标题`;
  }
  return fact;
}

function existingCategory(id) {
  const p = join(REPO, 'data', 'games', `${id}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).category : null;
}

async function main() {
  const args = process.argv.slice(2);
  const compare = args.includes('--compare');
  let ids = args.filter((a) => /^\d+$/.test(a));
  const fi = args.indexOf('--file');
  if (fi !== -1) ids.push(...readFileSync(args[fi + 1], 'utf8').split(/\s+/).filter((x) => /^\d+$/.test(x)));
  if (compare) ids = readdirSync(join(REPO, 'data', 'games')).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.replace('.json', ''));
  ids = [...new Set(ids)];
  if (!ids.length) { console.error('usage: collect-facts.mjs <appId...> | --file ids.txt | --compare'); process.exit(2); }

  mkdirSync(OUT, { recursive: true });
  const triage = [];
  for (const [i, id] of ids.entries()) {
    const fact = await collect(id);
    writeFileSync(join(OUT, `${id}.json`), `${JSON.stringify(fact, null, 2)}\n`);
    const row = { appId: id, name: fact.name, route: fact.route, flagged: fact.discussions?.flagged?.length || 0, errors: fact.errors };
    if (compare) row.existing = existingCategory(id);
    triage.push(row);
    console.log(`[${i + 1}/${ids.length}] ${id} ${fact.name || '?'} -> ${fact.route}${row.flagged ? ` (${row.flagged} flagged threads)` : ''}${fact.errors.length ? ` ! ${fact.errors.join('; ')}` : ''}`);
  }
  writeFileSync(join(OUT, '_triage.json'), `${JSON.stringify(triage, null, 2)}\n`);

  const count = (r) => triage.filter((t) => t.route === r).length;
  console.log(`\nauto_none ${count('auto_none')} · official ${count('official')} · review ${count('review')} · error ${count('error')}`);

  if (compare) {
    // Disagreements between automatic routing and the 111 hand-reviewed records.
    // Human-made pages may rest on statements outside Steam (itch.io etc.), so auto_none is tolerated there.
    const expect = {
      official_ai_disclosure: ['official'],
      no_verified_genai_evidence: ['auto_none', 'review'],
      developer_no_genai_statement: ['review', 'auto_none'],
      human_made: ['review', 'auto_none'],
    };
    const bad = triage.filter((t) => t.existing && expect[t.existing] && !expect[t.existing].includes(t.route));
    console.log(`\ncompare: ${triage.length - bad.length}/${triage.length} consistent with existing records`);
    for (const b of bad) console.log(`  MISMATCH ${b.appId} ${b.name}: existing=${b.existing} auto=${b.route}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
