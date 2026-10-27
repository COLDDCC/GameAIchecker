# Game AI Checker：英文搜索流量执行方案

更新于 2026-10-27。写给执行的 agent。动手前请完整读一遍，并同时读 `docs/AGENT_HANDOFF.md`（核查标准和发布流程仍然有效）。

---

## 0. 背景与结论

### 0.1 数据（Google Search Console，2026-10-25 ~ 10-26，过去 24 小时）

- 总计 31 次展示、5 次点击，平均排名约 10。样本很小，只当方向信号用。
- **查询全部是英文**：`how to see if a game uses ai on steam`（排名 6）、`how to tell if a game is ai generated`（9）、`where to see if a game uses ai on steam`（11）、`"the regreening" game`（104）。
- **展示主要来自英语地区**：美国 7、新加坡 5、日本 3、荷兰 2，中国只有 1。
- **5 次点击全部来自首页**（17 次展示）。游戏详情页一共 9 次展示，0 次点击。
- Google 收录了不该收录的地址：`/images/steam/`、`/images/steam/apps/`、`/game/`，以及 `http://gameaichecker.com/`。

### 0.2 根本原因（已在代码里确认）

1. `/games/<slug>/`（`src/pages/games/[slug].astro`）是**中文页**：`<html lang="zh-CN">`，标题是“X AI 使用情况、证据与资料”，canonical 和 hreflang x-default 都指向它。
2. `/games/<lang>/<slug>/`（`src/pages/games/[lang]/[slug].astro`）**全部设了 `noindex`**，英文版也一样（第 127 行）。
3. 英文版只翻译了界面标签（`src/lib/detail-labels.js`）。**正文内容全是中文**：`data/games/<id>.json` 里的 `summary`、`description`、`reviewNote`、`aiAreaNotes`、`sources[].label/excerpt`。此外 `src/lib/games.js` 里的状态名、领域名，以及模板里写死的说明文字也都是中文。
4. 英文首页（`index.html`，`lang="en"`）的卡片都链接到中文详情页。

结果：英文用户搜 “does <game> use AI”，Google 只有中文页可以给，所以 121 页核查内容几乎拿不到英文流量。

### 0.3 竞争定位

SteamDB 已经能按 Steam 官方 AI 披露标签筛选（https://steamdb.info/tag/1368160）。“有没有官方披露”这一项我们赢不了。我们要做出差异的是这些：

- 8 个领域的细分判断；
- 逐字引用的披露原文；
- 讨论区里的玩家指控；
- 开发者“人工制作”声明；
- 每条结论附来源和纠错记录。

所有页面文案都要突出这几点。

### 0.4 目标

1. 每个游戏都有一个**完整英文、可收录**的页面，地址就用现在的 `/games/<slug>/`，保留已被收录的 URL。
2. 中文版移到 `/games/zh-cn/<slug>/`，也可收录。两个版本用 hreflang 互相指向。
3. 清理垃圾收录。
4. 新增针对已出现查询词的英文指南页。
5. 以后收录新游戏时，按“有没有人搜”排优先级。

---

## 1. 总原则（每个 PR 都要遵守）

- **不改变任何核查结论。** 翻译只是转述，不能新增、删减或弱化任何判断。“未提及”不能译成“未使用”，“开发者自述”必须保留成 “developer-stated, not independently audited”。
- **逐字引用保留原文。** `disclosureQuote` 和 Steam 披露原文本来就是英文，不翻译。中文来源的引文保留中文，外加一句英文说明。
- **每个改动都开分支、走 PR。** 不直接推 `main`。CI（`Astro build`、`Validate game detail build`）全绿，并在 Cloudflare Branch Preview 上人工检查过，才可以合并。
- **合并顺序不能乱**：PR-A → PR-B → PR-C → PR-D。PR-E（选题流程）可以并行。**PR-C（切换 URL）必须等 PR-B（英文内容）合并后才能做。** 否则 `/games/<slug>/` 会变成“英文外壳、中文正文”，比现在更糟。
- 提交说明末尾按 `COMMIT_TRAILER` 加署名行。

---

## 2. PR-A：技术清理（小，先做）

分支：`fix/seo-index-hygiene`

### A1. 不让 Google 收录图片目录和数据文件

编辑 `public/_headers`，追加：

