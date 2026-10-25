# Game AI Checker：游戏详情页核查交接方案

更新于 2026-10-25。写给接手维护游戏详情页的 agent。动手前请完整读一遍。

## 1. 当前状态

- 网站共 111 个游戏，每个都有一份正式核查记录 `data/games/<AppID>.json`，并且都在构建审计 `scripts/audit-reviewed-games.mjs` 里。
- 结论分布：未发现可核实证据 74，官方 AI 披露 29，开发者称人工制作 8。
- 已没有 `unverified-*` 空壳页。在 Steam 上找不到对应游戏的 24 个条目已经下线，但没有删除：
  - 它们保存在 `data/next-fest-100.json` 的 `removedEntries`，以及 `data/community-game-submissions.json` 的 `removedSubmissions`。
  - 每条都写了下线日期和原因。
  - 旧地址在 `public/_redirects` 里 301 跳转到首页。
- 部署：推送到 `main` 后由 Cloudflare Pages 自动构建。GitHub 上还有两个检查会跑：`Astro build` 和 `Validate game detail build`。

## 2. 核查标准（每个游戏都要做到，不能省）

1. **身份**：用 Steam App ID 确认是同一款游戏。名字、副标题或开发商对不上的，不收录。
   - 例子：名单上的 “Oniria Dreamscapes” 在 Steam 上只匹配到另一个团队做的 “Oniria”，所以不收录。
   - 正式版和试玩版是两个 App ID，结论不能混用。
2. **Steam 商店页**：读 “AI Generated Content Disclosure” 披露栏，逐字记录原文。长句分段读取，拼成全文；不能凭摘要转述。
3. **讨论区**：看标题，凡是提到 AI、slop、asset flip、美术、画师之类的帖子，都要点开读正文和开发者回复。
4. **公开报道**：每个游戏单独检索一次。几个游戏合在一起搜，结果太杂，不算数。
5. **领域判断**：八个领域是 ingame、code、art、music、voice、writing、translation、marketing。
   - 只标原文明确说到的领域，不推测。
   - 披露只说“部分素材用了 AI”而没说是哪类素材时：设 `"aiScopeUnspecified": true`，八个领域都保持 `not_stated`。实例：Fish With Friends（5393000）。
   - 玩家在游戏里实时生成内容的功能，归到 `ingame`，不归 `art`。实例：inZOI。
   - 披露写“游玩时不生成 AI 内容”，对应 `ingame: none`。
   - 开发者自述“人工制作”，对应 `claimed_none`，并写明“开发者自述，未经独立审计”。
     - 只覆盖声明里明说的领域。例如 Desktop Factory 只说了素材，所以只标 art 和 music。
     - Steam 以外渠道的声明（比如 itch.io 的申报）也可以采用，但要注明出处平台。实例：The Idle Undead、Meow Star Archives。
6. **玩家指控**：作为 `community` 来源记录，不能改变依据官方披露做出的领域判断。正文没能可靠读到的帖子，只记标题。
7. **日期**：商店页标的计划发售日已经过去、游戏却仍未上架时，要用文字说明，比如“商店页标注 2026-09-23，核查时仍未上架”。不要写成纯日期格式，否则页面会显示成已发售。

## 3. 工具（`scripts/review/`）

| 文件 | 作用 |
|---|---|
| `store-facts.jsonl` | 每行记录一个游戏的商店页事实：开发商、发行商、发售日、类型、中文简介、AI 披露（`ai`: `null` / `official` / `human_claim`，以及 `areas`、`notes`、`quote`）、试玩版 ID |
| `make-records.py <batch.json>` | 根据 store-facts 和批次文件生成 `data/games/<id>.json`；给新品节名单补上 App ID；登记进审计、导出、图片本地化、图片入库名单和页面模板 |
| `ship.sh <batch.json> "<标题>" "<正文>"` | 一次跑完整个发布流程，见第 4 节 |
| `fold-legacy.py <名字>` | 把按游戏名命名的老记录并入 `<id>.json`：保留新记录没有的来源和资料，以及和新结论一致的领域说明，然后删除老文件 |
| `example-batch9.json`、`example-batch10.json` | 批次文件示例 |

批次文件里每个游戏的写法：`appId`、`discussion: {label, excerpt}`、`press`，还可以加这些可选字段：

- `extraSources`
- `areas: {key: [state, note]}`
- `summary`、`reviewNote`、`noteReplace`
- `category`、`verification`
- `disclosureQuote`、`disclosureQuoteNote`
- `fields: {...}`：原样写入记录的字段，比如 `aiScopeUnspecified`
- `oldName`：名单上的名字和 Steam 名不一致时用
- `legacy: true`：页面已有正式地址，不需要加跳转

环境变量：
- `FOLD="名字1 名字2"`：顺带合并老记录。
- `EXTRA_IDS="id1 id2"`：只给已核查的游戏登记图片入库和审计，不改内容。
- `COMMIT_TRAILER`：要附在提交说明末尾的署名行。

## 3a. 省 token 的自动采集流程（优先使用）

调研环节不要再用 WebFetch 逐页读 Steam。先在 GitHub Actions 里跑 **Collect review facts**（输入 App ID），它不调用任何 LLM：

