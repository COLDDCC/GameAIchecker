export const languages = ['en','zh-cn','ja','zh-tw'];
export const messages = {
'en': {title:'Does this Steam game use AI?',intro:'Search a Steam game to see its disclosed AI use and supporting evidence.',search:'Check game →',placeholder:'Enter a game name, Steam App ID or Steam store URL',notice:'Developer disclosures are labeled. No disclosure does not mean no AI.',queue:'Initial research queue',queueIntro:'Explore game records and follow the evidence.',method:'How the AI involvement scale works'},
'zh-cn': {title:'这款 Steam 游戏使用了 AI 吗？',intro:'搜索 Steam 游戏，查看开发者披露的 AI 使用情况与相关证据。',search:'查询游戏 →',placeholder:'输入游戏名称、Steam App ID 或商店链接',notice:'开发者声明均会标注来源。未披露不代表没有使用 AI。',queue:'游戏资料库',queueIntro:'浏览游戏记录，查看对应证据。',method:'AI 参与程度如何判定'},
'ja': {title:'この Steam ゲームは AI を使用していますか？',intro:'Steam ゲームを検索し、生成 AI の利用申告と根拠資料を確認できます。',search:'ゲームを検索 →',placeholder:'ゲーム名、Steam App ID、ストア URL を入力',notice:'開発元の申告は明示します。申告がないことは AI 不使用の証明ではありません。',queue:'ゲームデータベース',queueIntro:'ゲーム情報と根拠資料を確認できます。',method:'AI 使用度の評価方法'},
'zh-tw': {title:'這款 Steam 遊戲使用了 AI 嗎？',intro:'搜尋 Steam 遊戲，查看開發者揭露的 AI 使用情況與相關證據。',search:'查詢遊戲 →',placeholder:'輸入遊戲名稱、Steam App ID 或商店連結',notice:'開發者聲明均會標註來源。未揭露不代表沒有使用 AI。',queue:'遊戲資料庫',queueIntro:'瀏覽遊戲紀錄，查看對應證據。',method:'AI 參與程度如何判定'}
};
export function localizeHome(html,lang){
 const m=messages[lang]||messages.en;
 const base=messages.en;
 let output=html.replace('<html lang="en">',`<html lang="${lang}">`);
 const replacements=[[base.title,m.title],[base.intro,m.intro],[base.search,m.search],[base.placeholder,m.placeholder],[base.notice,m.notice],[base.queue,m.queue],[base.queueIntro,m.queueIntro],[base.method,m.method]];
 for(const [from,to] of replacements) output=output.replace(from,to);
 const options=languages.map(code=>`<option value="${code}" ${code===lang?'selected':''}>${{'en':'English','zh-cn':'简体中文','ja':'日本語','zh-tw':'繁體中文'}[code]}</option>`).join('');
 const switcher=`<label style="margin-left:12px"><span class="sr-only">Language</span><select aria-label="Language" id="language-switcher" style="padding:7px;border-radius:8px;border:1px solid #cbd5e1">${options}</select></label>`;
 output=output.replace('</nav></header>',`${switcher}</nav></header>`);
 output=output.replace('</body>',`<script>document.getElementById('language-switcher')?.addEventListener('change',e=>{location.href='/'+e.target.value+'/'+location.hash});<\/script></body>`);
 output=output.replace('</head>',`<link rel="canonical" href="https://gameaichecker.com/${lang}/">${languages.map(code=>`<link rel="alternate" hreflang="${code}" href="https://gameaichecker.com/${code}/">`).join('')}<link rel="alternate" hreflang="x-default" href="https://gameaichecker.com/"></head>`);
 return output;
}
