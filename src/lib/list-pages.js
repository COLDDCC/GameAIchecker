import { readFileSync } from 'node:fs';
import { getGameIndex, AREAS } from './games.js';
import { applyChrome } from './site-chrome.js';
import { englishRecord, areaNames } from './english.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const read = file => JSON.parse(readFileSync(`data/${file}`, 'utf8'));
const statuses = {
  official_disclosure: ['disclosed', 'AI disclosed', 0],
  human_made: ['human', 'Human-made claim', 1],
  no_evidence: ['noevidence', 'No evidence found', 2],
  community: ['community', 'Player report, unverified', 3],
  unreviewed: ['unreviewed', 'Not reviewed yet', 4],
};
const status = game => statuses[game.status] || statuses.unreviewed;
const profile = game => `/games/${game.slug}/`;
const cover = (game, className) => game.header
  ? `<img class="${className}" src="${esc(game.header)}" alt="${esc(game.name)}" loading="lazy" decoding="async" width="460" height="215" onerror="this.style.display='none'">` : '';
const index = () => getGameIndex().slice().sort((a, b) => status(a)[2] - status(b)[2] || a.name.localeCompare(b.name));
const replace = (html, before, after) => {
  if (!html.includes(before)) throw new Error(`Missing list template marker: ${before}`);
  return html.replace(before, after);
};
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');

export function renderHomeList(html) {
  const games = index();
  const cards = games.map(game => `<a class="game" href="${esc(profile(game))}" data-game-id="${esc(game.appId)}"><div class="game-art">${cover(game, '')}</div><div class="game-body"><h3>${esc(game.originalName || game.name)}</h3><p class="dev">${esc(game.developer)}</p><div class="meta"><span class="chip ${status(game)[0]}">${status(game)[1]}</span>${game.humanMadeListing ? `<span class="event">${esc(game.humanMadeListing.labelEn)}</span>` : ''}${game.event ? '<span class="event">Next Fest demo</span>' : ''}</div></div></a>`).join('');
  html = replace(html, '<div class="grid" id="grid"></div>', `<div class="grid" id="grid">${cards}</div>`);
  html = html.replace(/(<p[^>]*id="heroSub"[^>]*>)[\s\S]*?(<\/p>)/, `$1Tracking <strong>${games.length} Steam games</strong>, ${games.filter(g => g.status === 'official_disclosure').length} with an official AI disclosure. Search one to see what its developer has said and the evidence behind it.$2`);
  return replace(html, '<script>\n(() => {', `<script id="game-index" type="application/json">${json({ games })}</script>\n<script>\n(() => {`);
}

// ---------------------------------------------------------------------------
// Unified list pages: /browse/ (English), /games/ (Chinese), /indie-ai/ and
// /events/steam-next-fest-october-2026/. Every page shares one card, one
// toolbar and one filter script (public/list-filters.js). Cards are static
// HTML so the list works without JavaScript and passes scripts/audit-lists.mjs.

const TEXT = {
  en: {
    status: { official_disclosure: 'Official AI disclosure', human_made: 'Human-made claim', no_evidence: 'No verified AI evidence', community: 'Player reports', unreviewed: 'Not reviewed yet' },
    notes: {
      official_disclosure: 'The developer states generative AI use, usually in Steam’s AI content disclosure. Tags show the areas named.',
      human_made: 'The developer or a site-owner review says no generative AI was used. These are claims, not independent audits; tags show the areas covered.',
      no_evidence: 'No disclosure or substantiated report was found when checked. This does not confirm the game is AI-free.',
      community: 'Unverified allegations from players, kept separate from official facts.',
      unreviewed: 'Queued for review.',
    },
    area: key => areaNames[key] || key,
    anyArea: 'Any AI area', sort: ['A–Z', 'Newest release', 'Recently reviewed'], search: 'Game, developer or Steam App ID',
    games: n => `${n} game${n === 1 ? '' : 's'}`, coming: y => `Coming ${y}`, reviewed: d => `Reviewed ${d}`,
    unknownDev: 'Developer unverified', statusGroup: 'Filter by evidence status', barLabel: (parts, n) => `${parts} of ${n} games`,
    clear: 'Clear filters', empty: 'No game matches these filters. Clear the filters, or open the guide to check a game yourself.',
    emptyLink: ['/guides/how-to-check-steam-game-ai/', 'How to check a Steam game'], areaLabel: 'AI areas', sortLabel: 'Sort', areaFilterLabel: 'Disclosed AI area',
  },
  zh: {
    status: { official_disclosure: '官方 AI 披露', human_made: '开发者称人工制作', no_evidence: '未发现可核实证据', community: '玩家投稿 · 待核查', unreviewed: '尚未核查' },
    notes: {
      official_disclosure: '开发者公开说明使用了生成式 AI，通常来自 Steam 的 AI 内容披露。标签为披露中提到的领域。',
      human_made: '开发者或站长审核称未使用生成式 AI。这是声明，不是独立审计；标签为声明覆盖的领域。',
      no_evidence: '核查时未发现披露或可核实的报道。这不代表游戏完全没有使用 AI。',
      community: '玩家提出但未经核实的说法，与官方信息分开记录。',
      unreviewed: '等待核查。',
    },
    area: key => (AREAS.find(a => a.key === key) || {}).label || key,
    anyArea: '全部 AI 领域', sort: ['按名称', '最新发售', '最近核查'], search: '搜索游戏名、开发商或 Steam App ID',
    games: n => `${n} 款游戏`, coming: y => `${y} 年发售`, reviewed: d => `核查于 ${d}`,
    unknownDev: '开发商待核实', statusGroup: '按证据状态筛选', barLabel: (parts, n) => `共 ${n} 款：${parts}`,
    clear: '清除筛选', empty: '没有匹配的游戏。试试清除筛选，或阅读核查指南自行查看。',
    emptyLink: ['/guides/how-to-check-steam-game-ai/', '如何核查 Steam 游戏'], areaLabel: 'AI 领域', sortLabel: '排序', areaFilterLabel: '披露的 AI 领域',
  },
};
const STATUS_ORDER = ['official_disclosure', 'human_made', 'no_evidence', 'community', 'unreviewed'];

