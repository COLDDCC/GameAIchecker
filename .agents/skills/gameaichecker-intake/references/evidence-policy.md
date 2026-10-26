# Evidence contract

App ID 是身份主键。name/developer/type=game 在商店与 appdetails 一致后才能 verified。每源包含 id/appId/sourceType/url/fetchedAt/httpStatus/language/contentHash/readStatus/quote/locator/cachePath；缓存 hash 必须与实际原始文件一致。完整商店中无披露栏才可 disclosurePresent=false；年龄墙、地区墙、截断均 blocked。

八领域 ingame/code/art/music/voice/writing/translation/marketing；state 为 used/claimed_none/none/not_stated/unreviewed。默认 not_stated。明确非默认判断的 quote 必须是 evidenceId 对应官方 store 或 developer 原文的子串。社区指控只作为 community 来源，不能支持官方领域。运行时生成归 ingame，不自动归 art/writing；明确“游玩时不生成”才可 ingame=none。披露只说素材而类型不明，aiScopeUnspecified=true，全部 not_stated。开发者人工声明只覆盖明说领域，并说明自述、未经独立审计。

evidence.json = {identity,sources,discussion,press}。discussion 保存 pagesScanned/visibleTopics/totalTopics/topics/related/coverageLimits；相关主题必须绑定完整帖 evidenceId，标题身份一致，开发者回复在可见范围内已读。只查首页须公开写清范围。

press = {query,searchedAt,status:"complete",results:[{url,relevant}],readUrls,coverageLimits,cachePath,contentHash}。每游戏单独检索；相关结果必须全文读取并以 press 来源保存。零结果不代表没有 AI。无法获取搜索工具时 press 不 complete。

decision.json 的八领域对象必须全部存在。summary/reviewNote/description 必填；releaseNote 可用自然语言说明过期计划日期。完整披露写 disclosureQuote，不只首句。所有 source 日期是实际读取时间，页面发布日期另行记载。未来跨批次核查须重新抓取；同批有效缓存和已经判定项可复用。

sourceType 可为 store/discussion/thread/press/developer；发布来源分别显示官方披露/Steam/社区/第三方/开发者声明。内部原始响应不发布，公开记录保留披露全文、来源链接、核查日期及讨论/检索范围。