```
/images/*
  X-Robots-Tag: noindex
/data/*
  X-Robots-Tag: noindex
/sample/*
  X-Robots-Tag: noindex
/evidence/*
  X-Robots-Tag: noindex
```

- `/images/steam/apps/*` 原有的 `Cache-Control` 规则保留。Cloudflare 会合并多条匹配规则，合并后要在 Preview 上用 `curl -I` 确认两个头都在。
- `/evidence/*` 是否加 noindex，先打开 `evidence/ccr` 看是什么内容再决定。如果是给用户看的证据页，就不加，并在 PR 描述里写清楚。

### A2. 下线旧的 `/game/` 页面

- `game/index.html` 是旧的中文“游戏 AI 档案”页，已被 Google 收录。
- 在 `public/_redirects` 顶部加一行：`/game/ /games/ 301`。
- 删除 `game/` 目录。`[...slug].astro` 会自动发现目录，删掉目录就不再生成这一页。
- 确认 `scripts/sitemap.mjs` 里的排除正则不需要改（`/game/` 已经在排除列表里）。

### A3. `/community/` 页

`community/index.html` 是 `lang="zh-CN"`，其他列表页都是英文。打开看内容：

- 如果是给英文用户看的页面，就翻译成英文。
- 否则加 `<meta name="robots" content="noindex,follow">`。

在 PR 描述里写明选了哪种。

### A4. 需要用户手动做的（agent 做不了，写进 PR 描述提醒）

- Cloudflare → SSL/TLS → Edge Certificates → 打开 **Always Use HTTPS**。
- 确认 `www.gameaichecker.com` 会 301 到 `https://gameaichecker.com/`。如果 www 没有配置，就不用管。

### 验收

- `npm run build` 通过。
- `dist/sitemap.xml` 里没有 `/game/`、`/images/`、`/sample/`。
- 在 Preview 上：`curl -I <preview>/images/steam/apps/<任一id>/header.jpg` 返回 `x-robots-tag: noindex`。

---

## 3. PR-B：给 121 条记录补英文内容（核心工作量）

分支：`feat/en-content`

### B1. 数据结构

在每个 `data/games/<id>.json` 里加一个 `en` 对象。原有中文字段一律不动：

```json
"en": {
  "summary": "...",
  "description": "...",
  "reviewNote": "...",
  "aiAreaNotes": { "ingame": "...", "code": "...", "...": "..." },
  "sources": {
    "<source url>": { "label": "...", "excerpt": "..." }
  },
  "humanMadeListing": { "summary": "..." },
  "translatedAt": "2026-10-27"
}
```

- 来源**按 URL 匹配**，不要按数组下标匹配。原因是 `src/lib/games.js` 的 `pushSources` 会把多个旧数据源合并、去重，下标不稳定。
- 没有 URL 的来源，用它的中文 `label` 原文当 key。
- `aiAreaNotes` 只翻译原记录里有的 key。
- 只有原记录有 `humanMadeListing` 时，才写 `humanMadeListing`。
- 先确认 `humanMadeListing` 的数据从哪里来（`games.js` 里已经有 `labelEn`），以那里的结构为准。

### B2. 翻译规范

- 正文和简介的语气要像英文原创，不能像机翻。句子短，结论放在第一句。
- `en.summary` 是 meta description 的来源，**必须控制在 155 个英文字符以内**，第一句直接回答“这个游戏有没有用 AI”。示例：
  - 官方披露：`The developer discloses generative AI use on Steam for character art and voice lines. Exact scope below, with the original disclosure text.`
  - 未发现证据：`No verifiable generative AI use found: no Steam AI disclosure, and no claims in community discussions or press. Not proof of zero AI use.`
  - 人工制作声明：`The developer states the game is human-made (art and music). This is a developer claim, not an independent audit.`
- 固定术语表（全站统一，不要换着用）：

| 中文 | 英文 |
|---|---|
| 官方披露 | official disclosure |
| 未发现可核实证据 | no verifiable evidence found |
| 开发者称人工制作 / 开发者自述 | developer-stated human-made / developer claim |
| 未经独立审计 | not independently audited |
| 未提及 | not mentioned |
| 玩家指控 | player report (unverified) |
| 第三方整理 | third-party listing, not verified by us |
| 讨论区 | Steam community discussions |
| 商店页 AI 生成内容披露栏 | the store page's "AI Generated Content Disclosure" section |
| 试玩版 / 正式版 | demo / full game |

