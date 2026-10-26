# GameAIchecker：低 token 批量收录 skill 实施方案

日期：2026-10-26（日本时间）。角色：本文件作者只负责调研与方案；实施交给新 agent。

**目标：让站长说「继续收录 10 个游戏」后，agent 使用持久候选队列、脚本和精简 skill，完成 10 个新 App ID 的证据核查、记录生成、检查及按授权发布；通过增量处理减少重复上下文，为上万游戏规模准备。**

本次只交付方案，不创建或安装 skill、不改网站数据、不执行新游戏核查、不触发收录发布。下文标注「拟新增」的工具和字段都尚不存在，命令是实施后的接口契约，不能当作现有能力。本文的数字是代码快照，不代表已独立验证线上服务。

## 1. 已核实的基线与出处

调研基线：`main@e9c663d75000b53f86aa34d97a0ba251dd51fc3a`。执行前必须重新核对 HEAD 和文档，其他任务可能继续更新仓库。

| 事实 | 可复查出处 / 方法 |
|---|---|
| 111 个 canonical JSON、111 个合并后游戏；展示状态为 no_evidence 74、official_disclosure 29、human_made 8 | `data/games/*.json`；`src/lib/games.js:getAllGames()`，复现命令见下 |
| 原始 category 为 no_verified_genai_evidence 74、official_ai_disclosure 29、developer_no_genai_statement 5、human_made 3 | `data/games/*.json`；注意不能把后两种原始分类与展示状态混为一谈 |
| 审计硬编码名单为 111 个；store-facts 有 65 条非空行，不是全量库 | `scripts/audit-reviewed-games.mjs:const ids`；`scripts/review/store-facts.jsonl` |
| 活跃候选来源中，新品节大表 80 条、小表 13 条、社区 1 条；其每个 steamAppId 都已有 canonical 记录，不能从这些表再取出 10 个新增游戏 | `data/next-fest-100.json:games`、`data/next-fest-october-2026.json:games`、`data/community-game-submissions.json:submissions`，按 App ID 与 `data/games` 做差集 |
| 下线条目共 24 个：20 个 removedEntries、4 个 removedSubmissions，不是已验证的后备队列 | 上述大表及社区表；`docs/AGENT_HANDOFF.md` 第 1、6 节 |
| 图片入库 ID 清单 70 个；磁盘有 83 份 gallery；111 个正式记录中 28 个没有对应 gallery.json | `scripts/persist-media-ids.txt`、`public/images/steam/apps/*/gallery.json`；仅检查存在性，未逐个检查完整性。交接文档写「早期约 40 个」是估数，应以重新扫描为准 |
| 已有生成与发布流程，但不是现成的无人值守收录器 | `scripts/review/make-records.py`、`scripts/review/ship.sh`、`docs/AGENT_HANDOFF.md` 第 3、4 节 |
| Astro 静态构建、Node 22 的 CI、main 上图片机器人写回 | `package.json`、`astro.config.mjs`、`.github/workflows/astro-build.yml`、`validate-games.yml`、`persist-reviewed-media.yml` |
| 元数据抓取没有抽取 AI 披露；成功缓存没有时效失效 | `scripts/fetch-steam-metadata.mjs:fetchOne/isFresh`。不能把 appdetails 成功视作已检查披露栏 |
| 全站合并函数逐游戏计算其他游戏推荐，存在双重全量遍历 | `src/lib/games.js:getAllGames()` 的 otherGames / similar；推断：万级时可能成为瓶颈，尚未做万级实测 |

复查（在仓库根目录；均为只读，不调用生成器）：

```bash
git fetch origin main
git status --short
git rev-parse HEAD
cat docs/AGENT_HANDOFF.md
cat package.json
node --input-type=module - <<'JS'
import {getAllGames} from './src/lib/games.js';
const games = getAllGames();
console.log({count:games.length, states:games.reduce((a,g)=>{
  a[g.status]=(a[g.status]||0)+1; return a;
},{})});
JS
python3 - <<'PY'
import json,pathlib,collections
root=pathlib.Path('.'); files=list(root.glob('data/games/*.json'))
ids={p.stem for p in files}
print('records',len(files),'categories',dict(collections.Counter(json.loads(p.read_text()).get('category') for p in files)))
for f,k in [('next-fest-100.json','games'),('next-fest-october-2026.json','games'),('community-game-submissions.json','submissions')]:
    rows=json.loads((root/'data'/f).read_text())[k]
    print(f,len(rows),'not canonical',sum(str(x.get('steamAppId')) not in ids for x in rows))
print('facts lines',sum(bool(s.strip()) for s in (root/'scripts/review/store-facts.jsonl').read_text().splitlines()))
print('media ids',len((root/'scripts/persist-media-ids.txt').read_text().split()))
print('galleries',len(list(root.glob('public/images/steam/apps/*/gallery.json'))))
print('canonical without gallery',len([i for i in ids if not (root/f'public/images/steam/apps/{i}/gallery.json').exists()]))
PY
```

