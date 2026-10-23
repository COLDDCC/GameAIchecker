import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAllGames } from './games.js';
const escape = value => String(value||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function renderHome() {
  const source=readFileSync(resolve('index.html'),'utf8');
  const rank={official_disclosure:0,third_party:1,human_made:1,no_evidence:2,community:3,unreviewed:4};
  const games=getAllGames().slice().sort((a,b)=>(rank[a.status]??4)-(rank[b.status]??4)).slice(0,24);
  const cards=games.map(game=>`<a class="game" href="/games/${escape(game.slug)}/"><div class="game-art">${game.header?`<img src="${escape(game.header)}" alt="" loading="lazy" width="460" height="215">`:''}</div><div class="game-body"><h3>${escape(game.originalName||game.name)}</h3><p class="dev">${escape(game.developer)}</p><div class="meta"><span class="chip">${escape(game.statusLabel)}</span></div></div></a>`).join('');
  return source.replace('<div class="grid" id="grid"></div>',`<div class="grid" id="grid">${cards}</div>`);
}