- 中文里的日期说明（例如“商店页标注 2026-09-23，核查时仍未上架”）要译成完整句子，不要只写日期。
- 写一个脚本 `scripts/review/check-en.mjs`，检查以下几点：
  - 每条记录都有 `en.summary` 和 `en.description`；
  - 原有的每个 `aiAreaNotes` key 都有对应英文；
  - 每个来源都有英文；
  - `en.*` 里没有 CJK 字符（正则 `[㐀-鿿豈-﫿]`），只有引号内的逐字引文可以例外；
  - `en.summary` ≤ 155 字符。
- 分批做，每批 20–30 条。每批跑完 `check-en.mjs` 后，**逐条通读**生成的英文。重点看三类问题：
  - 结论有没有被改变；
  - 有没有 “not mentioned” 被译成 “not used”；
  - 有没有重复句。

### B3. 让构建读到英文内容

在 `src/lib/games.js` 里加一个 `localizeGame(game, lang)`（或类似的函数）：

- `lang === 'en'` 时，把 `summary / description / reviewNote / aiAreaNotes / sources[].label/excerpt` 换成 `en` 里的对应值；
- 把 `STATE_LABELS`、领域名（`AREAS` 里已经有 `en` 字段）、`statusLabel`、`scope` 也换成英文。需要补一份英文的 `STATE_LABELS` 和英文 scope。
- 这一步**只加函数，不改现有页面的行为**。页面切换在 PR-C 里做。
- 在 `npm run audit:reviewed` 里加一项检查：每个已核查游戏都要有完整的 `en` 内容（可以直接调用 `check-en.mjs` 的逻辑）。缺了就构建失败。

### B4. 回归检查

按 `AGENT_HANDOFF.md` 第 4 节的要求：改 `games.js` 前后，对全站所有游戏的中文结论、领域标记、领域说明、简介、引用、来源做对比，**中文输出必须零差异**。

### 验收

- `node scripts/review/check-en.mjs` 对 121 条全部通过。
- 中文输出对比零差异。
- 构建通过。

---

## 4. PR-C：英文成为默认可收录版本（URL 切换）

分支：`feat/en-default-game-pages`，**必须等 PR-B 合并后再开始**。

### C1. 目标 URL 结构

| 地址 | 内容 | 收录 | canonical |
|---|---|---|---|
| `/games/<slug>/` | 英文 | index | 自身 |
| `/games/zh-cn/<slug>/` | 简体中文 | index | 自身 |
| `/games/en/<slug>/` | — | 301 → `/games/<slug>/` | — |
| `/games/{ja,zh-tw,de,es,fr,pt-br}/<slug>/` | 只有界面是对应语言，正文是英文 | **noindex**（维持现状） | 自身 |

hreflang 只列出可收录的版本：

```html
<link rel="alternate" hreflang="en" href="https://gameaichecker.com/games/<slug>/">
<link rel="alternate" hreflang="zh-Hans" href="https://gameaichecker.com/games/zh-cn/<slug>/">
<link rel="alternate" hreflang="x-default" href="https://gameaichecker.com/games/<slug>/">
```

- 两个可收录版本都要带这三行。noindex 的语言版本不放 hreflang。
- 那 6 个 noindex 语言版本的正文，从中文改成英文（`localizeGame(game,'en')`）。这样内容至少和界面语言接近。

### C2. 合并模板

现在 `[slug].astro`（1208 行，中文）和 `[lang]/[slug].astro`（1119 行，多语言）是两份重复的模板。

