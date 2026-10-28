---
name: gameaichecker-intake
description: 为 COLDDCC/GameAIchecker 低 token 批量收录新 Steam 游戏。用户说“继续收录 N 个游戏”“继续上次批次”或给出 App ID 时，调用持久队列、完整证据校验、暂存生成与可恢复两阶段发布。
---

# GameAIchecker intake

1. 定位 `COLDDCC/GameAIchecker` 仓库；无工作副本则 clone。只在干净目录 fetch 最新 main；不要重置用户改动。先运行 `python3 scripts/review/intake.py inventory --summary`，再读取当前未完批次 `status --batch ID`。有未完批次优先恢复，不重复占位。首次环境缺工具时读取 `docs/AGENT_HANDOFF.md` 和 `docs/plans/2026-10-26-low-token-game-intake-skill.md`；以后只按需读。
2. 默认优先官方 Steam AI 披露的新正式版；已有 canonical、下线候选、试玩版不充新增。用搜索适配器发现候选，保存 JSON 数组 `{appId,name,sourceUrl,priority}`；运行 `discover-import --input FILE`。队列不足如实补充，单批最多尝试 min(30,3N)，不无限搜索。
3. `start --count N` 返回 batchId；`collect.py --batch ID --pending-only` 抓身份、完整披露、英文讨论首页及相关帖。抓取失败保留状态，不能写成无披露。每个游戏独立检索公开报道，保存原始工具响应在 `.cache/gameaichecker-review/ID/APP/press-search.json`，将 query/searchedAt/status/results/readUrls/coverageLimits/cachePath/contentHash 写入 evidence.press。相关报道须读取全文来源并登记 sourceType=press；无结果只说明检索范围，不能据此证明无 AI。用 `python3 scripts/review/import-search.py --batch ID --app APP --search RAW_RESPONSE --selection REVIEWED_SELECTION` 附加人工确认的结果处置、已读原始来源及范围；它核对真实检索 URL 和缓存后才把 press 设为 complete。
4. 运行 `pack --batch ID --pending-only`。只读当前待判断证据；完整披露不可截断。过长正文按来源逐页读，不把整站 HTML 或历史批次送模型。证据结构见 `references/evidence-policy.md` 和仓库 `scripts/review/intake.py:validate_game`。pack 中已完成项只给 hash。
5. 每游戏写 `.cache/gameaichecker-review/ID/APP/decision.json`，仅允许 identityName/identityDeveloper/category/areas/disclosureQuote/aiScopeUnspecified/summary/reviewNote/description/releaseNote。八领域每项 `{state,note?,evidenceId?,quote?}`；非默认值绑定明确官方原文，不按关键词自动定案。校验 `validate --batch ID --stage evidence`，再 `prepare --batch ID --dry-run`，逐条读新简介后正式 prepare。只完整核查才计数；blocked 不公开。候选失败需替补时先保存 reason，运行 `replace-blocked --batch ID --app APP`，保留失败条目并遵守总尝试上限。
6. `validate --batch ID --stage prepublish`，再 `bash scripts/review/publish-batch.sh --batch ID --dry-run`。工具实现须先通过 `python3 -m unittest discover -s scripts/review/tests -v`。检查旧记录 hash 与语义未改。Windows 上注意：脚本所有文本读写与子进程输出都固定 `encoding='utf-8'`（系统默认 GBK 会在读 `data/steam/*.json` 时崩），队列锁走 `fcntl`/`msvcrt` 双路；把 `media-queue` 等逐行输出接给 shell 管道时要先 `tr -d '\r'`。
7. 首批 10 游戏已获上线授权，完成后交站长验收；首批验收通过前，不自动开始第二批。以后“继续收录 N 个”含推 main、上线与正式部署检查授权。图库首批完整保存并报告实际 MiB，不自行限制图片数。执行 `publish-batch.sh --batch ID --execute`：阶段一新数据+媒体请求；按精确 SHA 等媒体工作流成功并逐文件核验；阶段二激活强制媒体，检查同 SHA 的 CI 和非 Branch Preview 的 Cloudflare 正式部署，再查每个线上 URL。
8. Git push 无凭证时用 `--execute --connector`，读取返回 packet，通过 GitHub connector create_tree/create_commit/update_ref（expected_sha=parentSha），再 `publish.py --batch ID --adopt-push SHA --push-stage media|site|state`；不得直接绕过树与父提交核验。站点验证后批次停在 `site_verified`，必须再跑一次 `--execute` 让 `record_state()` 把 `deployed` 状态与队列处置提交推上 main，或用 `--push-stage state` 导出包再认领；判断已完成只认 `origin/main` 上的状态内容。失败即保存状态；运行 `resume --batch ID` 核对远程，按 next 恢复。push 非零、媒体缺失、CI/部署缺记录或失败都不能报成功；远程前进先读 diff，显式快进，禁止强推。媒体请求走 `intake.py media-queue --mode strict|legacy`：intake 新游戏全量校验，旧名单保留 allow-legacy 探测，避免未经批准批量重下。不要调用已停用的 make-records.py 或 ship.sh。
9. 中文简短交付：完成数量、每个页面 URL、阻塞项、测试、两阶段 SHA、CI、正式部署、图片实际新增体积、可获取的 token/字符/调用/耗时指标。无法读取平台 token 就明确不可见，不估造节省率。

所有已有游戏和站长审核结果只读。内部队列、原文和查询日志不放 data/public。本机访问 GitHub 与线上站点若直连被墙，走 `HTTPS_PROXY=http://127.0.0.1:7897`（`git`、`curl`、`gh` 都要带）。skill 源码保存在项目 `.agents/skills/gameaichecker-intake`；修改后同步安装副本，按环境技能仓库规则提交推送，保持单一逻辑。
