import { readFileSync } from 'node:fs';
import { getGameIndex } from './games.js';
import { englishRecord } from './english.js';

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

function attributes(game, extras = {}) {
  return Object.entries({ search: `${game.name} ${game.originalName || ''} ${game.developer || ''} ${game.appId || ''}`, status: game.status,
    era: Number(game.releaseYear) > 0 ? Number(game.releaseYear) < 2022 ? 'classic' : 'modern' : 'unknown', ...extras })
    .map(([key, value]) => `data-${key}="${esc(value)}"`).join(' ');
}
function englishCard(game, extras = {}, text = '') {
  return `<article class="card" ${attributes(game, extras)}>${cover(game, 'gac-cover')}<div class="gac-card-content"><h2><a href="${esc(`/games/${game.slug}/`)}">${esc(game.name)}</a></h2><span class="tag pill">${status(game)[1]}</span><p class="small">${esc(game.developer)}${game.releaseYear ? ` · Steam release: ${esc(game.releaseYear)}` : ''}</p><p>${esc(englishRecord(game).summary)}</p>${text}<p><a href="${esc(`/games/${game.slug}/`)}">View evidence →</a> · <a href="${esc(game.steamUrl)}" target="_blank" rel="noopener noreferrer">Steam store ↗</a> · <a href="/share/?game=custom&amp;title=${encodeURIComponent(game.name)}">Share card ↗</a></p></div></article>`;
}
function chineseCard(game) {
  return `<a class="card" href="${esc(`/games/zh-cn/${game.slug}/`)}" ${attributes(game)}>${cover(game, 'cover')}<div class="body"><div class="badge tone-${esc(game.statusTone || 'gray')}">${esc(game.statusLabel)}</div><h2>${esc(game.name)}</h2><p class="dev">${esc(game.developer || '开发商待核实')}${game.releaseYear ? ` · ${esc(game.releaseYear)}` : ''}</p><p class="summary">${esc(game.summary)}</p>${game.areaSummary ? `<div class="chips">${game.areaSummary.split('、').slice(0, 3).map(label => `<span class="chip">${esc(label)}</span>`).join('')}</div>` : ''}<span class="more">查看档案 →</span></div></a>`;
}

export function renderLegacyList(html, route) {
  if (!['games', 'browse', 'indie-ai', 'events/steam-next-fest-october-2026'].includes(route)) return html;
  const games = index();
  const byId = new Map(games.map(g => [String(g.appId), g]));
  let cards, count, controls;
  if (route === 'games') {
    cards = games.map(chineseCard).join('');
    count = `${games.length} / ${games.length} 款游戏`;
    controls = { query: 'search', status: 'filter' };
    html = replace(html, '<div class="grid" id="cards"></div>', `<div class="grid" id="cards">${cards}</div>`);
  } else if (route === 'browse') {
    cards = games.map(g => englishCard(g)).join('');
    count = `${games.length} / ${games.length} games`;
    controls = { query: 'q', status: 'status', era: 'era' };
    html = html.replace('value="official_ai_disclosure"', 'value="official_disclosure"').replace('value="developer_no_genai_statement"', 'value="human_made"').replace('value="no_verified_genai_evidence"', 'value="no_evidence"');
    html = replace(html, '<div class="grid" id="grid"></div>', `<div class="grid" id="grid">${cards}</div>`);
  } else {
    const indie = route === 'indie-ai';
    const data = read(indie ? 'indie-roguelike-ai-disclosures.json' : 'next-fest-october-2026.json');
    const entries = data.games.map(entry => ({ entry, game: byId.get(String(entry.appId || entry.steamAppId)) }));
    if (entries.some(({ game }) => !game)) throw new Error(`${route}: an entry has no canonical game record`);
    cards = entries.map(({ entry, game }) => {
      const extra = indie ? { genre: entry.genre?.startsWith('rogue') ? 'rogue' : entry.genre,
        usage: (entry.aiUsageCategories || []).join(' '), review: entry.evidenceReview?.status === 'verified_against_steam' ? 'verified' : 'pending' } : {};
      const disclosure = entry.evidenceReview?.developerDisclosureSummary || entry.evidenceReview?.developerDisclosureExcerpt;
      const usage = (entry.aiUsageCategories || []).map(key => data.taxonomy?.[key] || key).join(' · ');
      const mode = entry.evidenceReview?.deliveryMode === 'runtime_generation' ? 'AI generates content during gameplay'
        : entry.evidenceReview?.deliveryMode === 'pre_generated' ? 'AI-assisted pre-generated content' : 'Usage mode not yet source-checked';
      const text = indie ? `<p class="small">${esc(mode)}</p><p class="small">${esc(usage)}</p>${disclosure ? `<blockquote>${entry.evidenceReview?.developerDisclosureSummary ? 'Steam disclosure summary: ' : 'Steam developer disclosure: '}${esc(disclosure)}</blockquote>` : ''}${entry.evidenceReview?.openQuestion ? `<p>Needs clarification: ${esc(entry.evidenceReview.openQuestion)}</p>` : ''}<p class="small">${entry.evidenceReview?.status === 'verified_against_steam' ? 'Disclosure wording checked against Steam; this is still a developer claim.' : 'Usage categories inferred from summary, not independently reviewed.'}</p>`
        : `<p>${esc(entry.popularityReason)}</p><p><a href="${esc(entry.popularitySource)}" target="_blank" rel="noopener noreferrer">Event listing source ↗</a></p>`;
      return englishCard(game, extra, text + (String(game.appId) === '5053550' ? '<p><a href="/evidence/ccr/">Evidence chain ↗</a></p>' : ''));
    }).join('');
    count = `${entries.length} / ${entries.length} games`;
    controls = indie ? { query: null, genre: 'filter', usage: 'usage', review: 'review' } : { query: 'q' };
    if (indie) html = replace(html, '<section class="grid" id="grid"></section>', `<section class="grid" id="grid">${cards}</section>`);
    else html = replace(html, '<div id="grid" class="grid"></div>', `<div id="grid" class="grid">${cards}</div>`);
    if (!indie) {
      html = html.replace('Trending games to review for generative AI disclosures.', 'Explore game records linked to third-party October 2026 Next Fest coverage.');
      html = html.replace('AI status is unknown until verified.', 'Event listings are third-party reports; AI status comes from each game record.');
      html = html.replace('AI Disclosure Review Queue', 'AI Disclosure & Evidence').replace('Explore trending October 2026 Steam Next Fest games awaiting independent AI disclosure review. Unknown is not AI-free.', 'Explore October 2026 Steam Next Fest game records, AI disclosures and original sources. Event inclusion does not imply AI use.');
      html = html.replace('</style>', '.card>.gac-cover{display:block;width:100%;aspect-ratio:460/215;object-fit:cover;border-radius:8px}.card h2{font-size:1.25rem}</style>');
    }
  }
  html = html.replace(/(<p[^>]*id="count"[^>]*>)[\s\S]*?(<\/p>)/, `$1${count}$2`);
  // Replace obsolete client-only data/renderers. Filtering now works on the
  // actual HTML cards, with no JSON request or duplicated game records.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const gridId = route === 'games' ? 'cards' : 'grid';
  const config = { gridId, controls, locale: route === 'games' ? 'zh' : 'en' };
  html = html.replace('</body>', `<script id="list-config" type="application/json">${json(config)}</script><script src="/list-filters.js" defer></script></body>`);
  html = html.replace('</head>', '<style>[hidden]{display:none!important}</style></head>');
  // Without JS the full list stays readable; inactive controls are disabled.
  html = html.replace(/<(input|select)\b/g, '<$1 disabled');
  return html;
}