1. 把 `[lang]/[slug].astro` 的 frontmatter 和标记抽成 `src/components/GameDetail.astro`，props 为 `{ game, lang }`。
2. 把 `[slug].astro` 里有、而 `[lang]` 版里没有的功能逐个搬过去，**特别是 `batchDetailRefresh` 快速查看区块**和它的那串 slug 名单。可以用 `diff` 两个文件逐段核对。搬完后，那串硬编码名单可以改成“对所有已核查游戏都显示”。但如果改了，要在 PR 描述里说明，并截图对比。
3. `src/pages/games/[slug].astro` 改为渲染 `<GameDetail game={game} lang="en" />`。
4. `src/pages/games/[lang]/[slug].astro` 的 `getStaticPaths` 跳过 `en`。
5. 模板里所有写死的中文都要按 `lang` 本地化，包括但不限于：
   - `formatDate`：英文用 `Oct 23, 2026` 格式，`待核实` 改成 `To be verified`；
   - `areaNote()` 的默认说明；
   - `statusExplanation`；
   - 所有 `aria-label`（例如 `主导航`、`面包屑`、`上一张`、`放大查看`）；
   - `section-meta` 的计数文字；
   - 投票区；
   - `quick-review` 文案；
   - 纠错邮件模板（`页面：…需要纠正的内容：…`）；
   - 客户端脚本里的字符串（例如 `继续轮播`、`第 N 张图片`、`观看宣传视频`）。
   - 新增的英文 key 放进 `detail-labels.js`。
6. `<html lang>`：英文页用 `en`，中文页用 `zh-CN`。

### C3. 英文页的 SEO 元素

- `<title>`：`Does {Game} use AI? Disclosure & evidence | Game AI Checker`。如果 `game.name` 太长导致标题超过 65 个字符，就去掉 ` | Game AI Checker`。
- `meta description` / `og:description` / `twitter:description`：用 `en.summary`。
- H1 保持游戏名不变。在 AI 区块的第一个标题改成 `Does {Game} use generative AI?`（H2），紧接着一句直接回答（用 `en.summary` 的第一句），然后才是 8 个领域的表格。
- JSON-LD：`[slug].astro` 里已经有 BreadcrumbList 等结构化数据，所有文字字段改成英文。**不要加 FAQPage**（Google 已经基本不给普通网站显示 FAQ 富结果，加了也没用）。
- 中文页标题沿用现在的：`{Game} AI 使用情况、证据与资料 | Game AI Checker`。

### C4. 跳转和站内链接

- `public/_redirects` 加：`/games/en/:slug/ /games/:slug/ 301`。
  - 现有的 `/games/en/unverified-*` 规则要改成直接指向 `/games/<id-slug>/`，避免两次跳转。
  - 现有 `/games/unverified-*` 的规则不用改，目标已经是 `/games/<slug>/`。
- 搜索所有站内链接 `/games/en/`，全部改成 `/games/`。中文页内的站内链接（面包屑、相关游戏）改成指向 `/games/zh-cn/...`。
- 语言切换器：选 English 跳 `/games/<slug>/`，选简体中文跳 `/games/zh-cn/<slug>/`。
- `src/lib/i18n.js` 里首页的 `noindex` 逻辑不动（本方案不处理首页多语言）。

### C5. 更新审计

修改 `scripts/audit-reviewed-games.mjs`，对每个已核查游戏检查以下几点：

- `dist/games/<slug>/index.html` 和 `dist/games/zh-cn/<slug>/index.html` 都存在；
- 英文页：`<html lang="en">`；没有 `noindex`；canonical 是 `/games/<slug>/`；hreflang 正好是 en、zh-Hans、x-default 三条；
- 英文页的 `<main>` 去掉 `<blockquote>`、`<q>` 和带 `data-source-lang` 的元素后，**没有 CJK 字符**。需要在模板里给逐字引文和用户投稿加上 `data-source-lang`；
- 中文页：`<html lang="zh-CN">`；没有 `noindex`；canonical 指向自身；
- `dist/games/en/` 不存在；
- 原有的检查（图片、标题等）保留，要求的路径相应更新。

`validate-games.yml`、`i18n-build.yml` 里如果有写死的路径，一起改。

### C6. Sitemap

- `scripts/sitemap.mjs` 是根据最终 HTML 自动判断的，原则上不需要改。
- 构建后检查 `dist/sitemap.xml`：英文游戏页 121 条，`/games/zh-cn/` 121 条，再加首页和列表页；没有 `/games/en/` 和其他 noindex 语言。
- 可选：在 sitemap 里给每个 URL 加 `<xhtml:link rel="alternate" hreflang>`。页面 `<head>` 里已经有了，这一步不是必须的。

### 验收