README 中的「11 个已核查页面」和早期 planned next steps 已落后于代码；优先依据当前源码与上述复查结果，不能照旧 README 制定规模结论。出处：`README.md` 对比审计名单与 `getAllGames()`。

## 2. 范围

### 做什么（实施阶段）

- 创建可安装的 `gameaichecker-intake` skill：中文触发「继续收录 N 个游戏」「继续上次批次」，也支持明确 App ID 列表。skill 负责调度，Python/Node 脚本负责确定性操作，agent 只做证据阅读、分类和必要短摘要。
- 创建非公开候选队列、批次状态、证据收集器、校验器、增量生成与可恢复发布流程。保留现有 JSON 字段、URL 规则和核查标准。
- 第一阶段只做工具与离线验证；工具验证完成且第 9 节选择确定后，才允许另开真实 10 游戏试点。
- 每次完成给站长简短结果：新收录数、三类结论数、阻塞数、10 个 URL、提交与部署状态、token 实测或明确的代理指标。

### 不做什么

- 不修改既有记录、不重写站长批准页面、不恢复 removedEntries / removedSubmissions；不改页面设计、SEO、语言体系或全站结论逻辑。
- 不用关键词或图片观感判断「AI 生成」；不把失败、空响应、摘要缺失当作「无披露」；不批量刷「未发现证据」凑数。
- 不在本阶段导入上万条记录、不将原始 HTML 全部提交 git、不引入付费模型 API、不设置定时任务。这里的自动化是用户发指令触发，不是无人值守日程。
- 不把内部队列、证据缓存、查询日志放在 `data/`。`scripts/prepare-public.mjs` 会复制数据到公开构建目录。

保护集合至少含 App ID `4019220`、`4919570`、`4693000`、`5086350`（Armor Growth Plan）、`4598530`（Otherealm）；并扫描 `verification=site_owner_review_passed`、`humanMadeListing.kind=site_owner_review` 等，动态扩充保护集合。前五个的权限要求见 `docs/AGENT_HANDOFF.md` 第 6 节；ID 见对应 canonical JSON。当前目标是新增，因此所有已有 canonical 记录一律只读，比单列五个更容易执行。

## 3. 推荐架构与文件契约（全部为拟新增设计）

仓库保存工具与可审计的小型状态；安装后的 skill 位于执行环境发现的技能工作区。不要仅在项目里放一个 SKILL.md 就声称已安装。

| 路径 | 责任 |
|---|---|
| `.agents/skills/gameaichecker-intake/SKILL.md` | 可移植 skill 源稿；目标正文不超过约 150 行，只含触发后动作、命令、停机规则、引用 |
| `.agents/skills/gameaichecker-intake/references/evidence-policy.md` | 从交接文档提炼的领域映射、例外、字段约束；避免复制长篇背景 |
| `scripts/review/intake.py` | CLI：inventory / discover-import / start / pack / validate / prepare / status / resume；读取队列索引，不把全库送进模型 |
| `scripts/review/collect.py` | 按单 App ID 获取商店页和讨论列表、识别年龄墙/截断、缓存原文、输出最小证据包；外网不足时明确交给可用搜索/网页工具 |
| `scripts/review/publish-batch.sh` | 分阶段发布、精确检查 commit、Actions 与生产部署；不得复用旧脚本的吞错方式 |
| `scripts/review/state/candidates.jsonl` | 去重后的紧凑候选队列，不含网页原文；含来源、优先级、状态、失败原因 |
| `scripts/review/state/batches/<batchId>.json` | 批次清单、base SHA、阶段、每步产物摘要、重试次数、发布 SHA；只提交经校验的精简状态 |
| `scripts/review/tests/` | 合成或裁剪 fixture 和有意义的状态/证据校验测试；不依赖实时网络 |
| `.cache/gameaichecker-review/` | 忽略于 git：原始响应、解析包、候选搜索结果、暂存记录；进程中断可恢复 |

