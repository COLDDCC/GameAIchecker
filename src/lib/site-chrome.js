// Shared header, footer and <head> links for list and content pages.
// Used by list-pages.js (legacy HTML templates) and by native Astro pages
// through set:html, so every page carries the same navigation.

const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">';

export const siteHead = () => `${FONT}<link rel="stylesheet" href="/site.css">`;

const NAV = {
  en: {
    home: 'Game AI Checker home',
    skip: 'Skip to content',
    links: [
      ['browse', '/browse/', 'Browse games'],
      ['indie', '/indie-ai/', 'Indie AI', 'opt'],
      ['nextfest', '/events/steam-next-fest-october-2026/', 'Next Fest', 'opt'],
      ['guide', '/guides/how-to-check-steam-game-ai/', 'How to check', 'opt'],
    ],
    lang: ['/games/', '中文', 'zh-CN'],
  },
  zh: {
    home: 'Game AI Checker 首页',
    skip: '跳到正文',
    links: [
      ['browse', '/games/', '全部游戏'],
      ['indie', '/indie-ai/', 'Indie AI', 'opt'],
      ['nextfest', '/events/steam-next-fest-october-2026/', 'Next Fest', 'opt'],
      ['guide', '/guides/how-to-check-steam-game-ai/', '如何核查', 'opt'],
    ],
    lang: ['/browse/', 'English', 'en'],
  },
};

const FOOT = {
  en: {
    text: 'Independent, evidence-led research, not automated accusations. Developer disclosures and claims are self-reports. No disclosure does not mean no AI. Not affiliated with Valve or Steam.',
    links: [['/browse/', 'Browse games'], ['/indie-ai/', 'Indie AI'], ['/events/steam-next-fest-october-2026/', 'Next Fest'], ['/collections/human-made-steam-games/', 'Human-made claims'], ['/guides/how-to-check-steam-game-ai/', 'How to check'], ['/share/', 'Share cards']],
  },
  zh: {
    text: '独立的证据型研究，不做自动化指控。开发者披露与声明均为自我报告；未披露不等于未使用 AI。与 Valve / Steam 无关。',
    links: [['/games/', '全部游戏'], ['/indie-ai/', 'Indie AI'], ['/events/steam-next-fest-october-2026/', 'Next Fest'], ['/guides/how-to-check-steam-game-ai/', '如何核查'], ['/share/', '分享卡片']],
  },
};

export function siteHeader({ current = '', lang = 'en', langSwitch = true } = {}) {
  const t = NAV[lang] || NAV.en;
  const links = t.links.map(([key, href, label, cls]) =>
    `<li${cls ? ` class="${cls}"` : ''}><a href="${href}"${key === current ? ' aria-current="page"' : ''}>${label}</a></li>`).join('');
  const switcher = langSwitch ? `<li class="lang"><a href="${t.lang[0]}" lang="${t.lang[2]}" hreflang="${t.lang[2]}">${t.lang[1]}</a></li>` : '';
  return `<a class="skip" href="#content">${t.skip}</a><header class="site-nav"><div class="wrap site-nav-inner"><a class="brand" href="/" aria-label="${t.home}"><img src="/logo.svg" alt="" width="34" height="27"><span>Game <b>AI</b> Checker</span></a><nav aria-label="${lang === 'zh' ? '主导航' : 'Main'}"><ul class="site-links">${links}${switcher}</ul></nav></div></header>`;
}

export function siteFooter({ lang = 'en', extra = '' } = {}) {
  const t = FOOT[lang] || FOOT.en;
  return `<footer class="site-foot"><div class="wrap site-foot-inner"><p>${extra ? `${extra} ` : ''}${t.text}</p><nav aria-label="${lang === 'zh' ? '页脚' : 'Footer'}">${t.links.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}</nav></div></footer>`;
}

// Replace the markers a template uses. Missing markers are an error so a
// template edit cannot silently drop the navigation.
export function applyChrome(html, options) {
  for (const marker of ['<!--SITE-HEAD-->', '<!--SITE-HEADER-->', '<!--SITE-FOOTER-->']) {
    if (!html.includes(marker)) throw new Error(`Missing site chrome marker: ${marker}`);
  }
  return html
    .replace('<!--SITE-HEAD-->', siteHead())
    .replace('<!--SITE-HEADER-->', siteHeader(options))
    .replace('<!--SITE-FOOTER-->', siteFooter(options));
}
