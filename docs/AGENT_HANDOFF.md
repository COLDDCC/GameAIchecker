# Game AI Checker：游戏详情页核查交接方案

更新于 2026-10-26。写给接手维护游戏详情页的 agent。动手前请完整读一遍。

## 1. 当前状态

- 网站共 131 个游戏，每个都有一份正式核查记录 `data/games/<AppID>.json`，并且都在构建审计 `scripts/audit-reviewed-games.mjs` 里。
- 结论分布：未发现可核实证据 80，官方 AI 披露 42，开发者声明未用生成式 AI 6，人工制作声明 3。
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

## 7. 低 token 新游戏收录工具（2026-10-27 实施）

旧 `make-records.py` 与 `ship.sh` 已停止执行，避免覆盖旧记录、缺证据默认结论和吞推送错误。新入口是 `.agents/skills/gameaichecker-intake/SKILL.md`；安装副本按技能工作区规则保存。

- `python3 scripts/review/intake.py inventory --summary`；`discover-import --input FILE`；`start --count 10`。
- `python3 scripts/review/collect.py --batch ID --pending-only`，再逐游戏独立搜索公开报道并保存原始响应、结构化 evidence 和 decision。内部缓存位于 `.cache/gameaichecker-review`，不公开。
- `intake.py validate --batch ID --stage evidence`，`prepare --batch ID --dry-run` 后正式 prepare；不允许覆盖任何已有 canonical。
- `publish-batch.sh --batch ID --dry-run` 后 `--execute`。无 Git 凭证环境使用 `--execute --connector` 导出精确内容，通过 GitHub connector 提交后 `publish.py --batch ID --adopt-push SHA --push-stage media|site|state`；必须匹配父提交及整棵树。随后继续 --execute --connector（见第 10 节的状态提交）。
- `intake.py resume --batch ID` 先核对远程；prepared/applying/media_committed/media_pushed/media_ready/site_applying/site_committed/site_pushed/deployed 均持久化。两次提交中断都按计划 hash 恢复。不能强推或自动丢弃其他改动。
- blocked 候选保留原因后用 `replace-blocked --batch ID --app APP` 替补，最多 min(30,3N) 次尝试。
- `python3 -m unittest discover -s scripts/review/tests -v` 为离线故障测试；`tests/benchmark.py` 仅输出合成上下文和队列代理指标，不是模型 token 或正式万级构建能力。

新增游戏只登记 `state/registered-games.json`：pendingMedia 阶段请求媒体；active 阶段加入审计、导出、完整媒体与英文紧凑详情。旧名单不迁移，保留其原先不同集合。完整图库校验覆盖元数据中每个 header/background/screenshot URL 和本地每个变体；媒体脚本任一项失败都非零退出。

## 8. 2026-10-27 站长授权与英文发布门槛

- 站长已接受首批并要求继续收录；之后内部核查通过即提交 main、部署和正式站检查，无需站长看代码。验收对象是正式网页。
- 选题优先当前热门、新品节及有明确 AI 争议的游戏。官方披露仍是重要证据优先级，但不以冷门披露游戏凑数。每批默认 10 个；严格区分正式版与 demo。
- 本轮新选题按站长最新六 PR 方案先验证搜索需求；未有数据时，活动榜单、开发者公告及报道保留为待验证线索，不编造搜索量。24 小时小样本不能证明趋势或保证排名前三。
- PR-C 已将 `/games/<slug>/` 统一为可索引英文默认页，中文位于 `/games/zh-cn/<slug>/`，两者 self-canonical 并互相标注 hreflang，x-default 指英文。旧 `/games/en/<slug>/` 301 到默认英文页。其他未完整翻译的副本继续 noindex，不批量解除。
- 后续每个新 canonical 必须同时完成 `data/i18n/games.en.json` 的 summary、reviewNote 和八领域说明，并以 `src/lib/english.js:editorialDigest` 绑定当前原始记录。翻译保留来源、范围和自述/未经独立审计等限定，不改变原始结论；原始引文不翻写。先运行 `npm run check:english`，缺失、中文残留或源记录变化均阻止发布。仅有中文 canonical 不能算完成一条新收录。
- 英文指南：`/guides/how-to-check-steam-game-ai/`；披露列表：`/events/steam-next-fest-october-2026-ai-disclosures/`；人工制作声明：`/collections/human-made-steam-games/`。列表只覆盖已审查记录，不是全量普查或独立认证。
- 当前 `/game` 旧入口与目录端点由边缘中间件退役，images/data 仍可读取并返回 noindex；不要通过 robots.txt 屏蔽爬取后再期待搜索引擎读取 noindex。
- 未连接 GSC / Cloudflare 账户设置接口；不能声称已在 GSC 重新提交或打开了控制台的 Always Use HTTPS。HTTP→HTTPS 目前由边缘中间件执行，并须以真实线上响应验证。