不得手工维护多份 skill 逻辑。仓库保存源稿后按执行环境的 skill-creator 规则安装、验证及持久化；Work 的技能工作区若为 git 仓库，须按其规范提交和推送。安装位置和可用脚本以执行时 skill-creator 文档为准，待确认；不要照抄其他环境的绝对路径。

核心数据契约：

- candidate：`appId` 字符串、`name`、`sourceUrl`、`discoveredAt`、`priority`、`status`、`batchId`、`reason`。App ID 唯一；名称不能作为身份主键。
- batch：`schemaVersion`、`batchId`、`requestedCount`、`baseSha`、`policyVersion`、`phase`、`games`、`checkResults`、`publishShas`。每款游戏保存 `identity/store/discussion/press` 独立状态（pending/complete/blocked）、`coverageLimits`、证据引用及缓存 hash。
- evidence：`appId`、`sourceType`、`url`、`fetchedAt`、`httpStatus`、`language`、`contentHash`、`readStatus`、`quote`、`locator`。披露 quote 必须完整保留原文；hash 不是公开可访问归档链接，报告须区分。
- press：每款至少一次独立查询；保存 query、检索时间、结果 URL、已读 URL、范围限制。零搜索结果是检索结果，不是没有 AI 的证明。
- 状态机：`queued → reserved → collecting → needs_judgment → ready → prepared → media_pushed → media_ready → site_pushed → deployed`；分支 `blocked/retryable`。每一步先原子落盘再继续；非完整核查不得进入 ready。

候选队列预留用独占锁和原子写，reservation 含 worker/batch ID 与租约；过期租约须显式恢复，不能被第二次「继续」重复抢走。已发布 App ID 永久排除新增队列。任何恢复都先校对远程 SHA，不能仅凭本地 phase 重推。

## 4. 分步实施流程与完成条件

以下命令默认仓库根目录；新增 CLI 在实现前不能运行。GitHub 操作优先使用环境已有的 GitHub connector；`gh api` 是有 gh 且已认证时的替代。不要输出凭证。

### 步骤 0：基线、权限、干净工作区

执行第 1 节复查命令，阅读交接文档、生成/发布脚本、图片工作流、`src/lib/games.js`、`scripts/prepare-public.mjs`。用 `git status --porcelain` 确认干净，创建 `feat/game-intake-skill` 工作分支，保存 base SHA。不自动 rebase 含用户未提交改动的目录。

工具实现前，以只读 Python 遍历所有已有 canonical，存文件 hash；以 `getAllGames()` 导出全站语义快照：App ID、slug、status、areas（含 note/source）、summary、reviewNote、sources、披露引用、人工审核标记。完成条件：当前数字复核、保护集合生成、权限及网络能力清单可用；不要求先联网跑完整站构建。

### 步骤 1：先实现 inventory、候选队列与批次状态

```bash
python3 scripts/review/intake.py inventory --summary
python3 scripts/review/intake.py discover-import --input /tmp/candidates.json --dry-run
python3 scripts/review/intake.py start --count 10 --dry-run
```

新候选来源默认建议为逐游戏检索可确认的 Steam 官方披露游戏，来源选项仍需站长决定（第 9 节）。discover-import 只导入身份候选，不赋 AI 结论；采集器若能取得官方来源列表可批量导入 ID，若接口可用性未验证则使用搜索工具逐项定位。不能假设 Steam 有可用的全量 AI 披露 API。

排序规则固定为 priority 降序、discoveredAt 升序、App ID 数值升序。候选 ID 排除已有记录及下线条目，试玩版单独建候选并标关系；默认只收正式版。默认一次请求最多尝试 30 个候选来获得 10 个完成项，达到上限后如实报告不足，不无限检索。

完成条件：重复导入不增加重复行；已有/保护 ID 不入新增批次；队列不足能明确报告缺口；同一请求恢复使用同一 batchId，不重复占位。

### 步骤 2：实现局部证据收集与最小上下文包

```bash
python3 scripts/review/collect.py --batch <batchId> --pending-only
python3 scripts/review/intake.py pack --batch <batchId> --pending-only
```

