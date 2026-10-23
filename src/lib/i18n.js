import { parse, parseFragment, serialize } from 'parse5';
import { parse as parseJS } from 'acorn';
import { detailLabels } from './detail-labels.js';
import { locales, rows, extra } from './translations.js';
export { locales };
export const languages = Object.keys(locales);
const site = 'https://gameaichecker.com';
const dictionaries = {};
for (const [index, lang] of languages.entries()) {
  const dict = dictionaries[lang] = new Map();
  for (const row of rows) {
    if (row.length !== languages.length) throw new Error(`Incomplete translation: ${row[0]}`);
    // Canonical English and Chinese UI are accepted as inputs, not translated source prose.
    dict.set(row[0], row[index]);
    dict.set(row[1], row[index]);
  }
  for (const [cn, english] of Object.entries(detailLabels.en)) {
    dict.set(cn, dict.get(english) || detailLabels[lang]?.[cn] || (lang === 'zh-cn' ? cn : english));
    dict.set(english, dict.get(cn));
  }
  for (const [alias, english] of Object.entries(extra)) dict.set(alias, dict.get(english) || english);
  dict.set('开发者公开声称游戏为人工制作；这是开发者声明，未经独立审计。', dict.get('The developer claims human-made production; this is not an independent audit.'));
  dict.set('本站负责人已审查并确认本作为 0 AI；该结论属于本站审核，并非第三方独立认证。', dict.get('Reviewed as 0 AI by the site owner. Review materials are not public; this is not independent certification.'));
  dict.set('认为没有使用 AI', dict.get('I suspect no AI use'));
  dict.set('认为部分使用 AI', dict.get('I suspect some AI use'));
  dict.set('认为大量使用 AI', dict.get('I suspect extensive AI use'));
  dict.set('认为几乎全程使用 AI', dict.get('I suspect AI throughout'));
  dict.set('Steam game name, App ID or store URL', dict.get('Game name, Steam App ID or store URL'));
  dict.set('Search games from the navigation bar', dict.get('Search a game'));
  dict.set('Game AI Checker home', 'Game AI Checker');
  dict.set('游戏标签与游玩功能', dict.get('Game overview'));
  dict.set('人工制作审核状态', dict.get('Human-made claims'));
  dict.set('快速查看', dict.get('Game overview'));
  dict.set('Filter games by AI status', dict.get('All games'));
  dict.set('0 AI · Site review passed', '0 AI · '+dict.get('Site review passed'));
  dict.set('即将推出',dict.get('Coming soon'));
  dict.set('关闭 ×', (dict.get('Close') || 'Close') + ' ×');
  dict.set('文', '文');
  dict.set('官方图片', dict.get('Image {count}').replace('{count}', '').trim());
}
export function translate(text, lang) {
  return dictionaries[lang]?.get(text) ?? text;
}
export function format(key, values, lang) {
  return translate(key, lang).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}
