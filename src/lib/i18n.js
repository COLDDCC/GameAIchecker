export const languages = ['en','zh-cn','ja','zh-tw','de','es','fr','pt-br'];
export const messages = {
'en': {title:'Does this Steam game use AI?',intro:'Search a Steam game to see its disclosed AI use and supporting evidence.',search:'Check game →',placeholder:'Enter a game name, Steam App ID or Steam store URL',notice:'Developer disclosures are labeled. No disclosure does not mean no AI.',queue:'Initial research queue',queueIntro:'Explore game records and follow the evidence.',method:'How the AI involvement scale works'},
'zh-cn': {title:'这款 Steam 游戏使用了 AI 吗？',intro:'搜索 Steam 游戏，查看开发者披露的 AI 使用情况与相关证据。',search:'查询游戏 →',placeholder:'输入游戏名称、Steam App ID 或商店链接',notice:'开发者声明均会标注来源。未披露不代表没有使用 AI。',queue:'游戏资料库',queueIntro:'浏览游戏记录，查看对应证据。',method:'AI 参与程度如何判定'},
'ja': {title:'この Steam ゲームは AI を使用していますか？',intro:'Steam ゲームを検索し、生成 AI の利用申告と根拠資料を確認できます。',search:'ゲームを検索 →',placeholder:'ゲーム名、Steam App ID、ストア URL を入力',notice:'開発元の申告は明示します。申告がないことは AI 不使用の証明ではありません。',queue:'ゲームデータベース',queueIntro:'ゲーム情報と根拠資料を確認できます。',method:'AI 使用度の評価方法'},
'zh-tw': {title:'這款 Steam 遊戲使用了 AI 嗎？',intro:'搜尋 Steam 遊戲，查看開發者揭露的 AI 使用情況與相關證據。',search:'查詢遊戲 →',placeholder:'輸入遊戲名稱、Steam App ID 或商店連結',notice:'開發者聲明均會標註來源。未揭露不代表沒有使用 AI。',queue:'遊戲資料庫',queueIntro:'瀏覽遊戲紀錄，查看對應證據。',method:'AI 參與程度如何判定'},
'de': {title:'Verwendet dieses Steam-Spiel KI?',intro:'Suche nach einem Steam-Spiel und prüfe offengelegte KI-Nutzung und Quellen.',search:'Spiel prüfen →',placeholder:'Spielname, Steam-App-ID oder Shop-URL eingeben',notice:'Entwickleraussagen werden gekennzeichnet. Keine Offenlegung ist kein Beweis für KI-Freiheit.',queue:'Spieldatenbank',queueIntro:'Spieleinträge und Belege ansehen.',method:'So funktioniert die KI-Bewertung'},
'es': {title:'¿Este juego de Steam utiliza IA?',intro:'Busca un juego de Steam y consulta las declaraciones sobre IA y sus fuentes.',search:'Consultar juego →',placeholder:'Nombre del juego, ID de Steam o URL de la tienda',notice:'Se identifican las declaraciones de los desarrolladores. La ausencia de declaración no demuestra que no se use IA.',queue:'Base de datos de juegos',queueIntro:'Explora los juegos y sus pruebas.',method:'Cómo funciona la escala de uso de IA'},
'fr': {title:'Ce jeu Steam utilise-t-il l’IA ?',intro:'Recherchez un jeu Steam et consultez les déclarations sur l’IA et leurs sources.',search:'Rechercher →',placeholder:'Nom du jeu, identifiant Steam ou URL de la boutique',notice:'Les déclarations des développeurs sont identifiées. Une absence de déclaration ne prouve pas l’absence d’IA.',queue:'Base de données des jeux',queueIntro:'Explorez les fiches et les preuves.',method:'Comprendre l’échelle d’utilisation de l’IA'},
'pt-br': {title:'Este jogo da Steam usa IA?',intro:'Pesquise um jogo da Steam e confira declarações sobre uso de IA e suas fontes.',search:'Consultar jogo →',placeholder:'Nome do jogo, ID Steam ou URL da loja',notice:'As declarações dos desenvolvedores são identificadas. A ausência de declaração não comprova ausência de IA.',queue:'Banco de dados de jogos',queueIntro:'Explore jogos e evidências.',method:'Como funciona a escala de uso de IA'}
};
export function localizeHome(html,lang){
 if (lang === 'zh-cn') html = html.replace(/(href=["'])\/games\/(?!zh-cn\/)([^/"']+)\//g, '$1/games/zh-cn/$2/').replace("'/games/' + g.slug", "'/games/zh-cn/' + g.slug");
 const m=messages[lang]||messages.en;
 const base=messages.en;
 let output=html.replace('<html lang="en">',`<html lang="${lang}">`);
 const additional = {
'en': {},
'zh-cn': {'Indie AI':'独立游戏 AI','Browse':'浏览游戏','Next Fest':'新品节','Share Cards':'分享卡片','Methodology':'评估方法','HUMAN-MADE GAMES':'人工制作游戏','Developer-stated':'开发者声明','Not independently audited':'未经独立审计','Steam Next Fest · October 2026':'Steam 新品节 · 2026 年 10 月'},
'ja': {'Indie AI':'インディーゲーム AI','Browse':'ゲーム一覧','Next Fest':'Next Fest','Share Cards':'共有カード','Methodology':'評価方法','HUMAN-MADE GAMES':'人間が制作したゲーム','Developer-stated':'開発元の申告','Not independently audited':'独立監査なし','Steam Next Fest · October 2026':'Steam Next Fest · 2026年10月'},
'de': {'Browse':'Spiele','Methodology':'Methodik','Share Cards':'Teilen'},
'es': {'Browse':'Explorar','Methodology':'Metodología','Share Cards':'Compartir'},
'fr': {'Browse':'Explorer','Methodology':'Méthodologie','Share Cards':'Partager'},
'pt-br': {'Browse':'Explorar','Methodology':'Metodologia','Share Cards':'Compartilhar'},
'zh-tw': {'Indie AI':'獨立遊戲 AI','Browse':'瀏覽遊戲','Next Fest':'新品節','分享卡片':'分享卡片','Share Cards':'分享卡片','Methodology':'評估方法','HUMAN-MADE GAMES':'人工製作遊戲','Developer-stated':'開發者聲明','Not independently audited':'未經獨立審核','Steam Next Fest · October 2026':'Steam 新品節 · 2026 年 10 月'}
};
 const replacements=[[base.title,m.title],[base.intro,m.intro],[base.search,m.search],[base.placeholder,m.placeholder],[base.notice,m.notice],[base.queue,m.queue],[base.queueIntro,m.queueIntro],[base.method,m.method]];
 for(const [from,to] of replacements) output=output.replace(from,to);
 for(const [from,to] of Object.entries(additional[lang]||{})) output=output.replaceAll('>'+from+'<','>'+to+'<');
 const options=languages.map(code=>`<option value="${code}" ${code===lang?'selected':''}>${{'en':'English','zh-cn':'简体中文','ja':'日本語','zh-tw':'繁體中文','de':'Deutsch','es':'Español','fr':'Français','pt-br':'Português (Brasil)'}[code]}</option>`).join('');
 const switcher=`<label style="margin-left:12px"><span class="sr-only">Language</span><select aria-label="Language" id="language-switcher" style="padding:7px;border-radius:8px;border:1px solid #cbd5e1">${options}</select></label>`;
 output=output.replace('</nav></header>',`${switcher}</nav></header>`);
 output=output.replace('</body>',`<script>document.getElementById('language-switcher')?.addEventListener('change',e=>{location.href='/'+e.target.value+'/'+location.hash});<\/script></body>`);
 // Localized routes are still incomplete: prevent search engines indexing partially translated copies.
 output=output.replace('</head>', '<meta name="robots" content="noindex,follow"></head>');
 // Update inherited head tags instead of appending a second canonical.
 const canonical = `https://gameaichecker.com/${lang}/`;
 const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
 const title = `${m.title} | Game AI Checker`;
 output=output.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(title)}</title>`);
 output=output.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`);
 output=output.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`);
 for (const [key, value] of [['description', m.intro], ['og:title', title], ['og:description', m.intro], ['twitter:title', title], ['twitter:description', m.intro]]) {
   const attribute = key.startsWith('og:') ? 'property' : 'name';
   output=output.replace(new RegExp(`<meta ${attribute}="${key}" content="[^"]*">`), `<meta ${attribute}="${key}" content="${escapeAttribute(value)}">`);
 }

 return output;
}