collector 获取并缓存原文，记录 URL、响应状态、语言、时间及 hash；确定性抽取身份字段、完整披露区、讨论标题和相关帖链接。**先用含披露、无披露、年龄墙、地区限制、长文截断 fixture 验证解析器**；HTTP 200 仍要检查页面身份和完整性。Steam 的 HTML 选择器及地区/语言响应可靠性待实现时联网确认；失败不能默认为无披露。

每游戏独立检索公开报道。讨论区执行交接文档第 2 节：检查标题，AI/slop/asset flip/美术/画师等相关主题读正文和开发者回复；保留扫描页数、可见主题数及未读原因。不要为节约 token 偷改成「只查披露」。若只查首页，应明确首页范围，不能称全讨论区核查。

初始请求并发建议 2、超时 20 秒、最多 3 次重试，指数退避且尊重 Retry-After；403/年龄墙/身份不符直接阻塞，429 达重试上限后整源暂停。循环要有总时限和可恢复检查点。原始 HTML 不进模型；证据包只输出待判断项、完整披露、相关正文片段及完整性标记。长披露不得为了包长预算截断。

完成条件：有完整证据链或明确 blocked；工具抓取失败时允许换已授权网页工具；缺少可用搜索能力则阻塞报道环节，不能伪造已检索。缓存只复用同批相同 URL/语言的成功响应，跨批新核查重新验证，不能使用永久成功缓存代替当天复核。

### 步骤 3：agent 只做证据判断，严格校验后再生成

agent 对证据包逐游戏填结构化 decision。八领域仅为 `ingame/code/art/music/voice/writing/translation/marketing`。`used/claimed_none/none/not_stated` 的每个非默认状态均绑定原文证据；已有特例允许 unreviewed，不应为使校验通过而强行补结论。

- 官方披露未明确素材类型：`aiScopeUnspecified=true`，八领域 not_stated。
- 实时生成归 ingame；「游玩时不生成」才支持 ingame none。
- 人工制作只标声明覆盖领域，保留「自述、未经独立审计」。
- 玩家指控单列 community 来源，不能变成 official 分类或站长认证。
- 商店/讨论/报道任何一项未完成：不得生成「三项都检查且未发现」总结；本版默认不公开收录不完整记录。
- 披露保存全文并更正生成器默认「原文（首句）」说明；有披露不等于 AI 类型可由关键词直接定案。

```bash
python3 scripts/review/intake.py validate --batch <batchId> --stage evidence
python3 scripts/review/intake.py prepare --batch <batchId> --dry-run
```

改造 `make-records.py` 或提取无副作用生成模块：输出先写 staging，默认新增模式禁止覆盖任何已有 App ID，批次含重复 App ID/缺事实/不完整证据/任意危险 fields 覆盖时直接报错。现有 `fields` 可任意写记录，必须改白名单，不允许覆盖 appId、sources、审核标记。summary 和 reviewNote 用核查完成状态生成，不能继承当前无条件「未见证据」文案。不要随意更新旧 store-facts 的事实。

完成条件：staging 恰好 10 个唯一新记录，语义校验通过，逐条检查简介与原文；没有「。；」「。。」「开发者披露：开发者披露」；不把计划发售日期已过但仍未上架显示为已发售。详情见交接文档第 2、4 节。

### 步骤 4：减少每批代码改动，但保持现有页面行为

将审计、导出、本地化、英文详情紧凑版名单的新增登记封装成单一数据入口，建议拟新增 `scripts/review/state/registered-games.json`，从当前名单迁移并保留各列表的不同用途。**不能简单取所有 canonical ID 替代所有名单**：当前集合和默认值并不相同。

新增注册文件保存 active 与 pendingMedia 状态：阶段一媒体下载可见 pending，阶段二才激活「必须有本地媒体」校验。`persist-reviewed-media.yml` 必须增加注册文件 paths 触发或继续精确更新 persist-media-ids；否则只改注册文件不会触发图片机器人。出处：该工作流 `on.push.paths`。

不要重写两份详情模板。先核对英文与本地化模板的当前行为，保持既有路径与 UI；新增记录走现有模板。共享逻辑若必须调整，比较步骤 0 的全站语义快照，所有旧游戏的审核/证据字段必须一致。

完成条件：新增一批无须正则修改多份源码；原 111 游戏语义不变、旧媒体要求不变；审核名单与紧凑版名单迁移有对照检查。若这一步超出最小试点所需，可先用精确登记工具保留旧名单，先完成后续步骤，再单独迁移；不得让试点无限扩张。