// Generic sentences repeated on most English records. Each group states the
// caveat once, so cards keep only the game-specific part.
const boilerplate = [
  'The recorded review found no substantiated generative-AI production evidence for this Steam App ID.',
  'This does not confirm that the game is AI-free.',
  'This is a developer self-report, not an independent technical audit.',
  'Areas not explicitly covered remain unsettled.',
];
const cardSummary = (game, lang) => {
  if (lang === 'zh') return game.summary || '';
  let text = englishRecord(game).summary || '';
  for (const sentence of boilerplate) text = text.replace(sentence, '');
  return text.trim();
};
const thumbOf = src => src.startsWith('/images/') ? src.replace(/\.webp(\?|$)/, '-thumb.webp$1') : '';

function coverHtml(game, compact) {
  const label = `<span class="cover-label" aria-hidden="true">${esc(game.name)}</span>`;
  if (!game.header) return `<div class="cover">${label}</div>`;
  const thumb = compact && thumbOf(game.header);
  const srcset = thumb ? ` srcset="${esc(thumb)} 160w, ${esc(game.header)} 460w" sizes="132px"` : '';
  return `<div class="cover">${label}<img src="${esc(game.header)}"${srcset} alt="" loading="lazy" decoding="async" width="460" height="215" onerror="this.remove()"></div>`;
}

function listCard(game, { lang, thisYear, compact = false, extras = {}, notes = [], tag = '' }) {
  const t = TEXT[lang];
  const year = Number(game.releaseYear) || 0;
  const when = year > thisYear ? t.coming(year) : year ? String(year) : '';
  const summary = cardSummary(game, lang);
  const areas = (game.areaKeys || []).map(key => `<li>${esc(t.area(key))}</li>`).join('');
  const href = lang === 'zh' ? `/games/zh-cn/${game.slug}/` : profile(game);
  const humanTag = game.humanMadeListing ? (lang === 'zh' ? game.humanMadeListing.label || game.humanMadeListing.labelEn : game.humanMadeListing.labelEn) : '';
  const data = {
    search: `${game.name} ${game.originalName || ''} ${game.developer || ''} ${game.appId || ''}`,
    status: game.status, areas: (game.areaKeys || []).join(' '), name: (game.originalName || game.name || '').toLowerCase(),
    year, reviewed: game.reviewedAt || '', ...extras,
  };
  const attrs = Object.entries(data).map(([key, value]) => `data-${key}="${esc(value)}"`).join(' ');
  const meta = [game.developer || t.unknownDev, when].filter(Boolean).map(esc).join(' · ');
  return `<li class="${status(game)[0]}" ${attrs}><a class="card" href="${esc(href)}">${coverHtml(game, compact)}<div class="card-body"><h3>${esc(game.name)}</h3><p class="meta">${meta}</p>${areas ? `<ul class="areas" aria-label="${t.areaLabel}">${areas}</ul>` : ''}${notes.join('')}${summary ? `<p class="summary">${esc(summary)}</p>` : ''}<span class="sr-only">${esc(t.status[game.status] || '')}</span>${(tag || humanTag) ? `<span class="tag">${esc(tag || humanTag)}</span>` : ''}${game.reviewedAt ? `<span class="sr-only">${esc(t.reviewed(game.reviewedAt))}</span>` : ''}</div></a></li>`;
}