## 9. 英文默认页与搜索需求优先（2026-10-27）

- 英文默认地址 `/games/<slug>/`，中文 `/games/zh-cn/<slug>/`；旧 `/games/en/` 永久跳转。详情共用 `src/components/GameDetail.astro`。
- 旧记录英文摘要在 `data/i18n/games.en.json`，构建前 `npm run check:english` 检查完整度及来源 hash。更新来源后必须复核英文，不能只更新 hash。
- **新批次先验证搜索需求**，以 `docs/SEARCH_DEMAND_POLICY.md` 的输入契约和 `scripts/review/import-demand.py` 为准。没有有效需求依据的 queued 条目不会被 `start` 或替补选中；已占位批次继续恢复。
- 新批次 decision 允许并要求 `english` 字段（摘要、核查限制、八领域说明），按政策文件的结构写入。原有披露、来源绑定及两阶段发布检查仍全部执行。已安装 skill 的旧字段列表需结合此处的新工具契约使用。
- 本次仅添加英文呈现字段与种子线索，已有来源、分类、领域状态、站长审核标记均保留。

## 10. 断点续跑与媒体闸门修复（2026-10-28）

- 批次状态与候选队列入 Git：`state/batches/*.json`、`state/candidates.jsonl` 随发布提交。站点校验通过后批次停在 `site_verified`，再由 `publish.py` 的 `record_state()` 把 `deployed` 状态提交并推送；无 Git 凭证时用 `--push-stage state` 导出包，再 `--adopt-push SHA --push-stage state` 认领。是否已完成只以 `origin/main` 上的状态内容为准（`state_on_remote`），本地文件自称 deployed 但远端看不到时会继续补推，避免新 clone 把已发布批次当未完成、resume 后又因 canonical 已存在而失败。
- 媒体请求拆成两个集合：`intake.py media-queue --mode strict` 只列 intake 登记的游戏并做完整逐文件校验，`--mode legacy` 列旧名单游戏并保留 allow-legacy 探测。`scripts/persist-reviewed-media.sh` 分别处理，因此新增批次部分下载失败必然非零退出，同时不会未经站长同意批量重下旧图库。工作流触发路径已加入 `registered-games.json` 与 `intake.py`。
- Windows 适配：队列锁按 `fcntl`（类 Unix）/`msvcrt`（Windows）双路；所有文本读写与 `subprocess(text=True)` 固定 `encoding='utf-8'`（抓取页面另加 `errors='replace'`），否则系统 GBK 默认编码在读 `data/steam/*.json` 时崩溃。`python3 -m unittest discover -s scripts/review/tests` 两平台均应全绿。
- 选题与英文门槛以第 8、9 节为准：`start`/替补只选已通过搜索需求校验的候选，decision 需要 `english` 字段；两者与本节的状态提交、媒体闸门同时生效。

## 10. 云端沙箱抓取中转（2026-10-28）

- claude.ai 云端沙箱能推 GitHub，但连不上 Steam、报道网站和 gameaichecker.com。设 `INTAKE_FETCH=actions` 后，`collect.py`、`publish.py` 的线上核验和 `remote_fetch.py source` 都改为：把 URL 列表推到 `intake-cache` 分支，由该分支上的 `Intake fetch relay` 工作流在 GitHub 服务器上抓取，再把原始响应（带 SHA-256）提交回来。证据校验规则完全不变。
- 每次新对话的沙箱是全新的。开始先 `remote_fetch.py cache-pull`，每个阶段后 `cache-push`，把 `.cache/search-demand` 和 `.cache/gameaichecker-review` 原件同步到 `intake-cache:cache/`。
- 不设该变量时仍走本地 curl，本机（Windows 代理）流程不受影响。
- `intake-cache` 是公开仓库里的独立分支，存放 Steam 页面等原始响应；不进网站，不要合并进 main。若 Cloudflare Pages 对所有分支建预览，可在 Pages 设置里把该分支排除。