### 步骤 5：实现可恢复的两阶段发布

本步骤只在真实收录已获授权时运行；开发工具本身先推分支，核查逻辑稳定后再做试点。

```bash
python3 scripts/review/intake.py validate --batch <batchId> --stage prepublish
bash scripts/review/publish-batch.sh --batch <batchId> --dry-run
bash scripts/review/publish-batch.sh --batch <batchId> --execute
python3 scripts/review/intake.py resume --batch <batchId>
```

1. 校对干净工作区、远程 base SHA、旧记录 hash、allowlist diff；原子应用 staging。仅对实际存在的旧空壳 URL 加跳转，真正全新的游戏不能编造 unverified 旧 URL。
2. 第一提交精确列出本批新数据文件、索引、媒体 ID 和必要状态；不使用 `git add data` / `git add scripts src` 等大范围暂存。推送失败立即停；远程确认提交已存在才记 media_pushed。
3. 等待**该 SHA 对应的**媒体工作流成功，fetch 机器人提交后逐项验证本批 gallery 及每个 src/thumbnail/full 文件在远程 git 中存在。不能只见到一个 `chore(media)` 就放行；当前媒体脚本允许部分成功、甚至无产物退出 0，出处 `scripts/persist-reviewed-media.sh`。
4. 第二提交激活本批媒体强制要求及登记；精确提交并推送，记录 site_pushed SHA。
5. 查询第二 SHA 的 `Astro build`、`Validate game detail build` 等实际必需检查，要求 completed/success；无记录、超时、失败均不能称通过。使用 GitHub connector 查询，或 `gh api repos/COLDDCC/GameAIchecker/commits/<sha>/check-runs`、`gh api repos/COLDDCC/GameAIchecker/actions/runs?head_sha=<sha>`。
6. 查询同 SHA 的 Cloudflare Pages 正式部署，排除 Branch Preview；再检查本批 10 个线上 URL 的标题、canonical、来源、披露、图片响应，明确线上部署与源码提交是两项状态。

等待循环建议每 20 秒查询、单阶段上限 15 分钟，定期汇报进度；超时保存 phase，resume 从验证开始，禁止重新生成已上线记录。发生远程前进须读取差异后合并，不能强推；图片机器人写回由同一发布串行锁协调。第一阶段失败/半发布不得回滚无关提交或假报完成。

### 步骤 6：skill 安装、验证与首次验收

依据执行环境 skill-creator 文档创建、验证、保存 skill；名字与 description 明确包含项目与中文触发词，指向仓库工具而不是每次复述背景。工具能力发现集中做一次；网页抓取/搜索只是工具适配层，不能把本环境不存在的 WebFetch/gh 当作必备。

完成条件：全新上下文的执行者只获得 skill、仓库与「继续收录 10 个游戏」即知道默认策略；可自动查状态、续跑、报告，不需要站长解释 schema。先用离线 fixture 验收，再在批准后做真实 10 游戏试点。不要因安装了 skill 就声称已验证自动收录。

## 5. token 与万级规模预算

以下均为设计目标，**目前没有 token 基线或节省比例实测，不承诺节省百分比**。

- 每次只读短 SKILL、inventory 摘要、当前 batch 和需要判断的证据包；不重读全库/整份 HTML/完整构建日志；固定 schema 与模板由脚本生成。
- pack 默认每游戏可解释文字预算约 6,000 字符（不含完整官方披露和必要相关原文）；超过时按来源分页加载，不能静默截断。先取标题定位相关内容，再读取正文。
- 已完成项只打印 App ID、phase、hash；模型只处理未判定或变更证据。批次通常 10 个，顺序处理判断；网络低并发即可，不默认用多 agent 重复研究。
- 用同一 10 游戏 fixture 测「旧流程重读文档/生成」与「新流程脚本/pack」：记录模型输入输出 token（平台若可见）、工具返回字符数、模型调用数、搜索数、重试数、耗时。token 不可见就只报这些代理指标，不把字符换算假装精确 token。
- 验收要求：核查覆盖不降低、结果不退化；重复 resume 不重发已完成抓取/搜索/模型判断；同 fixture 的重复上下文字符数至少下降 50% 作为工程目标，未达标继续优化，不把它写成已实现数据。
- 原始 HTML 留有保留期和 hash；批次报告只提交可复核的紧凑事实与来源。丢失原文缓存时重新抓取并重新验证，不能仅凭 hash 断言证据未变。
- 本地生成 1,000/10,000 个**合成记录到临时目录**测队列、pack、校验和 getAllGames 的时间/内存/构建产物体积，不上传伪记录。`getAllGames()` 的两重全库遍历应作为独立性能任务，用索引/预计算候选替换后单独回归；在完成实测前不声称网站已支持万级构建。
- 图片体积也需要预算：本次磁盘目录约 266 MiB（`du -sh public/images/steam/apps`），不是未来每游戏平均成本或批准扩容额度。万级媒体存储与完整静态页面构建成本待实测；不顺带补旧媒体或引入 CDN。

