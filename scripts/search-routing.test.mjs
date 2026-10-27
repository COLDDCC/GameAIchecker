import {test} from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/_middleware.js';
const invoke=url=>onRequest({request:new Request(url),next:()=>new Response('asset or page')});
test('redirects HTTP while retaining path and query',async()=>{const r=await invoke('http://gameaichecker.com/browse/?q=AI');assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://gameaichecker.com/browse/?q=AI');});
test('removes directory URLs without blocking actual images',async()=>{for(const p of ['/images','/images/','/images/steam/','/images/steam/apps/']){const r=await invoke('https://gameaichecker.com'+p);assert.equal(r.status,410);assert.equal(r.headers.get('x-robots-tag'),'noindex');}const r=await invoke('https://gameaichecker.com/images/steam/apps/1/header.webp');assert.equal(await r.text(),'asset or page');});
test('retires every legacy game URL including query variants',async()=>{for(const p of ['/game','/game/','/game/?id=1','/game/unknown/']){const r=await invoke('https://gameaichecker.com'+p);assert.equal(r.status,410);assert.match(r.headers.get('x-robots-tag'),/noindex/);}});
test('assets and JSON remain fetchable with noindex',async()=>{for(const p of ['/images/steam/apps/1/header.webp','/data/games/1.json']){const r=await invoke('https://gameaichecker.com'+p);assert.equal(r.status,200);assert.equal(r.headers.get('x-robots-tag'),'noindex');assert.equal(await r.text(),'asset or page');}});
test('redirects legacy English detail aliases and preserves queries',async()=>{const r=await invoke('https://gameaichecker.com/games/en/1-name/?ref=old');assert.equal(r.status,301);assert.equal(r.headers.get('location'),'https://gameaichecker.com/games/1-name/?ref=old');});
