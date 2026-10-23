import { getAllGames } from '../lib/games.js';
import { languages, locales, homeUrl, gameUrl } from '../lib/i18n.js';
const site = 'https://gameaichecker.com';
const escape = value => value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
export function GET() {
  const groups = [languages.map(lang=>({lang, path:homeUrl(lang)})), ...getAllGames().map(game=>languages.map(lang=>({lang, path:gameUrl(lang,game.slug)})))];
  const xml = groups.flatMap(group => group.map(entry=>`<url><loc>${site}${escape(entry.path)}</loc>${group.map(alternate=>`<xhtml:link rel="alternate" hreflang="${locales[alternate.lang].tag}" href="${site}${escape(alternate.path)}"/>`).join('')}<xhtml:link rel="alternate" hreflang="x-default" href="${site}${escape(group.find(item=>item.lang === (entry.path.includes('/games/') ? 'zh-cn' : 'en')).path)}"/></url>`)).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${xml}</urlset>`,{headers:{'Content-Type':'application/xml; charset=utf-8'}});
}
