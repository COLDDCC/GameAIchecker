import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DATA = join(ROOT, 'data');
const STEAM_CACHE = join(DATA, 'steam');

export const AREAS = [
  { key: 'ingame', label: '游戏内 AI', en: 'In-game AI', scope: '实时生成内容、玩法内 AI 功能' },
  { key: 'code', label: '代码', en: 'Code', scope: '编程、开发工具协助' },
  { key: 'art', label: '美术 / 视觉', en: 'Art', scope: '角色、场景、UI、宣传图' },
  { key: 'music', label: '音乐与音效', en: 'Music & SFX', scope: '音乐、音效、音频素材' },
  { key: 'voice', label: '配音', en: 'Voice', scope: '配音、旁白、文本转语音' },
  { key: 'writing', label: '文案 / 剧情', en: 'Writing', scope: '故事、对白、任务文本' },
  { key: 'translation', label: '本地化 / 翻译', en: 'Translation', scope: '翻译、文本润色' },
  { key: 'marketing', label: '营销素材', en: 'Marketing', scope: '宣传图、预告、商店素材' },
];

export const STATUS_LABELS = {
  official_disclosure: '官方 AI 披露',
  third_party: '第三方研究',
  human_made: '开发者称人工制作',
  no_evidence: '未发现可核实证据',
  community: '玩家投稿 · 待核查',
  unreviewed: '尚未核查',
};

export const STATE_LABELS = {
  used: '已披露使用',
  not_stated: '未提及',
  claimed_none: '开发者称未使用',
  none: '明确未使用',
  unreviewed: '未核查',
};

const CATEGORY_MAP = {
  visuals: 'art', visual: 'art', art: 'art', artwork: 'art', image: 'art', images: 'art',
  texture: 'art', textures: 'art', '3d': 'art', model: 'art', models: 'art',
  animation: 'art', animations: 'art', motion: 'art',
  audio: 'music', music: 'music', sound: 'music', sfx: 'music', soundtrack: 'music',
  writing: 'writing', text: 'writing', narrative: 'writing', story: 'writing',
  dialogue: 'writing', quest: 'writing',
  code: 'code', coding: 'code', programming: 'code', script: 'code',
  live_generation: 'ingame', runtime_generation: 'ingame', 'runtime-generation': 'ingame',
  ingame: 'ingame', gameplay: 'ingame', 'in-game': 'ingame',
  voice: 'voice', voices: 'voice', voiceover: 'voice', 'text-to-speech': 'voice', tts: 'voice',
  narration: 'voice',
  localization: 'translation', localisation: 'translation', translation: 'translation',
  translate: 'translation',
  marketing: 'marketing', promotional: 'marketing', promo: 'marketing',
};

const TEXT_PATTERNS = {
  art: /\b(art|artwork|image|images|visual|visuals|texture|textures|3d|model|models|animation)\b|美术|图像|贴图|建模|动画/i,
  music: /\b(music|audio|sound|sfx|soundtrack)\b|音乐|音频|音效/i,
  voice: /\b(voice|voices|voiceover|text-to-speech|tts|narration)\b|配音|语音/i,
  writing: /\b(text|writing|narrative|story|dialogue|quest)\b|文案|剧情|文本/i,
  translation: /\b(localization|localisation|translation|translate|translated)\b|本地化|翻译/i,
  code: /\b(code|coding|programming|script)\b|代码|编程/i,
  ingame: /\b(runtime|in-game|gameplay|live generation|real-time)\b|实时生成|游戏内生成/i,
  marketing: /\b(marketing|promotional|promo|store assets)\b|营销|宣传/i,
};

const TYPE_LABELS = {
  official_disclosure: '官方 AI 披露',
  steam_store: 'Steam 商店',
  developer_statement: '开发者声明',
  developer_claim: '开发者声明',
  third_party: '第三方来源',
  community: '玩家投稿',
  patch_note: '官方更新日志',
  interview: '媒体采访',
  steam_page: 'Steam 页面',
  source: '来源',
};

function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function cleanText(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value) {
  const out = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return out || 'game';
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function asSet(values) {
  const set = new Set();
  for (const value of asArray(values)) {
    const key = String(value || '').toLowerCase().trim();
    if (CATEGORY_MAP[key]) set.add(CATEGORY_MAP[key]);
  }
  return set;
}

function guessType(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('store.steampowered.com')) return 'steam_store';
  if (value.includes('steamcommunity.com')) return 'community';
  if (value.includes('github.com')) return 'source';
  return 'source';
}