## 6. 质量门槛与执行者逐条自查

以下清单全部核对；有未通过项必须记入报告，不能交付「全部完成」。

- [ ] 当前 HEAD、实际计数、保护集合已刷新；未把旧交接数字当现状。
- [ ] 候选来源与发布方式已确定；App ID、名称、开发商一致；正式版/试玩版分开。
- [ ] 新增模式未修改/覆盖任何已有 canonical；所有旧游戏语义快照一致。
- [ ] 每游戏独立核查商店披露、讨论、公开报道；范围与访问限制写明。
- [ ] 官方披露原文完整、URL 与日期可复查；年龄墙/截断不被判作无披露。
- [ ] 玩家指控与官方来源分离；人工制作声明没有升级为独立认证。
- [ ] 八领域、usedCategories、aiScopeUnspecified 相互一致且逐项有依据。
- [ ] 生成文案与实际核查状态一致；发售状态与标点无误；仅创建必要旧 URL 跳转。
- [ ] 单批请求 10 个即 10 个唯一成功新增；不足如实报告，重复和 blocked 不充数。
- [ ] 队列、证据缓存、凭证、抓取 HTML 没有被复制至 public/data 或打入公开产物。
- [ ] `python3 -m unittest discover -s scripts/review/tests -v` 通过，覆盖下面故障场景。
- [ ] 可用构建环境执行 `npm ci`、`npm run build`；依赖/Steam 网络不可用则记录未通过原因，用 CI 验证，不把未运行当通过。
- [ ] `npm run audit:reviewed` 对最终 dist 通过；它只检查部分结构和媒体，不能代替证据质量校验。
- [ ] 每阶段提交精确且推送已确认；媒体本批完整、第二 SHA 的必需检查与正式部署成功。
- [ ] 线上抽查本批全部 URL；报告提交成功、CI 成功、部署成功分别有证据。
- [ ] 报告附实际 token 或代理指标，未承诺未测的节省率/万级吞吐。

必须测试的故障场景：重复 App ID、已有/保护 ID、缺事实、长披露、AI 类型不明、仅人工制作声明、只有社区指控、无披露完整页、商店年龄墙、帖子正文与标题不符、单源失败、429、进程中断、并发抢批、原子写失败、media 部分成功、push 非零、工作流超时、远程提交前进、重跑已部署批次。验证这些业务不变量，避免只测试实现细节。

## 7. 已知坑与处理

| 坑（现状出处） | 处理 |
|---|---|
| `make-records.py` 直接 write_text 覆盖记录；fields 任意覆盖 | 新增模式拒绝已存在记录；staging、白名单与旧文件 hash 校验 |
| 生成器无条件写「没有披露」「讨论与报道未见证据」、默认原文首句 | 根据已完成证据生成文案；不完整留内部 blocked；完整原文进入正式记录 |
| `ship.sh` 的 push 管道 `|| true` 吞失败，wait_runs 不严查结论 | 新发布器逐 SHA 确认，失败停止；不直接让 skill 调用旧 ship.sh |
| `ship.sh` 全目录 git add、stash/rebase 混合两阶段 | 独立干净分支/工作区，显式文件 allowlist，阶段状态落盘 |
| `persist-reviewed-media.sh` 仅 gallery 存在即跳过，可部分成功 | 发布门校验远程所有引用文件；部分成功保持 media_pushed 等待修复 |
| `fetch-steam-metadata.mjs` 不提取披露，成功缓存永久复用 | 证据独立抓取并标新鲜度；不使用元数据缓存证明当前无披露 |
| `.gitignore` 忽略媒体与 steam metadata | 必要资源由图片工作流精确 force-add，不能凭本地文件存在确认入库 |
| 模板与审计均有硬编码名单、slug 有中文兜底 | 使用共享登记或精确同步；复用 `slugify` 规则，中文兜底 game、HTML & 转义按现有审计 |
| 原队列已全部有 canonical，下线 24 条身份未确认 | 新发现候选；不回收下线条目凑数 |
| 旧游戏可能带特殊展示逻辑，如 `games.js` 对 5345260 的标签 | 不全局重分类、不基于 category 批量覆盖；快照保护特殊页面 |
| 交接文档记载本地 npm/Actions 日志访问困难 | 当前可用性执行时验证；有 connector 用 connector；无构建/部署证据报告待确认 |

