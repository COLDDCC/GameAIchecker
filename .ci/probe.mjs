// TEMPORARY probe: which Steam sources work for the reviewed games?
const ids = ['4576390','4982910','5182120','5004560','4794490','5391500','5323250','2800150','4544110','3519780'];
const ua = { 'user-agent': 'Mozilla/5.0 GameAIChecker build', cookie: 'birthtime=0; lastagecheckage=1-0-1990; mature_content=1; wants_mature_content=1' };
for (const id of ids) {
  const out = [id];
  for (const q of ['&l=schinese&cc=cn', '&l=english&cc=us', '']) {
    try {
      const j = await (await fetch(`https://store.steampowered.com/api/appdetails?appids=${id}${q}`, { headers: ua })).json();
      const d = j?.[id];
      out.push(`api${q || '(none)'}=${d?.success ? `ok shots=${(d.data.screenshots||[]).length}` : 'false'}`);
    } catch (e) { out.push(`api${q}=ERR ${e.message}`); }
  }
  try {
    const r = await fetch(`https://store.steampowered.com/app/${id}/`, { headers: ua, redirect: 'follow' });
    const html = await r.text();
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    const shots = [...html.matchAll(/https:\/\/[^"' ]+\/store_item_assets\/steam\/apps\/\d+\/[^"' ]*ss_[0-9a-f]+[^"' ]*\.jpg/g)].length;
    out.push(`page=${r.status} final=${r.url.replace('https://store.steampowered.com','')} og=${og || 'none'} ssLinks=${shots}`);
  } catch (e) { out.push(`page=ERR ${e.message}`); }
  console.log(`::notice title=probe ${id}::${out.join(' | ')}`);
}