- 构建、审计、CI 全绿。
- 在 Preview 上人工打开 5 个页面，确认英文页上看不到任何中文（逐字引文除外）。这 5 个页面是：
  - 一个官方披露（如 inZOI，`2456740-inzoi`）；
  - 一个人工制作声明（如 `4826820-desktop-factory`）；
  - 一个未发现证据（`3680170-mortuus`）；
  - 一个有玩家指控的；
  - 一个 `aiScopeUnspecified` 的（`5393000-fish-with-friends`）。
- 在 PR 描述里贴这 5 页英文版的截图。
- `curl -I <preview>/games/en/3680170-mortuus/` 返回 301，并跳到 `/games/3680170-mortuus/`。

---

## 5. PR-D：英文指南页（对准已经出现的查询词）

分支：`feat/guides`。可以和 PR-C 并行开发，但要在 PR-C 之后合并，因为指南里要链接到英文游戏页。

### D1. 页面 1（主力）

- 地址：`/guides/how-to-check-if-a-steam-game-uses-ai/`
- 目标查询：`how to see if a game uses ai on steam`、`where to see if a game uses ai on steam`、`does steam show ai games`、`steam ai disclosure`
- `<title>`：`How to Check if a Steam Game Uses AI (2026 Guide) | Game AI Checker`
- 结构：
  1. **一段话直接回答**（放在最前面，40–60 词）：说明 Steam 商店页上有 “AI Generated Content Disclosure” 区块，在哪里能看到，以及没有这个区块代表什么、不代表什么。
  2. **Step by step：在 Steam 商店页找到 AI 披露**（桌面版和手机版各写一遍；配截图，截图要用我们自己拍的 Steam 页面，并标出位置）。
  3. **Steam 的规则是什么**：Valve 从 2024 年 1 月起要求开发者披露预生成和实时生成的 AI 内容。**必须引用 Valve 官方公告原文的链接，并核对日期和措辞**，不能凭记忆写。如果 2026 年规则有变化（例如开发工具类 AI 是否需要披露），以官方最新说明为准，并注明核对日期。
  4. **用 SteamDB 批量筛选**：链接 https://steamdb.info/tag/1368160 ，说明它能做什么、不能做什么（只看官方披露标签）。
  5. **没有披露时，怎么判断**：讨论区里搜 “AI”、看开发者的回复、看美术的一致性问题、看公开报道。强调这些都只是线索，不是证据。
  6. **用 Game AI Checker 查**：嵌入站内搜索框，说明我们比 Steam 披露多了什么（8 个领域、原文引用、玩家报告、人工制作声明）。链接 3–5 个有代表性的游戏页。
  7. **FAQ**（直接用 H3 写成可见的问答，不加 FAQPage 结构化数据）：“Does no disclosure mean no AI?” “Can developers lie in the disclosure?” “Does AI-assisted code count?” 等。
- JSON-LD：`Article`（写明 `datePublished` 和 `dateModified`）和 `BreadcrumbList`。
- 页面底部写明最后核对日期和纠错方式。

### D2. 页面 2

- 地址：`/guides/how-to-tell-if-a-game-is-ai-generated/`
- 目标查询：`how to tell if a game is ai generated`、`signs a game uses ai art`
- 内容：分类列出常见迹象（美术、文本、配音、商店素材、开发规模和发布频率），每条都说明“为什么这不能单独作为证据”。避免写成教人指控开发者。结尾引导到页面 1 和站内搜索。
- 用词一定要谨慎，不能鼓励玩家仅凭感觉公开指控。

### D3. 站内链接

- 首页导航加 `Guides`，或者把 `How we rate` 旁边的位置让给 `How to check`。
- 首页搜索框下面加一行：`New here? How to check if a Steam game uses AI →`。
- 每个英文游戏页的 AI 区块底部加一行，链接到页面 1。
- 两个指南页互相链接。

### D4. 写作要求

- 英文由 agent 起草，事实部分必须给出来源链接。
- 不写没有来源的数字（比如“多少比例的游戏用了 AI”），除非能引用可靠来源。
- 页面末尾加 “Sources” 列表。

### 验收

- 两页都在 sitemap 里，都没有 `noindex`，都有 canonical。
- Lighthouse SEO 分数 ≥ 95（本地跑 `npx lighthouse <preview-url> --only-categories=seo` 即可）。
- 页面 1 里的 Valve 规则描述附有官方链接，核对日期写在页面上。

---

## 6. PR-E：改收录选题流程（文档和工具改动）

分支：`docs/intake-demand-priority`