function statusBar(items, lang) {
  const t = TEXT[lang];
  const present = STATUS_ORDER.filter(key => items.some(({ game }) => game.status === key));
  const n = key => items.filter(({ game }) => game.status === key).length;
  const bar = present.map(key => `<span class="${statuses[key][0]}" data-status="${key}" style="flex:${n(key)}"></span>`).join('');
  const keys = present.map(key => `<button type="button" class="key ${statuses[key][0]}" data-filter-status="${key}" aria-pressed="false" disabled><i></i><b>${n(key)}</b>${esc(t.status[key])}</button>`).join('');
  const label = t.barLabel(present.map(key => `${n(key)} ${t.status[key]}`).join(', '), items.length);
  return `<div class="dist" id="dist"><div class="dist-bar" role="img" aria-label="${esc(label)}">${bar}</div><div class="dist-keys" role="group" aria-label="${t.statusGroup}">${keys}</div></div>`;
}

function toolbar(items, lang, selects = [], areaFilter = true) {
  const t = TEXT[lang];
  const usedAreas = AREAS.map(a => a.key).filter(key => items.some(({ game }) => (game.areaKeys || []).includes(key)));
  const area = `<select data-filter="areas" data-param="area" aria-label="${t.areaFilterLabel}"><option value="all">${t.anyArea}</option>${usedAreas.map(key => `<option value="${key}">${esc(t.area(key))}</option>`).join('')}</select>`;
  const extra = selects.map(({ key, label, options }) => `<select data-filter="${key}" data-param="${key}" aria-label="${esc(label)}">${options.map(([value, text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select>`).join('');
  const sort = `<select id="sort" data-param="sort" aria-label="${t.sortLabel}"><option value="name">${t.sort[0]}</option><option value="new">${t.sort[1]}</option><option value="reviewed">${t.sort[2]}</option></select>`;
  return `<div class="tools"><div class="wrap tools-inner"><label class="search"><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" stroke="currentColor" stroke-width="2"/><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="sr-only">${t.search}</span><input id="q" type="search" placeholder="${t.search}" autocomplete="off"></label>${extra}${areaFilter && usedAreas.length ? area : ''}${sort}<button class="reset" id="reset" type="button" hidden>${t.clear}</button><p class="count" id="count" aria-live="polite">${t.games(items.length)}</p></div></div>`;
}

function groupsHtml(groups, gridId, lang, thisYear) {
  const sections = groups.filter(g => g.items.length).map(g => `<section class="group" aria-labelledby="g-${g.key}"><div class="group-head"><h2 id="g-${g.key}">${esc(g.title)}</h2><span class="n" data-group-count>${g.items.length}</span></div>${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ''}<ul class="cards${g.compact ? ' compact' : ''}">${g.items.map(item => listCard(item.game, { lang, thisYear, compact: g.compact, ...item })).join('')}</ul></section>`).join('');
  const t = TEXT[lang];
  return `<div class="wrap" id="${gridId}">${sections}</div><p class="wrap empty" id="empty" hidden>${t.empty} <a href="${t.emptyLink[0]}">${t.emptyLink[1]}</a></p>`;
}

const byStatus = (items, lang) => STATUS_ORDER.map(key => ({
  key, title: TEXT[lang].status[key], note: TEXT[lang].notes[key], compact: key === 'no_evidence',
  items: items.filter(({ game }) => game.status === key),
}));

function itemListJsonLd(items, lang, name) {
  const base = 'https://gameaichecker.com';
  return `<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@type': 'ItemList', name, numberOfItems: items.length,
    itemListElement: items.map(({ game }, i) => ({ '@type': 'ListItem', position: i + 1, name: game.name, url: base + (lang === 'zh' ? `/games/zh-cn/${game.slug}/` : profile(game)) })) })}</script>`;
}

const ROUTES = {
  browse: { lang: 'en', current: 'browse', gridId: 'grid' },
  games: { lang: 'zh', current: 'browse', gridId: 'cards' },
  'indie-ai': { lang: 'en', current: 'indie', gridId: 'grid' },
  'events/steam-next-fest-october-2026': { lang: 'en', current: 'nextfest', gridId: 'grid' },
};

