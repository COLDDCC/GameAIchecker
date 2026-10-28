---
name: gameaichecker-intake
description: 为 COLDDCC/GameAIchecker 低 token 批量收录新 Steam 游戏。用户说“继续收录/增加 N 个（新）游戏”“继续上次批次”或给出 App ID 时，调用持久队列、完整证据校验、暂存生成与可恢复两阶段发布；云端沙箱走 GitHub Actions 抓取中转。
---

# GameAIchecker intake

1. 定位 `COLDDCC/GameAIchecker` 仓库；无工作副本则 clone。只在干净目录 fetch 最新 main；不要重置用户改动。先运行 `python3 scripts/review/intake.py inventory --summary`，再读取当前未完批次 `status --batch ID`。有未完批次优先恢复，不重复占位。首次环境缺工具时读取 `docs/AGENT_HANDOFF.md` 和 `docs/plans/2026-10-26-low-token-game-intake-skill.md`；以后只按需读。
2. 默认优先官方 Steam AI 披露的新正式版；已有 canonical、下线候选、试玩版不充新增。报道、榜单和 SERP 只是线索，不是搜索量：按 `docs/SEARCH_DEMAND_POLICY.md` 先人工核对 GSC 展示或关键词工具月搜索量，写 `[{appId,name,query,kind,metric,value,observedAt,sourceUrl}]` 后运行 `python3 scripts/review/import-demand.py --input FILE`，它保存私有 hash 快照才把候选入队。`discover-import --input FILE` 只用于无度量场景的旧流程。需求快照缺失、被改、为 0 或超 90 天都不入选；`.cache/search-demand` 必须与批次一起保留，换工作区要带原件。队列不足如实补充，单批最多尝试 min(30,3N)，不无限搜索。
3. `start --count N` 返回 batchId；`collect.py --batch ID --pending-only` 抓身份、完整披露、英文讨论首页及相关帖。抓取失败保留状态，不能写成无披露。每个游戏独立检索公开报道，保存原始工具响应在 `.cache/gameaichecker-review/ID/APP/press-search.json`，将 query/searchedAt/status/results/readUrls/coverageLimits/cachePath/contentHash 写入 evidence.press。相关报道须读取全文来源并登记 sourceType=press；无结果只说明检索范围，不能据此证明无 AI。用 `python3 scripts/review/import-search.py --batch ID --app APP --search RAW_RESPONSE --selection REVIEWED_SELECTION` 附加人工确认的结果处置、已读原始来源及范围；它核对真实检索 URL 和缓存后才把 press 设为 complete。
4. 运行 `pack --batch ID --pending-only`。只读当前待判断证据；完整披露不可截断。过长正文按来源逐页读，不把整站 HTML 或历史批次送模型。证据结构见 `references/evidence-policy.md` 和仓库 `scripts/review/intake.py:validate_game`。pack 中已完成项只给 hash。
5. 每游戏写 `.cache/gameaichecker-review/ID/APP/decision.json`，仅允许 identityName/identityDeveloper/category/areas/disclosureQuote/aiScopeUnspecified/summary/reviewNote/description/releaseNote/english；新政策批次必须给 `english:{summary,reviewNote,aiAreaNotes(八领域)}`，全英文、保留范围与自述/未经独立审计等限定，不改原结论、不翻写引文（`npm run check:english` 会校验）。八领域每项 `{state,note?,evidenceId?,quote?}`；非默认值绑定明确官方原文，不按关键词自动定案。校验 `validate --batch ID --stage evidence`，再 `prepare --batch ID --dry-run`，逐条读新简介后正式 prepare。只完整核查才计数；blocked 不公开。候选失败需替补时先保存 reason，运行 `replace-blocked --batch ID --app APP`，保留失败条目并遵守总尝试上限。
6. `validate --batch ID --stage prepublish`，再跑 `npm run check:english`，然后 `bash scripts/review/publish-batch.sh --batch ID --dry-run`。工具实现须先通过 `python3 -m unittest discover -s scripts/review/tests -v`。检查旧记录 hash 与语义未改。Windows 上注意：脚本所有文本读写与子进程输出都固定 `encoding='utf-8'`（系统默认 GBK 会在读 `data/steam/*.json` 时崩），队列锁走 `fcntl`/`msvcrt` 双路；把 `media-queue` 等逐行输出接给 shell 管道时要先 `tr -d '\r'`。
7. 首批 10 游戏已获上线授权，完成后交站长验收；首批验收通过前，不自动开始第二批。以后“继续收录 N 个”含推 main、上线与正式部署检查授权。图库首批完整保存并报告实际 MiB，不自行限制图片数。执行 `publish-batch.sh --batch ID --execute`：阶段一新数据+媒体请求；按精确 SHA 等媒体工作流成功并逐文件核验；阶段二激活强制媒体，检查同 SHA 的 CI 和非 Branch Preview 的 Cloudflare 正式部署，再查每个线上 URL。
8. Git push 无凭证时用 `--execute --connector`，读取返回 packet，通过 GitHub connector create_tree/create_commit/update_ref（expected_sha=parentSha），再 `publish.py --batch ID --adopt-push SHA --push-stage media|site|state`；不得直接绕过树与父提交核验。站点验证后批次停在 `site_verified`，必须再跑一次 `--execute` 让 `record_state()` 把 `deployed` 状态与队列处置提交推上 main，或用 `--push-stage state` 导出包再认领；判断已完成只认 `origin/main` 上的状态内容。失败即保存状态；运行 `resume --batch ID` 核对远程，按 next 恢复。push 非零、媒体缺失、CI/部署缺记录或失败都不能报成功；远程前进先读 diff，显式快进，禁止强推。媒体请求走 `intake.py media-queue --mode strict|legacy`：intake 新游戏全量校验，旧名单保留 allow-legacy 探测，避免未经批准批量重下。不要调用已停用的 make-records.py 或 ship.sh。
9. 中文简短交付：完成数量、每个页面 URL、阻塞项、测试、两阶段 SHA、CI、正式部署、图片实际新增体积、可获取的 token/字符/调用/耗时指标。无法读取平台 token 就明确不可见，不估造节省率。