现在 121 个游戏里有 74 个是“未发现证据”。这类页面很少有人搜，搜到了信息量也不大。新游戏的收录，改成**按需求排序**。

### E1. 选题标准（写进 `docs/AGENT_HANDOFF.md` 新的一节，并同步到低 token 收录流程的文档 `docs/plans/2026-10-26-low-token-game-intake-skill.md`）

候选游戏按以下顺序取，每批至少一半来自前两类：

1. **有 AI 争议、正在被讨论的游戏**：媒体或 Reddit 报道过 AI 美术、AI 配音、披露后补等事件。种子线索（需要逐个核实）：
   - Crimson Desert（报道称发售后才补 AI 披露，导致退款争议：https://www.notebookcheck.net/Crimson-Desert-player-denied-Steam-refund-for-post-release-date-generative-AI-disclosure.1257901.0.html）；
   - Vapor World（AI 过场动画引发 Steam 差评：https://everythingedinburgh.com/games/news/vapor-world-steam-ai-cutscene-backlash/）。
2. **热门新作和即将发售的大作**：Steam 热销榜、愿望单榜前列、当月发售的知名游戏。
3. **Search Console 里已经出现、但站内还没有的游戏名**：例如这次数据里的 “the regreening”。这个游戏已经收录，但排在 104 名，说明页面内容和查询不匹配，要复查它的英文标题和描述。
4. 新品节和独立游戏名单（现有来源）放到最后。

### E2. 需求验证（每个候选都要做，记录在批次文件里）

在批次文件里给每个游戏加 `demand` 字段：

```json
"demand": {
  "signal": "press|reddit|steam_top|gsc_query|trends",
  "evidence": "<链接或说明>",
  "checkedAt": "2026-10-27"
}
```

- 至少要有一个可以核对的信号。没有信号的游戏不进批次。
- 可以用的方法：在 Google 输入 `does <game> use ai`，看自动补全里有没有；Google Trends；Reddit 搜索；Steam 讨论区里 AI 相关帖子的数量。
- `make-records.py` 遇到 `demand` 字段时原样忽略，或者写进记录，以不破坏现有流程为准。如果需要改脚本，在 PR 里说明。

### E3. 收录后的英文要求

PR-B 合并后，`make-records.py` 和 `ship.sh` 必须同时生成 `en` 内容。审计会强制检查这一点。在 `AGENT_HANDOFF.md` 的第 2、4 节加上这一步。

---

## 7. PR-F（可选，PR-C 上线 2 周后再做）：可以拿外链的英文列表页

- 先检查 `/indie-ai/`、`/events/steam-next-fest-october-2026/`、`/browse/` 这些已有的英文列表页：标题和描述是否针对可搜索的短语，是否链接到英文游戏页。
- 考虑新增以下页面（数据都已经有）：
  - `/lists/steam-games-with-ai-disclosure/`：39 个官方披露的游戏，按领域筛选；
  - `/lists/human-made-games/`：开发者自述人工制作的游戏（写清楚“未经审计”）。
- 这一步只做页面，不做推广。推广（Reddit、媒体投稿）由用户决定。

---

## 8. 上线后的检查和衡量（交给用户，agent 在最后一个 PR 的描述里列出来）

1. PR-C 上线当天：在 Search Console 重新提交 `sitemap.xml`。用 URL 检查工具对以下页面“请求编入索引”：首页、2 个指南页、5 个代表性英文游戏页。
2. 上线 2–3 周后，导出**过去 28 天**的数据（不要只导出 24 小时），看以下几点：
   - `/games/<slug>/` 英文页的展示量是否上升；
   - 是否出现 `does <game> use ai` 这类查询；
   - 指南页对 `how to see if a game uses ai on steam` 的排名是否进入前 5；
   - “网页 → 未编入索引”报告里，`/games/en/` 是否显示为“重定向”，`/images/` 是否显示为“被 noindex 排除”。
3. 如果英文游戏页 4 周后展示量仍然很低，下一步应该重点做内容（选题和指南），而不是继续调技术细节。

---

## 9. 不在本方案范围内

- 首页的多语言版本（`/ja/` 等）继续保持 noindex。
- 不做付费推广、外链购买。
- 不改变 0–5 级评分体系和核查标准。
- 不删除任何游戏记录。
