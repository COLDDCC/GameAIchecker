# 首批 10 款游戏收录实施与验收记录

批次：`20261026T175642-213092`。站长验收前不启动第二批。

## 完成范围

- 已实现并安装 gameaichecker-intake；持久队列、单批独占预留、原文缓存、完整披露提取、搜索结果导入、八领域逐项证据绑定、仅新增暂存、阻塞替补与可恢复两阶段发布。
- 停用不安全的旧生成/发布入口；原功能改由新校验工具提供。媒体下载任一失败都会阻塞发布。
- 新增登记保留原先审计、导出、媒体和模板各名单的不同用途；不迁移或重写旧核查。
- 111 个既有 canonical 文件与其结论、领域说明、简介、来源、引用、审核标记均未改变。当前共 121 款。

## 10 个页面

| App ID | 游戏 | 正式页面 |
|---|---|---|
| 4283610 | Witherbound | https://gameaichecker.com/games/4283610-witherbound/ |
| 5271610 | Cyber Sweeper | https://gameaichecker.com/games/5271610-cyber-sweeper/ |
| 4512740 | Teckel Adventure | https://gameaichecker.com/games/4512740-teckel-adventure/ |
| 5203430 | Jirai Kei Nemu | https://gameaichecker.com/games/5203430-jirai-kei-nemu/ |
| 2015220 | ONYX2D | https://gameaichecker.com/games/2015220-onyx2d/ |
| 5117020 | RIPGRAZE | https://gameaichecker.com/games/5117020-ripgraze/ |
| 4951480 | LIGHT IT | https://gameaichecker.com/games/4951480-light-it/ |
| 5418470 | Streamer Manager | https://gameaichecker.com/games/5418470-streamer-manager/ |
| 5300720 | Pop the Balloon | https://gameaichecker.com/games/5300720-pop-the-balloon/ |
| 5051910 | HUG＆BETRAY | https://gameaichecker.com/games/5051910-hug-betray/ |

10 款均有 Steam 官方披露。核对了正式版身份、完整商店原文、英文讨论首页与逐游戏公开检索。讨论的范围限制明确保留，未声称全历史/全语言核查。Teckel Adventure 的 itch.io 声明及 HUG＆BETRAY 的 note 自述单独归因；不升级为独立认证。

## 测试

- `npm ci` 成功；修复后的 `npm run build`、`npm run audit:reviewed` 成功：121 款。
- `node scripts/audit-lists.mjs`：首页、8 个本地化首页、browse、games、indie 与活动列表均通过。
- `GIT_CONFIG_GLOBAL=/dev/null python3 -m unittest discover -s scripts/review/tests -v`：30 项通过。涵盖重复、旧记录保护、缺事实、完整/长披露、未知类型、人工自述、社区指控隔离、年龄/地区墙、截断、帖文错配、源失败、429、并发预留、原子失败、中断、媒体缺失、push 失败、工作流超时、远程前进及已部署重跑。
- sitemap 测试通过；skill 格式验证通过。
- 已复现并修复两次 CI 问题：Astro 打包后登记文件定位；临时 Git fixture 缺少本地作者身份。失败提交不被报告为成功。

## 体积与成本代理指标

- 完整图库：89 张图像、267 个 WebP 变体；图片本体 13,729,748 字节（13.094 MiB）。
- gallery.json：40,399 字节；图库合计 13,770,147 字节（13.132 MiB）。未补传旧游戏媒体。
- 本批持久化捕获 14 个逐游戏检索、39 份 HTTP 响应缓存。这里只统计实际缓存文件，不把缓存数冒充总网络请求数。
- 原始商店/身份/讨论响应 1,633,256 字节；结构化 evidence JSON 87,902 字节；已判断项目的续跑包约 1.5 KiB。
- 平台未暴露模型 token 与费用，未估算 token 数或宣称节省百分比；探索性发现和最初合并搜索不在上述 14 个检索统计内。
- 临时目录中的 1,000/10,000 合成记录：getAllGames 分别约 0.284/29.784 秒，RSS 约 68.5/223.5 MB。队列排序与 JSON 往返约 0.009/0.084 秒。不是完整万级站点构建或产物体积验收；生产吞吐仍待单独优化与实测。

## 提交与部署证据

- 工具：`52b1597`；登记路径修复：`6ee84e1`；证据/适配器：`319d620`。
- 第一阶段数据：`1c34839d56257551da5b2795bb78eb870209f608`。
- 媒体机器人：`fbf8d08`（逐文件验证全部 10 款）；媒体工作流 https://github.com/COLDDCC/GameAIchecker/actions/runs/40304858121 。
- 第二阶段激活：`c2fbaca6d3e1ab084f917a1e3cacc73df234e2a2`；其 Astro CI 因测试 fixture 配置失败，不能作为通过证据。
- 最终修复及已核验发布 SHA：`b9494c9cd532038755e9b782b4f5be78c8c918c0`。
- 最终 SHA 的 Astro build：https://github.com/COLDDCC/GameAIchecker/actions/runs/40305847462 ，成功。
- 最终 SHA 的 Validate game detail build：https://github.com/COLDDCC/GameAIchecker/actions/runs/40305847543 ，成功。
- 同 SHA 的 Cloudflare Pages（main 正式部署，无 Branch Preview 标记）已成功：https://dash.cloudflare.com/?to=/affe4bb6a36f88781689357f3aa65ea0/pages/view/gameaichecker/8a1b1634-ef96-4a79-9243-4ea0e9b3a765 。
- 10 个正式域名页面均已检查标题、canonical、来源和完整披露；267 个图片变体均返回成功的图片响应，HTTP 200 的 HTML 伪图片会被拒绝。
- 图片检查复用两条连接；成功响应按发布 SHA 保存，遇部分失败只补查缺项。
- 批次 phase=deployed，候选状态为 published；重复 resume 不重建记录。当前发布阻塞项：无。首批验收仍待站长确认。

## 已知限制

原始网页缓存不提交 git；丢失缓存时工具必须重新抓取并重新核查，不依靠 hash 假装原文仍可用。万级静态构建产物体积尚未测量；目前不能宣称已支持万级生产构建。首批验收待站长完成。

发布回执提交仅保存工具检查改进、批次状态与报告；不改变 10 款已核验游戏的内容。