function normalizeSource(input, fallbackType = 'source') {
  if (!input) return null;
  if (typeof input === 'string') {
    return { url: /^https?:\/\//i.test(input) ? input : null, label: input, type: fallbackType, date: null, excerpt: null };
  }
  const url = input.url || input.sourceUrl || input.steamUrl || input.steamVerificationUrl || null;
  const label = cleanText(input.label || input.title || input.supports || input.summary || input.finding || url || '来源');
  const type = input.type || input.sourceType || fallbackType;
  return {
    url: url && /^https?:\/\//i.test(url) ? url : null,
    label: label || url || '来源',
    type,
    date: input.date || input.publishedAt || input.sourceDate || null,
    excerpt: cleanText(input.excerpt || input.supports || input.finding || input.summary || '') || null,
  };
}

function pushSources(target, sources, fallbackType = 'source') {
  for (const source of asArray(sources)) {
    const item = normalizeSource(source, fallbackType);
    if (!item) continue;
    if (item.url && target.some((existing) => existing.url === item.url)) continue;
    if (!item.url && target.some((existing) => !existing.url && existing.label === item.label)) continue;
    target.push(item);
  }
}

function emptyRecord(sourceName) {
  return {
    sourceName,
    appId: null,
    name: '',
    developer: '',
    publisher: '',
    summary: '',
    description: '',
    category: '',
    verification: '',
    aiLevel: null,
    steamUrl: null,
    website: null,
    releaseDate: null,
    releaseYear: null,
    genres: [],
    tags: [],
    features: [],
    links: [],
    languages: null,
    review: null,
    players: null,
    event: null,
    platform: 'Steam',
    usedCategories: new Set(),
    aiAreas: {},
    aiAreaNotes: {},
    disclosureQuote: '',
    disclosureQuoteNote: '',
    sources: [],
    reviewNote: '',
    reviewedAt: null,
    priority: 0,
  };
}

function mergeInto(base, add) {
  for (const key of ['name', 'developer', 'publisher', 'summary', 'description', 'category', 'verification', 'steamUrl', 'website', 'releaseDate', 'reviewNote', 'reviewedAt', 'languages']) {
    if (!base[key] && add[key]) base[key] = add[key];
  }
  if (!base.releaseYear && add.releaseYear) base.releaseYear = add.releaseYear;
  if (base.aiLevel == null && add.aiLevel != null) base.aiLevel = add.aiLevel;
  if (!base.event && add.event) base.event = add.event;
  if (!base.review && add.review) base.review = add.review;
  if (!base.players && add.players) base.players = add.players;
  for (const value of add.usedCategories) base.usedCategories.add(value);
  for (const key of Object.keys(add.aiAreas || {})) {
    if (!base.aiAreas[key]) base.aiAreas[key] = add.aiAreas[key];
  }
  for (const key of Object.keys(add.aiAreaNotes || {})) {
    if (!base.aiAreaNotes[key]) base.aiAreaNotes[key] = add.aiAreaNotes[key];
  }
  if (!base.disclosureQuote && add.disclosureQuote) base.disclosureQuote = add.disclosureQuote;
  if (!base.disclosureQuoteNote && add.disclosureQuoteNote) base.disclosureQuoteNote = add.disclosureQuoteNote;
  if (!base.genres.length && add.genres.length) base.genres = add.genres.slice();
  if (!base.tags.length && add.tags.length) base.tags = add.tags.slice();
  if (!base.features.length && add.features.length) base.features = add.features.slice();
  if (!base.links.length && add.links.length) base.links = add.links.slice();
  pushSources(base.sources, add.sources);
}

function fromCanonical(data, sourceName) {
  const record = emptyRecord(sourceName);
  record.appId = data.appId ? String(data.appId) : null;
  record.name = cleanText(data.name);
  record.developer = cleanText(data.developer);
  record.publisher = cleanText(data.publisher);
  record.summary = cleanText(data.summary);
  record.category = data.category || '';
  record.verification = data.verification || '';
  record.aiLevel = data.aiLevel ?? null;
  record.steamUrl = data.steamUrl || (record.appId ? `https://store.steampowered.com/app/${record.appId}/` : null);
  record.website = data.website || null;
  record.releaseDate = data.steamReleaseDate || data.releaseDate || null;
  record.releaseYear = data.originalReleaseYear || data.releaseYear || null;
  record.genres = asArray(data.genres).map(cleanText).filter(Boolean);
  record.tags = asArray(data.tags).map(cleanText).filter(Boolean);
  record.features = asArray(data.features).map(cleanText).filter(Boolean);
  record.links = asArray(data.links)
    .map((link) => ({ label: cleanText(link?.label || link?.name || link?.url), url: link?.url && /^https?:\/\//i.test(link.url) ? link.url : null }))
    .filter((link) => link.url);
  record.languages = cleanText(data.languages);
  record.review = data.review || null;
  record.players = data.players || null;
  record.usedCategories = asSet([...(data.aiUsageCategories || []), ...(data.useTypes || [])]);
  record.aiAreas = data.aiAreas || {};
  record.aiAreaNotes = data.aiAreaNotes || {};
  record.aiAreaSources = data.aiAreaSources || {};
  record.disclosureQuote = cleanText(data.disclosureQuote);
  record.disclosureQuoteNote = cleanText(data.disclosureQuoteNote);
  record.reviewNote = cleanText(data.reviewNote);
  record.reviewedAt = data.reviewedAt || data.lastReviewed || data.sourceDate || null;
  record.priority = 100;
  pushSources(record.sources, data.sources || (data.sourceUrl ? [{ url: data.sourceUrl, label: data.summary, type: 'source', date: data.sourceDate }] : []));
  return record;
}

function fromGamesJson(data) {
  const record = emptyRecord('games.json');
  record.appId = data.appId ? String(data.appId) : null;
  record.name = cleanText(data.name);
  record.developer = cleanText(data.developer);
  record.summary = cleanText(data.summary);
  record.category = data.category || '';
  record.verification = data.verification || '';
  record.aiLevel = data.aiLevel ?? null;
  record.steamUrl = record.appId ? `https://store.steampowered.com/app/${record.appId}/` : null;
  record.usedCategories = asSet(data.useTypes || data.aiUsageCategories);
  record.reviewNote = cleanText(data.reviewNote);
  record.reviewedAt = data.sourceDate || null;
  record.priority = 80;
  if (data.sourceUrl) {
    const type = String(data.category || '').includes('official') ? 'official_disclosure' : 'developer_statement';
    pushSources(record.sources, [{ url: data.sourceUrl, label: data.summary, type, date: data.sourceDate }]);
  }
  return record;
}

function fromIndie(data) {
  const record = emptyRecord('indie-roguelike-ai-disclosures.json');
  record.appId = data.appId ? String(data.appId) : null;
  record.name = cleanText(data.name);
  record.developer = cleanText(data.developer);
  record.summary = cleanText(data.summary);
  record.category = data.aiStatus || '';
  record.verification = data.verification || '';
  record.aiLevel = data.aiLevel ?? null;
  record.steamUrl = data.sourceUrl || (record.appId ? `https://store.steampowered.com/app/${record.appId}/` : null);
  record.releaseDate = data.releaseDate || null;
  record.genres = data.genre ? [cleanText(data.genre)] : [];
  record.usedCategories = asSet([
    ...(data.aiUsageCategories || []),
    ...(data.evidenceReview?.confirmedUsageCategories || []),
  ]);
  record.reviewNote = cleanText([data.note, data.evidenceReview?.limits].filter(Boolean).join(' '));
  record.reviewedAt = data.evidenceReview?.reviewedAt || null;
  record.priority = 70;
  const type = String(data.aiStatus || '').includes('official') ? 'official_disclosure' : 'developer_statement';
  pushSources(record.sources, [
    { url: data.sourceUrl || data.evidenceReview?.source, label: data.summary, type },
    data.evidenceReview?.source ? { url: data.evidenceReview.source, label: data.evidenceReview.developerDisclosureSummary || 'Steam 披露', type: 'official_disclosure' } : null,
  ]);
  return record;
}

function fromNextFest100(data) {
  const record = emptyRecord('next-fest-100.json');
  record.appId = data.steamAppId ? String(data.steamAppId) : null;
  record.name = cleanText(data.name);
  record.developer = cleanText(data.developer);
  record.summary = cleanText(data.aiEvidence?.[0]?.summary || data.note || '');
  record.category = data.aiStatus || '';
  record.verification = data.sourceType || '';
  record.aiLevel = data.aiLevel ?? null;
  record.steamUrl = data.steamVerificationUrl || (record.appId ? `https://store.steampowered.com/app/${record.appId}/` : null);
  record.event = data.event || null;
  record.genres = asArray(data.genres).map(cleanText).filter(Boolean);
  record.usedCategories = asSet(data.aiUsageCategories || []);
  record.reviewNote = cleanText(data.note);
  record.reviewedAt = data.steamIdVerifiedAt || null;
  record.priority = 50;
  for (const evidence of asArray(data.aiEvidence)) {
    pushSources(record.sources, [{
      url: evidence.sourceUrl,
      label: evidence.summary || 'Steam AI 披露',
      type: evidence.sourceType || 'official_disclosure',
    }]);
  }
  if (data.steamVerificationUrl) {
    pushSources(record.sources, [{ url: data.steamVerificationUrl, label: 'Steam 商店页', type: 'steam_store' }]);
  }
  return record;
}

function fromNextFestOctober(data) {
  const record = emptyRecord('next-fest-october-2026.json');
  record.name = cleanText(data.name);
  record.summary = cleanText(data.popularityReason || data.notice || '');
  record.category = data.aiStatus || '';
  record.verification = 'third_party_event_listing';
  record.event = data.event || null;
  record.reviewNote = '来自第三方新品节名单，Steam App ID 与 AI 披露均未核实。';
  record.priority = 30;
  if (data.popularitySource) {
    pushSources(record.sources, [{ url: data.popularitySource, label: data.popularityReason || '新品节人气来源', type: 'third_party' }]);
  }
  return record;
}

function fromHumanMade(data) {
  const record = emptyRecord('human-made-game-claims.json');
  record.appId = data.steamAppId ? String(data.steamAppId) : null;
  record.name = cleanText(data.englishName || data.name);
  record.developer = cleanText(data.developer);
  record.summary = cleanText(data.claimOriginal || data.reviewConclusion);
  record.category = data.claimType || 'developer_no_genai_statement';
  record.verification = data.verificationLevel || '';
  record.steamUrl = data.steamUrl || (record.appId ? `https://store.steampowered.com/app/${record.appId}/` : null);
  record.reviewNote = cleanText([data.reviewConclusion, data.developerAttributionNote].filter(Boolean).join(' '));
  record.reviewedAt = data.reviewedAt || null;
  record.priority = 60;
  if (data.steamUrl) pushSources(record.sources, [{ url: data.steamUrl, label: 'Steam 页面', type: 'steam_store' }]);
  return record;
}

function fromCommunity(data) {
  const record = emptyRecord('community-game-submissions.json');
  record.appId = data.steamAppId ? String(data.steamAppId) : null;
  record.name = cleanText(data.englishName || data.gameName);
  record.developer = cleanText(data.developer);
  record.publisher = cleanText(data.publisher);
  record.summary = cleanText(data.opinion || data.note);
  record.category = 'community';
  record.verification = data.verification || '';
  record.steamUrl = data.steamUrl || (record.appId ? `https://store.steampowered.com/app/${record.appId}/` : null);
  record.genres = asArray(data.genreTags).map(cleanText).filter(Boolean);
  record.reviewNote = cleanText(data.note);
  record.priority = 40;
  if (data.steamUrl) pushSources(record.sources, [{ url: data.steamUrl, label: 'Steam 页面', type: 'steam_store' }]);
  if (data.identitySource) pushSources(record.sources, [{ url: data.identitySource, label: '身份来源', type: 'community' }]);
  return record;
}

function deriveStatus(record) {
  const category = String(record.category || '').toLowerCase();
  const hasExplicitUse = record.usedCategories.size > 0;
  const explicitUsedArea = Object.values(record.aiAreas || {}).some((value) => value === 'used');
  if (hasExplicitUse || explicitUsedArea) return 'official_disclosure';
  if (category.includes('official') || category.includes('ai_disclosure')) return 'official_disclosure';
  if (category.includes('no_verified') || category.includes('no_evidence')) return 'no_evidence';
  if (category.includes('human') || category.includes('no_genai') || category.includes('human_made')) return 'human_made';
  if (category.includes('community') || category.includes('subjective') || category.includes('recommended')) return 'community';
  return 'unreviewed';
}

function deriveAreasFromText(text) {
  const found = new Set();
  for (const [key, pattern] of Object.entries(TEXT_PATTERNS)) {
    if (pattern.test(text)) found.add(key);
  }
  return found;
}

function readSteamCache(appId) {
  if (!appId) return null;
  const file = join(STEAM_CACHE, `${appId}.json`);
  if (!existsSync(file)) return null;
  const data = readJson(file);
  if (!data || data.unavailable) return null;
  return data;
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function finalize(record) {
  const status = deriveStatus(record);
  let usedCategories = new Set(record.usedCategories);
  if (status === 'official_disclosure' && usedCategories.size === 0) {
    usedCategories = deriveAreasFromText(`${record.summary} ${record.reviewNote}`);
  }
  const steam = readSteamCache(record.appId);
  const name = record.name || steam?.name || `Steam ${record.appId || '游戏'}`;

  const developer = record.developer || (steam?.developers || []).join(', ');
  const publisher = record.publisher || (steam?.publishers || []).join(', ');
  const genres = (record.genres.length ? record.genres : (steam?.genres || [])).map(cleanText).filter(Boolean);
  const tags = (record.tags.length ? record.tags : (steam?.categories || [])).map(cleanText).filter(Boolean);
  const summary = record.summary || (status === 'unreviewed' ? '目前没有可核实的 AI 使用披露。未提及不等于没有使用。' : '');
  const steamUrl = record.steamUrl || (record.appId ? `https://store.steampowered.com/app/${record.appId}/` : null);
  const releaseDate = record.releaseDate || steam?.releaseDate || null;
  const releaseYear = record.releaseYear || (releaseDate ? String(releaseDate).match(/\d{4}/)?.[0] : null);

  const areas = AREAS.map((area) => {
    const explicit = record.aiAreas?.[area.key];
    let state;
    if (explicit === 'used' || usedCategories.has(area.key)) state = 'used';
    else if (explicit === 'none') state = 'none';
    else if (explicit === 'not_stated') state = 'not_stated';
    else if (status === 'human_made') state = 'claimed_none';
    else if (status === 'official_disclosure') state = 'not_stated';
    else state = 'unreviewed';
    return { ...area, state, stateLabel: STATE_LABELS[state] };
  });

  let images = [];
  const seen = new Set();
  const addImage = (src, full, label, kind) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    images.push({ src, full: full || src, label, kind });
  };
  if (steam?.background) addImage(steam.background, steam.background, '官方宣传图', 'hero');
  if (steam?.header) addImage(steam.header, steam.header, 'Steam 封面', 'header');
  for (const shot of steam?.screenshots || []) {
    addImage(shot.thumbnail || shot.full, shot.full || shot.thumbnail, '游戏截图', 'screenshot');
  }
  if (!images.length && record.appId) {
    const local = `/images/steam/apps/${record.appId}/header.jpg`;
    images.push({ src: local, full: local, label: 'Steam 封面', kind: 'header', fallback: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${record.appId}/header.jpg` });
  }

  const galleryPath = join(ROOT, 'public', 'images', 'steam', 'apps', String(record.appId), 'gallery.json');
  const localGallery = existsSync(galleryPath) ? JSON.parse(readFileSync(galleryPath, 'utf8')) : null;
  if (localGallery?.images?.length) images = localGallery.images;

  const movies = (localGallery?.movies || steam?.movies || []).filter((movie) => movie.thumbnail || movie.mp4 || movie.webm).slice(0, 8);

  const evidence = record.sources
    .map((source) => ({ ...source, typeLabel: TYPE_LABELS[source.type] || TYPE_LABELS.source }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const key = record.appId ? `steam:${record.appId}` : `name:${name}`;
  const areaSummary = areas
    .filter((area) => area.state === 'used')
    .map((area) => `${area.label}（${area.stateLabel}）`)
    .join('、');

  return {
    ...record,
    usedCategories: [...usedCategories],
    slug: record.slug,
    name,
    developer,
    publisher,
    genres,
    tags,
    summary,
    steamUrl,
    releaseDate,
    releaseYear,
    releaseISO: toDate(steam?.releaseTime || releaseDate),
    steamDescription: cleanText(steam?.description || record.description),
    website: record.website || steam?.website || null,
    price: steam?.price || null,
    priceValue: steam?.priceValue ?? null,
    priceCurrency: steam?.priceCurrency || null,
    platforms: steam?.platforms || null,
    languages: cleanText(record.languages || steam?.languages || ''),
    metacritic: steam?.metacritic || null,
    review: record.review || steam?.review || null,
    players: record.players || steam?.players || null,
    features: record.features,
    links: record.links,
    header: steam?.header || images[0]?.src || null,
    background: steam?.background || null,
    images,
    movies,
    status,
    statusLabel: STATUS_LABELS[status] || STATUS_LABELS.unreviewed,
    statusTone: status === 'official_disclosure' ? 'amber' : status === 'human_made' ? 'green' : status === 'no_evidence' ? 'blue' : 'gray',
    areas,
    aiAreaNotes: record.aiAreaNotes,
    aiAreaSources: record.aiAreaSources || {},
    disclosureQuote: record.disclosureQuote,
    disclosureQuoteNote: record.disclosureQuoteNote,
    usedAreas: areas.filter((area) => area.state === 'used'),
    areaSummary,
    evidence,
    reviewNote: record.reviewNote,
    reviewedAt: record.reviewedAt,
    key,
    similar: [],
    otherGames: [],
  };
}

let cachedAll = null;

export function getAllGames() {
  if (cachedAll) return cachedAll;

  const records = new Map();
  const upsert = (record) => {
    if (!record || !record.name) return;
    const key = record.appId ? `id:${record.appId}` : `name:${record.name.toLowerCase()}`;
    const existing = records.get(key);
    if (!existing) {
      records.set(key, record);
      return;
    }
    if (record.priority > existing.priority) {
      const merged = record;
      mergeInto(merged, existing);
      records.set(key, merged);
    } else {
      mergeInto(existing, record);
    }
  };

  const canonicalDir = join(DATA, 'games');
  if (existsSync(canonicalDir)) {
    for (const file of readdirSync(canonicalDir).filter((name) => name.endsWith('.json'))) {
      const data = readJson(join(canonicalDir, file));
      if (data) upsert(fromCanonical(data, file));
    }
  }

  const gamesJson = readJson(join(DATA, 'games.json'));
  for (const data of gamesJson?.games || []) upsert(fromGamesJson(data));

  const indie = readJson(join(DATA, 'indie-roguelike-ai-disclosures.json'));
  for (const data of indie?.games || []) upsert(fromIndie(data));

  const human = readJson(join(DATA, 'human-made-game-claims.json'));
  for (const data of human?.games || []) upsert(fromHumanMade(data));

  const community = readJson(join(DATA, 'community-game-submissions.json'));
  for (const data of community?.submissions || []) upsert(fromCommunity(data));

  const nextFest = readJson(join(DATA, 'next-fest-100.json'));
  for (const data of nextFest?.games || []) upsert(fromNextFest100(data));

  const nextFestOctober = readJson(join(DATA, 'next-fest-october-2026.json'));
  for (const data of nextFestOctober?.games || []) upsert(fromNextFestOctober(data));

  const usedSlugs = new Set();
  for (const record of records.values()) {
    const base = record.appId ? `${record.appId}-${slugify(record.name)}` : `unverified-${slugify(record.name)}`;
    let slug = base;
    let counter = 2;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    usedSlugs.add(slug);
    record.slug = slug;
  }

  const all = [];
  for (const record of records.values()) all.push(finalize(record));

  for (const game of all) {
    game.otherGames = all
      .filter((other) => other.slug !== game.slug && other.developer && other.developer === game.developer)
      .slice(0, 4);

    const scored = [];
    for (const other of all) {
      if (other.slug === game.slug) continue;
      let score = 0;
      for (const area of game.areas) {
        if (area.state !== 'used') continue;
        if (other.areas.some((item) => item.key === area.key && item.state === 'used')) score += 2;
      }
      for (const genre of game.genres) if (other.genres.includes(genre)) score += 1;
      if (other.status === game.status) score += 1;
      if (score > 0) scored.push({ game: other, score });
    }
    game.similar = scored.sort((a, b) => b.score - a.score).slice(0, 4).map((item) => item.game);
  }

  cachedAll = all;
  return all;
}

export function getGame(slug) {
  return getAllGames().find((game) => game.slug === slug) || null;
}

export function getGameIndex() {
  return getAllGames().map((game) => ({
    slug: game.slug,
    appId: game.appId,
    name: game.name,
    developer: game.developer,
    status: game.status,
    statusLabel: game.statusLabel,
    statusTone: game.statusTone,
    summary: game.summary,
    releaseDate: game.releaseDate,
    releaseYear: game.releaseYear,
    genres: game.genres,
    event: game.event,
    areaKeys: game.usedAreas.map((area) => area.key),
    areaSummary: game.areaSummary,
    header: game.header,
    steamUrl: game.steamUrl,
    hasStatic: existsSync(join(ROOT, 'games', game.slug, 'index.html')),
  }));
}
