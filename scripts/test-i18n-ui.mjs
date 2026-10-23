import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { languages, homeUrl, gameUrl, translate } from '../src/lib/i18n.js';
const index=JSON.parse(readFileSync('dist/data/game-index.json','utf8'));
for(const lang of languages) {
  const errors=[];
  const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Not implemented: navigation|Could not load|Not implemented: Window/.test(e.message))errors.push(e.message)});
  const dom=new JSDOM(readFileSync(`dist${homeUrl(lang)}index.html`,'utf8'),{
    url:`https://gameaichecker.com${homeUrl(lang)}?q=Tooth#next-fest`, runScripts:'dangerously',virtualConsole:vc,
    beforeParse(window){
      window.matchMedia=()=>({matches:false,addEventListener(){}});
      window.HTMLElement.prototype.scrollIntoView=()=>{};
      window.scrollTo=()=>{};
      window.fetch=async()=>({ok:true,json:async()=>index});
    }
  });
  await new Promise(resolve=>setTimeout(resolve,30));
  const {document,Event,KeyboardEvent}=dom.window;
  assert.equal(document.querySelector('#language-switcher').value,lang);
  assert.equal(document.querySelector('#q').value,'Tooth');
  const cards=[...document.querySelectorAll('#grid .game')]; assert(cards.length>0,`${lang} query results`);
  assert(cards.every(card=>card.getAttribute('href').startsWith('/games/'+(lang==='zh-cn'?'':lang+'/'))),`${lang} result route`);
  document.querySelector('#clearQ').click();
  assert.equal(new URL(dom.window.location.href).search,'');
  const tabs=[...document.querySelectorAll('#tabs button')];
  tabs.find(t=>t.dataset.filter==='disclosed').click();
  assert(document.querySelectorAll('#grid .game').length>0);
  document.querySelector('#menuBtn').click();assert.equal(document.querySelector('#menuBtn').getAttribute('aria-expanded'),'true');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(document.querySelector('#menuBtn').getAttribute('aria-expanded'),'false');
  assert.equal(errors.length,0,errors.join('\n'));dom.window.close();
  const slug='5012840-tooth-for-tooth';const url=gameUrl(lang,slug);
  const detail=new JSDOM(readFileSync(`dist${url}index.html`,'utf8'),{url:'https://gameaichecker.com'+url,runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.fetch=async()=>({ok:false});}});
  await new Promise(resolve=>setTimeout(resolve,20));
  detail.window.document.querySelector('#saveBtn').click();
  assert.equal(detail.window.document.querySelector('#saveBtn').textContent,translate('★ Saved',lang));
  assert.equal(detail.window.gacI18n.routes.ja,'/games/ja/'+slug+'/');
  assert.equal(errors.length,0,errors.join('\n'));detail.window.close();
}
console.log('PASS: search, result language, saved state, query restoration, filters, menu and keyboard interactions in all eight languages.');