export function renderLegacyList(html, route) {
  const config = ROUTES[route];
  if (!config) return html;
  const { lang, gridId } = config;
  const thisYear = new Date().getFullYear();
  const games = index();
  const byId = new Map(games.map(g => [String(g.appId), g]));
  let items, groups, top = '', selects = [], sources = '', areaFilter = true;

  if (route === 'browse' || route === 'games') {
    items = games.map(game => ({ game }));
    groups = byStatus(items, lang);
    top = statusBar(items, lang);
  } else if (route === 'indie-ai') {
    const data = read('indie-roguelike-ai-disclosures.json');
    items = data.games.map(entry => {
      const game = byId.get(String(entry.appId));
      if (!game) throw new Error(`${route}: ${entry.name} has no canonical game record`);
      const review = entry.evidenceReview?.status === 'verified_against_steam' ? 'verified' : 'pending';
      const mode = entry.evidenceReview?.deliveryMode === 'runtime_generation' ? 'AI generates content during play'
        : entry.evidenceReview?.deliveryMode === 'pre_generated' ? 'Pre-generated AI-assisted content' : '';
      const notes = [mode && `<p class="note">${esc(mode)}</p>`, entry.evidenceReview?.openQuestion && `<p class="note warn">Open question: ${esc(entry.evidenceReview.openQuestion)}</p>`].filter(Boolean);
      return { game, entry, notes, tag: review === 'verified' ? '' : 'Usage tags not yet checked against Steam',
        extras: { genre: entry.genre?.startsWith('rogue') ? 'rogue' : 'single', usage: (entry.aiUsageCategories || []).join(' '), review } };
    });
    groups = [
      { key: 'rogue', title: 'Roguelike & roguelite', items: items.filter(i => i.extras.genre === 'rogue') },
      { key: 'single', title: 'Other single-player games', items: items.filter(i => i.extras.genre === 'single') },
    ];
    const verified = items.filter(i => i.extras.review === 'verified').length;
    top = `<p class="lead">${verified === items.length ? `Disclosure wording for all ${items.length} games has been checked against Steam.` : `${verified} of ${items.length} games have disclosure wording checked against Steam.`}</p>`;
    selects = [{ key: 'usage', label: 'AI use', options: [['all', 'Any AI use'], ...Object.entries(data.taxonomy || {})] }];
    if (verified && verified < items.length) selects.push({ key: 'review', label: 'Source check', options: [['all', 'Any source check'], ['verified', 'Checked against Steam'], ['pending', 'Not yet checked']] });
    areaFilter = false;
    sources = `<details class="sources wrap"><summary>Sources and extra evidence</summary><ul>${items.map(({ game, entry }) => `<li><a href="${esc(entry.sourceUrl || game.steamUrl)}" target="_blank" rel="noopener noreferrer">${esc(game.name)} on Steam</a>${String(game.appId) === '5053550' ? ` · <a href="/evidence/ccr/">CCR evidence chain</a>` : ''}</li>`).join('')}</ul></details>`;
  } else {
    const data = read('next-fest-october-2026.json');
    items = data.games.map(entry => {
      const game = byId.get(String(entry.steamAppId || entry.appId));
      if (!game) throw new Error(`${route}: ${entry.name} has no canonical game record`);
      return { game, entry, notes: entry.popularityReason ? [`<p class="note">${esc(entry.popularityReason)}</p>`] : [] };
    });
    groups = byStatus(items, lang).map(g => ({ ...g, compact: false }));
    top = statusBar(items, lang);
    sources = `<details class="sources wrap"><summary>Where the event listings come from</summary><ul>${items.map(({ game, entry }) => `<li>${esc(game.name)}: <a href="${esc(entry.popularitySource)}" target="_blank" rel="noopener noreferrer">${esc(entry.popularityReason || 'event listing')}</a></li>`).join('')}</ul></details>`;
  }

  html = replace(html, '<!--LIST-TOP-->', top);
  html = replace(html, '<!--LIST-->', toolbar(items, lang, selects, areaFilter) + `<div id="content">${groupsHtml(groups, gridId, lang, thisYear)}${sources}</div>`);
  html = applyChrome(html, { lang, current: config.current, langSwitch: route === 'browse' || route === 'games' });
  html = html.replace('</head>', `${itemListJsonLd(items, lang, html.match(/<title>([^<|]*)/)?.[1]?.trim() || 'Game AI Checker')}</head>`);
  // Without JS the full list stays readable; controls stay disabled until the script runs.
  html = html.replace(/<(input|select)\b/g, '<$1 disabled');
  return html.replace('</body>', '<script src="/list-filters.js" defer></script></body>');
}