export function homeUrl(lang) { return lang === 'en' ? '/' : `/${lang}/`; }
export function gameUrl(lang, slug) { return lang === 'zh-cn' ? `/games/${slug}/` : `/games/${lang}/${slug}/`; }
export function languageFromPath(path) {
  if (path === '/') return { lang: 'en', kind: 'home' };
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 1 && languages.includes(parts[0])) return { lang: parts[0], kind: 'home' };
  if (parts[0] === 'games' && parts.length === 3 && languages.includes(parts[1])) return { lang: parts[1], kind: 'game', slug: parts[2] };
  if (parts[0] === 'games' && parts.length === 2 && !languages.includes(parts[1])) return { lang: 'zh-cn', kind: 'game', slug: parts[1] };
  return null;
}
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
function setAttr(node, name, value) {
  node.attrs ||= [];
  const a = node.attrs.find(a => a.name === name);
  if (a) a.value = value; else node.attrs.push({ name, value });
}
function appendHtml(node, html) {
  for (const child of parseFragment(html).childNodes) { child.parentNode = node; node.childNodes.push(child); }
}
function walk(node, fn) { fn(node); for (const child of node.childNodes || []) walk(child, fn); }
function setText(node, text) { node.childNodes = [{ nodeName: '#text', value: text, parentNode: node }]; }
function textOf(node) { return node.nodeName === '#text' ? node.value : (node.childNodes || []).map(textOf).join(''); }
function translateText(value, lang) {
  const core = value.trim();
  if (!core) return value;
  const direct = translate(core, lang);
  if (direct !== core) return value.replace(core, direct);
  const patterns = [
    [/^(\d+) 张官方图片$/, '{count} official images'],
    [/^第 (\d+) 张图片$/, 'Image {count}'],
    [/^([\d,.]+) 条评价$/, '{count} reviews'],
    [/^(\d+) 条来源$/, '{count} sources'],
    [/^(\d+) 个链接$/, '{count} links'],
    [/^(\d+\s*\/\s*\d+) 个领域有 AI 使用记录$/, '{count} areas with reported AI use'],
  ];
  for (const [pattern, key] of patterns) {
    const match = core.match(pattern);
    if (match) return value.replace(core, format(key, {count: match[1]}, lang));
  }
  if (/ [\/·] /.test(core)) { const segments=core.split(/( [\/·] )/); const combined=segments.map(s=>translate(s,lang)).join(''); if(combined!==core)return value.replace(core,combined); }
  if (core.endsWith(' ↗')) { const base = core.slice(0,-2); const translated = translate(base,lang); if(translated !== base) return value.replace(core,translated+' ↗'); }
  // Delimited UI phrases alongside a date, counter or game name.
  return value.replace(/开发商待核实|发行年份待核实|类型待核实/g, translate('Pending verification',lang)).replace(/发行商：/g, translate('Publisher',lang)+': ').replace(/核查日期/g, translate('Reviewed on', lang))
    .replace(/AI 使用情况、证据与资料/g, translate('AI use and evidence', lang))
    .replace(/AI 使用情况与证据/g, translate('AI use and evidence', lang))
    .replace(/ 官方图片$/, ` ${translate('官方图片', lang)}`);
}
const scriptCache = new Map();
function translateScript(source, lang) {
  const cacheKey = lang + source;
  if (scriptCache.has(cacheKey)) return scriptCache.get(cacheKey);
  let ast;
  try { ast = parseJS(source, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (error) { throw new Error(`Cannot localize script: ${error.message}`); }
  const edits = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const next = translateText(node.value, lang);
      if (next !== node.value) edits.push([node.start, node.end, JSON.stringify(next).replace(/</g, '\\u003c')]);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  let result = source;
  for (const [start, end, replacement] of edits.sort((a,b) => b[0]-a[0])) result = result.slice(0,start) + replacement + result.slice(end);
  scriptCache.set(cacheKey, result);
  return result;
}
function localizedHref(href, lang) {
  if (!href) return href;
  const [pathname, suffix = ''] = href.split(/(?=[?#])/s, 2);
  if (pathname === '/') return homeUrl(lang) + suffix;
  if (pathname === '/games/' || pathname === '/browse/') return homeUrl(lang) + '#next-fest';
  const route = languageFromPath(pathname);
  if (route?.kind === 'game') return gameUrl(lang, route.slug) + suffix;
  return href;
}
export function localizePage(html, route) {
  const {lang, kind, slug} = route;
  const t = key => translate(key, lang);
  const doc = parse(html);
  let head, body, header;
  const currentUrl = kind === 'home' ? homeUrl(lang) : gameUrl(lang, slug);
  const pathFor = code => kind === 'home' ? homeUrl(code) : gameUrl(code, slug);
  const originalNodes = [];
  function visit(node, original = false) {
    if (node.tagName === 'html') setAttr(node, 'lang', locales[lang].tag);
    if (node.tagName === 'head') head = node;
    if (node.tagName === 'body') body = node;
    if (node.tagName === 'header' && !header) header = node;
    if (attr(node, 'data-original') !== undefined) { original = true; originalNodes.push(node); }
    if (node.nodeName === '#text' && !original) {
      if (!['style','script'].includes(node.parentNode?.tagName)) node.value = translateText(node.value, lang);
    }
    if (attr(node,'data-status-help') !== undefined) { setText(node,t('No mention does not mean no AI. Developer statements are not independent verification.')); return; }
    if (attr(node,'data-area-count') !== undefined) { setText(node,format('{count} areas with reported AI use',{count:attr(node,'data-area-count')},lang) + (attr(node,'data-claim-count') ? ' · '+format('Developer claim covers {count} areas',{count:attr(node,'data-claim-count')},lang) : '')); return; }
    if (attr(node,'data-broad-claim') !== undefined) { const link=node.childNodes.find(n=>n.tagName==='a'); setText(node,format('One developer statement covers {count} areas; this is not separate verification of each area.', {count:attr(node,'data-broad-claim')},lang)+' '); if(link){setText(link,t('View evidence ↗'));node.childNodes.push(link);} return; }
    if (node.tagName === 'script' && !attr(node,'src') && !['application/ld+json','application/json'].includes(attr(node,'type'))) {
      setText(node, translateScript(textOf(node), lang));
      return;
    }
    if (attr(node,'class') === 'ai-overview') setAttr(node,'aria-label', t('AI use and evidence'));
    if (node.tagName === 'summary' && (attr(node.parentNode,'class')||'').includes('area-evidence-detail')) setAttr(node,'aria-label',t('View evidence details'));
    if (!original) for (const a of node.attrs || []) {
      if (['aria-label','title','placeholder','alt'].includes(a.name)) a.value = translateText(a.value, lang);
    }
    if (node.tagName === 'a') {
      const href = attr(node,'href');
      if (href?.startsWith('/')) setAttr(node,'href',localizedHref(href, lang));
      if (href?.startsWith('https://store.steampowered.com/')) {
        const url = new URL(href); url.searchParams.set('l',locales[lang].steam); setAttr(node,'href',url.toString());
      }
      // Secondary editorial tools remain in English until they have translated content.
      if (['/indie-ai/','/share/','/events/steam-next-fest-october-2026/'].includes(href)) {
        setAttr(node, 'hreflang', 'en'); setAttr(node,'title', 'English');
      }
    }
    for (const child of node.childNodes || []) visit(child, original);
  }
  visit(doc);
  // One canonical per language, with the old English homepage and Chinese game URLs retained.
  head.childNodes = head.childNodes.filter(n => !(n.tagName === 'link' && ['canonical','alternate'].includes(attr(n,'rel'))) && !(n.tagName === 'meta' && attr(n,'name') === 'robots'));
  appendHtml(head, `<link rel="canonical" href="${site}${currentUrl}">${languages.map(code=>`<link rel="alternate" hreflang="${locales[code].tag}" href="${site}${pathFor(code)}">`).join('')}<link rel="alternate" hreflang="x-default" href="${site}${pathFor(kind === 'home' ? 'en' : 'zh-cn')}">`);
  const title = kind === 'home' ? `${t('Does this Steam game use AI?')} | Game AI Checker` : textOf(head.childNodes.find(n=>n.tagName==='title'));
  const description = kind === 'home' ? t('Search a game to see what its developer has disclosed about generative AI, and the evidence behind it.') : `${title}. ${t('Source quotes and editorial notes are preserved in their original language.')}`;
  walk(head, node => {
    if (node.tagName === 'title') setText(node, title);
    if (node.tagName === 'meta') {
      const key = attr(node,'property') || attr(node,'name');
      if (['description','og:description','twitter:description'].includes(key)) setAttr(node,'content',description);
      if (['og:title','twitter:title'].includes(key)) setAttr(node,'content',title);
      if (key === 'og:url') setAttr(node,'content',site+currentUrl);
    }
    if (node.tagName === 'script' && attr(node,'type') === 'application/ld+json') {
      const data = JSON.parse(textOf(node));
      if (data['@type'] === 'VideoGame') { data.url = site+currentUrl; data.inLanguage = locales[lang].tag; data.description = description; }
      if (data['@type'] === 'BreadcrumbList') for (const item of data.itemListElement || []) {
        item.item = site + localizedHref(item.item.replace(site,''),lang); item.name = translateText(item.name,lang);
      }
      setText(node, JSON.stringify(data).replace(/</g,'\\u003c'));
    }
  });
  appendHtml(head, `<meta property="og:locale" content="${locales[lang].tag.replace('-','_')}"><style>
  .gac-language{display:flex;align-items:center;gap:6px;font:500 12px/1.3 system-ui;flex-shrink:0;margin-left:auto;color:#475467}.gac-language select{font:inherit;color:inherit;max-width:155px;padding:8px 23px 8px 8px;border:1px solid #dfe5ee;border-radius:9px;background:#fff;min-height:36px}.gac-language select:focus-visible{outline:3px solid #7fb0ff;outline-offset:2px}.gac-original-note{font-size:12px;color:#667085;padding:9px 12px;background:#f8fafc;border:1px solid #e5eaf0;border-radius:9px;margin:12px 0}.top-inner{height:auto;min-height:64px;flex-wrap:wrap;padding-block:10px}.top-nav{align-items:center}.nav-menu{min-width:0}.hero h1{max-width:22ch}.ai-overview-name{overflow-wrap:anywhere}
  @media(max-width:860px){.gac-language{margin-left:0}.menu-btn{order:3}.gac-language{order:2;margin-left:auto}.nav-menu{order:4}}
  @media(max-width:900px){.nav-inner{gap:10px}.gac-language{gap:0}.gac-language>span{display:none}.gac-language select{max-width:128px}.top-nav{width:100%;gap:12px}.brand{font-size:15px}}
  @media(min-width:801px) and (max-width:1100px){.nav-links a{padding:7px;font-size:12px}.nav-cta{display:none}.nav-search{display:none}.nav-inner{gap:10px}.gac-language select{max-width:115px}}
  @media(max-width:440px){.brand{font-size:14px!important}.brand img{width:28px!important}.nav-inner{gap:8px}.gac-language select{max-width:113px;padding-left:5px}.menu-btn{width:36px;height:36px;margin-left:0}.nav .wrap{width:calc(100% - 20px)}.top-inner{gap:8px}.wrap{padding-left:14px;padding-right:14px}}
  </style>`);
  if (header) {
    let target = header;
    walk(header, node => { if (['nav-inner','top-inner'].some(c => (attr(node,'class') || '').split(' ').includes(c))) target = node; });
    appendHtml(target, `<label class="gac-language"><span>${t('Language')}</span><select id="language-switcher" aria-label="${t('Language')}">${languages.map(code=>`<option value="${code}" ${code===lang?'selected':''}>${locales[code].name}</option>`).join('')}</select></label>`);
  }
  if (kind === 'game' && lang !== 'zh-cn') {
    let app;
    walk(body, node => { if (attr(node,'id') === 'app') app = node; });
    if (app) {
      const frag = parseFragment(`<p class="gac-original-note">${t('Source quotes and editorial notes are preserved in their original language.')}</p>`).childNodes[0];
      frag.parentNode = app; const evidenceIndex=app.childNodes.findIndex(n=>attr(n,"id")==="evidence"); app.childNodes.splice(evidenceIndex>=0?evidenceIndex:1,0,frag);
    }
    for (const node of originalNodes) {
      // Quotes may be in either language. Only declare zh-CN when Chinese is present.
      if (/[\u3400-\u9fff]/.test(textOf(node))) setAttr(node,'lang','zh-CN');
      else setAttr(node,'lang','en');
      setAttr(node,'title',t('Original-language material'));
    }
  }
  const config = {
    lang, tag:locales[lang].tag,
    routes:Object.fromEntries(languages.map(code=>[code,pathFor(code)])),
    translations:Object.fromEntries(dictionaries[lang]),
  };
  const runtime = `<script>window.gacI18n=(()=>{const c=${JSON.stringify(config).replace(/</g,'\\u003c')};return {...c,translate:k=>c.translations[k]||k,format:(k,v)=> (c.translations[k==='{count} results'&&v.count===1?'{count} result':k]||k).replace(/\\{(\\w+)\\}/g,(_,n)=>typeof v[n]==='number'?new Intl.NumberFormat(c.tag).format(v[n]):String(v[n]??'')),gameUrl:slug=>c.lang==='zh-cn'?'/games/'+slug+'/':'/games/'+c.lang+'/'+slug+'/'};})();document.addEventListener('DOMContentLoaded',()=>{document.getElementById('language-switcher')?.addEventListener('change',e=>{const path=window.gacI18n.routes[e.target.value];if(path){try{localStorage.setItem('gac:language',e.target.value)}catch{}location.assign(path+location.search+location.hash);}})});</script>`;
  // Runtime must precede the existing scripts, including scripts in the head.
  const runtimeNode = parseFragment(runtime).childNodes[0]; runtimeNode.parentNode=head; const firstScript = head.childNodes.findIndex(n=>n.tagName === "script"); head.childNodes.splice(firstScript >= 0 ? firstScript : head.childNodes.length,0,runtimeNode);
  return serialize(doc);
}