1. `collect-facts.mjs`：读 appdetails、英文商店页 HTML（带年龄验证 cookie）、讨论区前 3 页标题。逐字提取 AI 披露原文，标出含 AI / 美术 / 抄袭等关键词的帖子，并给每个游戏分流：
   - `auto_none`：无披露、无人工制作声明、无可疑帖子 → 直接生成模板记录，**0 token**
   - `official`：有披露 → `classify-disclosure.mjs` 用小模型按第 2.5 节规则归类（每个游戏几百 token）
   - `review`：有人工制作声明候选或可疑帖子 → 只需阅读 `review-queue.md` 里列出的那几条
2. `build-batch.mjs`：生成 `store-facts.jsonl` 新行和 `batch-auto.json`，之后照常 `make-records.py` 预演、`ship.sh` 发布。
3. 结果推到 `auto-review/<日期>-<编号>` 分支，不会直接上线。

自动记录带 `reviewMethod: "automated"`，审查备注会写明“未做公开报道检索”。只有 `review` 队列和高关注游戏才需要 agent 做报道检索。
首次使用前，用 `compare=true` 跑一次，把自动分流结果和现有 111 条人工记录对比，确认没有误判再批量用。

## 4. 发布流程（顺序不能乱）

`ship.sh` 按以下顺序执行：

1. 同步 `main`，生成记录，并加上旧 `unverified-*` 地址的 301 跳转。
2. **第一步推送**：只推 `data/`、`public/_redirects` 和 `scripts/persist-media-ids.txt`。
3. 这次推送会触发 `.github/workflows/persist-reviewed-media.yml`。它在 GitHub 服务器上下载 Steam 图片并压缩，再由机器人提交回仓库，提交名为 `chore(media): persist ...`。
4. 等这个机器人提交出现后，**第二步推送**：推审计、导出、本地化脚本的名单和页面模板。从这一步开始，构建会强制检查这些游戏的图片。
5. 等正式站部署结果。注意要看不带 “Branch Preview” 的那条 Cloudflare 记录，带的是分支预览。

为什么必须分两步：如果先强制检查、图片还没入库，构建就要现场去 Steam 下载，一被限流就失败。

第一步推送时，`Validate` 偶尔会失败。原因是早期约 40 个游戏的图片也没入库，构建要现场下载。只要第二步全绿就不影响。

**每批必做的自查**：
- 推送前先预演一次，逐条读生成出来的简介。曾出现过的问题有“。；”“。。”这类标点重复，和“开发者披露：开发者披露……”这类重复。
- 改动 `src/lib/games.js` 前后，对全站所有游戏的结论、领域标记、领域说明、简介、引用和来源做对比；除了预期的变化，不允许有其他差异。

## 5. 已知的坑

- **HTML 转义**：标题里的 `&` 会渲染成 `&amp;`。审计已经同时接受两种写法。
- **中文标题**：中文标题转换后得到的地址是 `<id>-game`。审计的地址转换必须和 `games.js` 一样，有 “game” 兜底，这一点已修好。
- **合并规则**：`games.js` 合并数据时，正式核查记录（优先级 100）对领域判断有最终决定权，旧名单不能叠加领域。只有在记录里完全没写逐项领域时，才会按关键词推断。
- **WebFetch**：
  - 不带游戏名的商店链接（`/app/<id>/`）可能需要用户授权。先用 WebSearch 找到带名字的链接，再去读取。
  - 偶尔会返回另一个帖子的内容（Silent Authority 就出现过）。读到的内容和标题对不上时，不要采用。
  - 带成人内容提示的讨论区读不出来，要写明“检查不完整”。
- **构建环境**：本地连不上 npm 仓库，不能跑 Astro 构建。验证要靠 GitHub 的检查结果和 Cloudflare 的部署结果。
- **Actions 日志**：日志下载地址在这个环境里打不开。失败时，用 `gh api .../check-runs` 和 `/actions/jobs/<id>`（看失败步骤名）判断，或者在本地按审计规则复现检查。

## 6. 待办（按优先级）

1. **Detroit: Become Human（1222140）**：商店页有年龄验证，没能重新确认披露栏，结论沿用 2026-10-23 的核查。可以用能通过年龄验证的浏览器复核，或者通过 SteamDB 交叉确认。
2. **早期约 40 个游戏的图片入库**：做完后构建就完全不依赖 Steam。代价是仓库增加约 140MB，**需要站长同意**。同意后，把这些 ID 追加到 `scripts/persist-media-ids.txt` 并推送即可。
3. **恢复下线条目**：如果以后确认了某个 `removedEntries` / `removedSubmissions` 条目的 App ID，把它移回 `games` / `submissions`，补上 `steamAppId`，删掉对应的跳转，再按第 2 节完整核查一遍。
4. **重复的 Steam 来源**：THE FINALS、inZOI 等页面会出现两条“官方披露”来源，一条商店链接带游戏名，一条不带。可以在 `pushSources` 里按 App ID 去重。改之前同样要对全站做前后对比。
5. **Node 20 弃用警告**：GitHub Actions 里的 `actions/checkout@v4` 和 `setup-node@v4` 有 Node 20 弃用警告，不影响构建，有空时升级。
6. **站长审核过的页面**：Dressmaker（4019220）、Meow Star Archives（4919570）、降雪的日子（4693000）、Armor Growth Plan、Otherealm 带有站长审核标记或人工制作展示标记。改动它们需要先问站长。
