import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'parse5';
import { parse as parseJS } from 'acorn';
import { getAllGames } from '../src/lib/games.js';
import { languages, locales, homeUrl, gameUrl, localizePage, translate } from '../src/lib/i18n.js';
const attr = (node,name) => node.attrs?.find(a=>a.name===name)?.value;
function all(node, test, found=[]) { if(test(node))found.push(node);for(const child of node.childNodes||[])all(child,test,found);return found; }
const text = node => node.nodeName==='#text'?node.value:(node.childNodes||[]).map(text).join('');
const site = 'https://gameaichecker.com';
const games = getAllGames();
let checked=0;
for(const lang of languages) {
  const paths=[{path:homeUrl(lang),kind:'home'},...games.map(game=>({path:gameUrl(lang,game.slug),kind:'game',game}))];
  for(const {path,kind,game} of paths) {
    const file='dist'+path+'index.html';assert(existsSync(file),file);
    const html=readFileSync(file,'utf8'); const doc=parse(html);
    assert.equal(attr(all(doc,n=>n.tagName==='html')[0],'lang'),locales[lang].tag,file);
    assert.equal(all(doc,n=>n.tagName==='link'&&attr(n,'rel')==='canonical').length,1,file);
    assert.equal(attr(all(doc,n=>n.tagName==='link'&&attr(n,'rel')==='canonical')[0],'href'),site+path,file);
    const alternates=all(doc,n=>n.tagName==='link'&&attr(n,'rel')==='alternate'); assert.equal(alternates.length,9,file);
    for(const code of languages){const link=alternates.find(n=>attr(n,'hreflang')===locales[code].tag);assert.equal(attr(link,'href'),site+(kind==='home'?homeUrl(code):gameUrl(code,game.slug)));}
    assert.equal(all(doc,n=>attr(n,'id')==='language-switcher').length,1,file);
    const selector=all(doc,n=>attr(n,'id')==='language-switcher')[0];assert.equal(all(selector,n=>n.tagName==='option'&&attr(n,'selected')!==undefined).length,1);
    assert(!all(doc,n=>n.tagName==='meta'&&attr(n,'name')==='robots').some(n=>attr(n,'content').includes('noindex')),file);
    // Inline JS is compiled after localization. It must stay valid in every language.
    for(const script of all(doc,n=>n.tagName==='script'&&!attr(n,'src')&&!['application/ld+json','application/json'].includes(attr(n,'type'))))parseJS(text(script),{ecmaVersion:'latest',sourceType:'module'});
    if(kind==='game') {
      assert(html.includes(game.images[0]?.src||'/logo.svg'),file);
      const protectedCopy=all(doc,n=>attr(n,'data-original')!==undefined).map(text).join('\n');
      const baseline=parse(readFileSync(`dist${gameUrl('zh-cn',game.slug)}index.html`,'utf8'));
      const baselineCopy=all(baseline,n=>attr(n,'data-original')!==undefined).map(text).join('\n');
      assert.equal(protectedCopy,baselineCopy,`Modified original material: ${file}`);
      if(game.reviewNote) assert(protectedCopy.includes(game.reviewNote),`Modified notes: ${file}`);
      assert(all(doc,n=>attr(n,'class')?.split(' ').includes('ai-overview')).length,file);
    }
    checked++;
  }
}
// Embedded strings must not escape their script or attribute boundaries.
const fixture='<!doctype html><html lang="en"><head><title>Example</title></head><body><header></header><p data-original="true">搜索 &amp; Source "quote"</p><button>分享</button><script>const a="分享"; const route="/api/feedback";</script></body></html>';
const result=localizePage(fixture,{lang:'fr',kind:'home'});assert(result.includes('搜索 &amp; Source "quote"'));assert(result.includes('/api/feedback'));assert(result.includes(translate('分享','fr')));
const sitemap=readFileSync('dist/sitemap.xml','utf8');assert.equal((sitemap.match(/<loc>/g)||[]).length,(games.length+1)*languages.length);
for(const game of games)for(const lang of languages)assert(sitemap.includes(site+gameUrl(lang,game.slug)));
console.log(`PASS: ${checked} localized pages; canonical/hreflang, language controls, executable scripts, original evidence, media and sitemap.`);