## 云端沙箱路线（claude.ai 等连不上 Steam/正式站、但能推 GitHub 的环境）

每次新对话的沙箱都是全新的，`.cache/` 不在 git 里，所以按下列顺序走，所有命令都加 `INTAKE_FETCH=actions`：

1. clone 后先 `python3 scripts/review/remote_fetch.py cache-pull`，从 `intake-cache` 分支恢复搜索量快照和未完批次的原始证据（哈希不变）。分支不存在时运行 `remote_fetch.py init`。
2. **找候选**：用 WebSearch 找近期 Steam 新品、新品节、带官方 AI 披露或有 AI 争议的正式版，记下 App ID；排除已有 `data/games/<id>.json`、下线条目和试玩版。按目标数的 2 到 3 倍准备，防止被阻塞或无搜索量。
3. **搜索量**：用已连接的关键词工具（OpenSEO / OpenRush / Semrush 等）逐个查 "<游戏名>"、"<游戏名> ai" 的月搜索量，只用工具真实返回的正数，写成 `kind: keyword_tool`、`metric: monthly_searches`、`sourceUrl` 为该工具报告或工具官网地址、`observedAt` 为查询时间，运行 `import-demand.py`。没有连接任何关键词工具时停下，请用户连接或提供 GSC 导出，不编造搜索量。
4. `intake.py start --count N` → `collect.py --batch ID --pending-only`。collect 会通过 Actions 一次抓完商店页、appdetails、讨论区首页，再一次抓完相关帖（每次往返约 30 秒到 2 分钟）。
5. **报道**：每款游戏单独 WebSearch，把工具原始结果按 `{query, searchedAt, response:{results:[...]}}` 存到 `.cache/gameaichecker-review/ID/APP/press-search.json`；相关文章用 `remote_fetch.py source --batch ID --app APP --type press URL...` 通过 Actions 抓全文原件，补上 `label` 和 `quote`（必须是原文子串）后写进 selection，再跑 `import-search.py`。
6. 判断、`validate`、`prepare`、`check:english`（沙箱跑不了 Astro 构建时，以 CI 为准）、`publish-batch.sh --execute`。线上页面和图片核验也通过 Actions 完成。
7. 每完成一个阶段（入队、采集、报道、prepare、发布）都运行一次 `remote_fetch.py cache-push`，这样中途断开后在新对话里也能 `resume`。

`intake-cache` 分支只放请求、原始响应和私有缓存，不进网站；不要把它合并进 main。

所有已有游戏和站长审核结果只读。内部队列、原文和查询日志不放 data/public。本机访问 GitHub 与线上站点若直连被墙，走 `HTTPS_PROXY=http://127.0.0.1:7897`（`git`、`curl`、`gh` 都要带）。skill 源码保存在项目 `.agents/skills/gameaichecker-intake`；修改后同步安装副本，按环境技能仓库规则提交推送，保持单一逻辑。
