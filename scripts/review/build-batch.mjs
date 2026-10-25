// Turn collected facts into the existing review inputs, so make-records.py / ship.sh work unchanged.
//
//   auto_none            -> store-facts.jsonl line + batch entry with an honest "automated check" note
//   official (classified,
//     no flagged threads) -> store-facts.jsonl line with areas/notes/quote from classify-disclosure.mjs
//   everything else      -> review-queue.md: only the flagged threads / claims a person must read
//
// Usage: node scripts/review/build-batch.mjs [--date 2026-10-26] [--out batch-auto.json]
// Then:  python3 scripts/review/make-records.py scripts/review/batch-auto.json   (dry run, read the output)
//        bash scripts/review/ship.sh scripts/review/batch-auto.json "<title>" "<body>"

import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FACTS = join(HERE, 'facts');
const REPO = join(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : process.argv[i + 1]; };
const DATE = arg('--date', new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)); // JST
const OUT = join(HERE, arg('--out', 'batch-auto.json'));
const AREAS = ['ingame', 'code', 'art', 'music', 'voice', 'writing', 'translation', 'marketing'];

function shortDesc(f) {
  const s = (f.descZh || '').replace(/\s+/g, '');
  if (!s) return '';
  const cut = s.search(/[。！？!?]/);
  const one = cut > 10 && cut < 90 ? s.slice(0, cut + 1) : s.slice(0, 80) + (s.length > 80 ? '…' : '');
  return one.endsWith('。') || one.endsWith('…') ? one : `${one}。`;
}

// Handoff §2.7: a planned date that has passed while still unreleased must be written as text.
function releaseText(f) {
  const raw = f.releaseRaw || '';
  const m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(raw);
  const iso = m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
  if (!f.comingSoon) return iso || raw || '发行日期待核实';
  if (iso && iso < DATE) return `商店页标注 ${iso}，核查时（${DATE}）仍未上架`;
  return iso ? `${iso}（计划）` : raw ? `${raw}（计划）` : '即将推出（未定日期）';
}

function discussion(f) {
  const d = f.discussions || { total: 0, scanned: 0, flagged: [] };
  if (!d.total) return { label: 'Steam 社区讨论区检索（暂无主题）', excerpt: '讨论区显示 0 个活跃主题，没有可检查的玩家讨论。' };
  return {
    label: 'Steam 社区讨论区检索（未发现 AI 相关讨论）',
    excerpt: `讨论区共 ${d.total} 个主题，已逐条检查标题，未出现 AI、生成、美术、抄袭等相关关键词。`,
  };
}

const storeFactsPath = join(HERE, 'store-facts.jsonl');
const known = new Set(existsSync(storeFactsPath) ? readFileSync(storeFactsPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).appId) : []);
const files = readdirSync(FACTS).filter((f) => /^\d+\.json$/.test(f));
const batch = { date: DATE, games: [] };
const queue = [];
const newLines = [];

for (const file of files) {
  const f = JSON.parse(readFileSync(join(FACTS, file), 'utf8'));
  const already = existsSync(join(REPO, 'data', 'games', `${f.appId}.json`));
  const flagged = f.discussions?.flagged || [];
  const sf = { name: f.name, appId: f.appId, dev: f.dev, pub: f.pub, release: releaseText(f), genres: f.genres, desc: shortDesc(f), ai: null };
  if (f.demo) sf.demo = f.demo;
  const demoNote = f.demo ? ` 本页对应正式版 App ID ${f.appId}；试玩版另有 App ID ${f.demo}，不混用结论。` : '';
  const scope = `读取了 Steam 商店页 AI 生成内容披露栏和讨论区全部 ${f.discussions?.total || 0} 个主题标题；未做公开报道检索。`;

  if (f.route === 'auto_none') {
    newLines.push(sf);
    batch.games.push({
      appId: f.appId,
      discussion: discussion(f),
      ...(already ? { legacy: true } : {}),
      summary: `${sf.desc} 自动核查未发现生成式 AI 使用证据：Steam 商店页无 AI 生成内容披露，讨论区标题中也未见 AI 相关讨论。`,
      reviewNote: `本次为自动核查：${scope}均未发现生成式 AI 使用证据或开发者声明。Steam 要求开发者披露预生成 AI 内容，因此未披露是一个弱信号，但不是“零 AI”证明；八个领域均标为“未提及”。${demoNote}`,
      fields: { reviewMethod: 'automated' },
    });
  } else if (f.route === 'official' && f.classification && !flagged.length) {
    const c = f.classification;
    const areas = Object.fromEntries(AREAS.filter((a) => c.areas[a] !== 'not_stated').map((a) => [a, c.areas[a]]));
    newLines.push({ ...sf, desc: c.desc || sf.desc, ai: 'official', areas, notes: c.notes, quote: c.quote });
    batch.games.push({
      appId: f.appId,
      discussion: discussion(f),
      ...(already ? { legacy: true } : {}),
      ...(c.aiScopeUnspecified ? { fields: { aiScopeUnspecified: true, reviewMethod: 'automated' } } : { fields: { reviewMethod: 'automated' } }),
      press: '本次未做公开报道检索。',
    });
  } else {
    queue.push(f);
  }
}

for (const line of newLines) {
  if (!known.has(line.appId)) appendFileSync(storeFactsPath, `${JSON.stringify(line)}\n`);
  else console.warn(`store-facts already has ${line.appId}; not overwritten (edit by hand if the facts changed)`);
}
writeFileSync(OUT, `${JSON.stringify(batch, null, 1)}\n`);

// Review queue: everything a person (or one cheap agent call) actually has to read.
const md = [`# 待人工核查（${DATE}）`, '', `自动批次：${batch.games.length} 个游戏 → ${OUT.replace(REPO + '/', '')}`, ''];
for (const f of queue) {
  md.push(`## ${f.name || f.appId} (${f.appId}) — ${f.route}`, `商店页：https://store.steampowered.com/app/${f.appId}/`);
  if (f.reviewReason) md.push(`- 原因：${f.reviewReason}`);
  if (f.route === 'official' && !f.classification) md.push('- 有官方披露，还没分类：先跑 classify-disclosure.mjs');
  if (f.disclosure) md.push(`- 披露原文：${f.disclosure}`);
  for (const h of f.humanClaims || []) md.push(`- 人工制作声明候选（需确认是不是制作方式声明）：…${h}…`);
  for (const t of f.discussions?.flagged || []) md.push(`- 讨论帖（${t.replies} 回复）：[${t.title}](${t.url})`);
  for (const e of f.errors || []) md.push(`- 采集错误：${e}`);
  md.push('');
}
writeFileSync(join(HERE, 'review-queue.md'), md.join('\n'));
console.log(`batch: ${batch.games.length} games -> ${OUT}\nreview queue: ${queue.length} games -> scripts/review/review-queue.md`);