## 8. 交付顺序与退出标准

1. 工具/skill 实现分支：离线测试、源稿、最小操作说明与更新后的交接文档；不含真实新游戏，先完成安全与恢复机制。
2. 确定第 9 节选择后，单独试点 10 个真实新 App ID；使用完整核查标准和两阶段部署，记录成本。
3. 第二批「继续收录 10 个」不再重新读全库，证明队列续接与 token 策略有效；无需把本批成果重复研究。
4. 万级性能与媒体方案单独提交测量报告。未通过万级测量不阻塞 10 个批次，但不能直接发起万级灌库。

工具阶段报告应列改动、离线测试与未验证能力；试点阶段报告应列成功数/阻塞数/每游戏 URL/证据范围/成本/两个发布 SHA/CI 与生产状态。失败时保存状态，给出准确的 resume 命令。

## 9. 需要站长拍板的决策点

本文件仅提出选项，**推荐不等于已经获得授权**。工具与离线 fixture 可先做；以下选择影响真实采集或发布时再落实，避免反复确认同一授权。

| 决策 | 推荐与代价 | 其他选项与代价 |
|---|---|---|
| 「继续」默认从哪里选游戏？ | A：优先发现可确认 Steam 官方 AI 披露的新游戏；更容易形成有信息量的页面，但样本偏向有披露游戏，不代表全 Steam 比例 | B：优先热门/新品/站长给定清单，覆盖需求更广，但候选热度来源待选且通常需要更多检索；C：每批手给 10 个 ID，发现成本最低，但站长持续投入 |
| 真实批次完成后怎样发布？ | A：工具通过首批试点后，未来「继续收录 N 个」授权核查并自动推 main/检查正式部署；操作最少，但内容错误会直接上线，需要严格保护和失败门 | B：每批开 PR，站长确认后合并；发布可控，但不完全实现一句话上线。此次方案提交不代表给未来批次永久发布授权 |
| 新增游戏媒体怎样控制体积？ | A：先沿用完整本地图片，首批记录增量 MiB，再定上限；最接近当前页面体验，但有增长成本 | B：封面加最多 4 张图，只限新增游戏，需要小幅改媒体工具与质量验收；C：后续对象存储/CDN，需要账号配置及独立迁移方案 |

推荐固定技术默认值，无需站长逐项选：只收完整核查；不改已有页；没有付费模型；失败留内部队列；请求 10 个最多尝试 30 个；非完整条目不公开；没有可确认来源则如实不足。若站长选择其他策略须在状态中记录 policyVersion。

## 10. 可直接转给执行 agent 的启动指令

> 你负责实施 COLDDCC/GameAIchecker 的批量收录 skill。先读取 `docs/plans/2026-10-26-low-token-game-intake-skill.md` 和 `docs/AGENT_HANDOFF.md`，刷新 main 并验证文档基线；不要凭旧上下文操作。先完成第 4 节工具实现、skill 安装验证和第 6 节离线故障测试，提交独立分支，不要导入真实新游戏、不改任何已有 canonical 或已审核页面。所有标为拟新增的 CLI 都需要你实现，不能当作已存在。复用现有生成/媒体能力，但先修复覆盖、无证据默认文案、push 吞错和部分媒体成功等问题；让模型只读当前批次的精简证据包。第 9 节尚未选定的策略在真实试点前确认一次；已经由站长在本线程选定的直接执行，不重复询问。工具验收通过后，按所选策略做一批 10 游戏真实核查，完整保留来源与披露原文，严格执行可恢复的两阶段发布；没有授权或网络能力则停在准确的阶段并报告。报告给站长看成功数、页面 URL、成本指标、CI 和正式部署证据，不能只报代码已写完。
