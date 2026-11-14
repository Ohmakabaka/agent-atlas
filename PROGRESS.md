# 开发进度

开发分支：`work`；远端：`origin/work`；仓库：https://github.com/Ohmakabaka/agent-atlas 。

| 阶段 | 状态 | 提交 | 主要成果 |
|---|---|---|---|
| 01 初始化 | 已推送 | `62facd6` | Next.js、TypeScript、Tailwind、基础可构建页面 |
| 02 数据库与内容 | 已推送 | `9df94cb` | Prisma/SQLite、标准迁移、幂等seed、公开查询 |
| 03 知识探索 | 已推送 | `02ef475` | 技术地图、专题、文章、搜索筛选、来源与时间线 |
| 04 采集与AI接口 | 已推送 | `20a7b35` | URL/微信/RSS/Atom/GitHub/JSON/CSV、去重、分类建议、可选AI草稿 |
| 05 编辑闭环 | 已推送 | `72f5010` | 登录、内容编辑/审核/发布/归档、来源与关系管理、任务状态 |
| 06 复查修复 | 已推送 | `e49822f` | 来源路径归属、关系证据语义、分页与日期边界 |
| 07 交付验证与文档 | 随本提交推送 | `docs: document and verify the working MVP`（本提交） | 截图、部署与贡献文档、CI、最终验证记录 |

本提交的SHA可用 `git log -1 --format=%h` 查询；最终推送后由主任务核对本地HEAD与远端work完全一致。所有实现均在work分支，未合并main。

## 当前可用能力

P0闭环已完成，可从主题探索进入资料，或在后台收录、修订、审核和发布。无需模型API Key。前台仅读取published资料与已确认关系，机器建议不自动公开。

- 7个主要方向、44个细分主题，合计51个主题。
- 27条公开资料、12个来源、13个机构、12条关系（其中1条待审核建议）。
- 3个完整专题：Agent基础架构、上下文工程、Agent评测。
- 6条结构化工程案例；未知发布日期显示“日期待核实”。
- 数据实体：Topic、Article、Source、Organization、Person、EngineeringCase、Relation、IngestionJob，及多对多和来源链接表。
- 启动与配置：README；数据库和种子：prisma/、data/；截图：docs/screenshots/。

## 实际验证结果

- `npm run db:init`：生成客户端、迁移、seed通过。多次执行无重复、不覆盖编辑；隔离数据库测试另行验证此行为。
- `npm run typecheck`：通过。
- `npm test`：20项通过，0失败、0跳过。包含真实隔离SQLite查询、发布边界、去重、SSRF、来源匹配、会话、AI无Key降级、RSS/Atom解析。
- `npm run build`：通过，生产服务可启动。
- `npm run test:e2e`：生产Chromium通过。覆盖6类公开页面、中文组合过滤、空状态、深浅色持久化、6类手机布局；匿名保护→登录→微信人工导入→草稿隐藏→编辑关联主题→发布→前台与搜索可见→归档隐藏。测试数据自动清理。
- 截图来自实际生产服务，已检查桌面与手机布局；浏览器未捕获运行时错误。
- `.github/workflows/ci.yml`：已配置自动初始化、检查、构建与浏览器验证。远端Actions运行结果未在本次任务读取，不能把本地通过等同远端CI通过。
- `npm run ingest`：实际检查1个OpenAI feed，0导入，因 `getaddrinfo EAI_AGAIN openai.com` 失败（退出码1）。后台保留失败任务；未宣称公网RSS同步成功。

## 已知边界与下一步

- 当前环境的公网DNS/站点策略限制真实RSS与部分页面元数据采集；URL保留链接供人工编辑，批量导入仍可用。部署到具备正常DNS/出口的机器后，应重试配置的feed。
- AI兼容接口、结构校验和无Key降级已实现；未配置真实模型凭证，模型联网生成未验收。
- 部分原始资料域名受访问限制，未逐条现场核对标题、发布日期与原文变化；先按原创导读与公开链接收录，后续继续核验，不补造未知日期或实验效果。
- RSS定时调度需部署方安装cron；未启动隐藏后台定时任务。WeRSS仅保留统一适配器扩展入口，不含公众号登录态采集。
- 搜索为中文子串/关系过滤，没有语义检索；关系支持8种基础类型，独立前置知识关系类型、复杂演进图谱可继续扩展。
- 小团队单实例编辑；登录限流按进程共享10次/10分钟，公网部署应额外保护后台入口。Next.js流式notFound可返回200，但无私有正文并带noindex，测试按内容不可见验证。
- 当前仍用SQLite；PostgreSQL迁移、多人角色、内容版本历史不在本轮MVP内。

下一步优先：在实际部署网络验证RSS与可选模型服务，补充经核对的中文团队工程资料，再按数据量升级搜索与编辑协作。

## 成品化迭代（进行中）

目标：完善可持续运营的编辑、采集、知识探索与部署能力。继续使用work分支逐模块验证、提交、推送，不修改已有编辑数据。

| 模块 | 状态 | 提交 | 验证 |
|---|---|---|---|
| 编辑版本/任务锁基础迁移与相关度搜索 | 已实现，本提交推送 | `feat: add editorial persistence and ranked knowledge search` | 迁移保留已有文章；唯一版本约束；中文相关度/组合过滤/深层主题/安全参数化测试通过 |
| 安全代理采集与调度 | 开发中 | — | 已通过真实GitHub HTTPS/Atom读取 |
| 编辑历史、回滚、主题维护 | 开发中 | — | — |
| 阅读收藏、图谱、SEO | 开发中 | — | — |
| 持久鉴权、备份恢复、容器部署 | 开发中 | — | — |

本轮新增数据库迁移提供Article.version、ArticleRevision、AuditLog、RateLimit、SyncLease和来源同步状态，保留旧内容。

- `91d9777`：成品化基础迁移与相关度搜索已推送。
- 本提交 `feat: persist isolated editor rate limits and authentication audit`：按客户端与全局上限持久限流、代理信任边界、登录审计与密码轮换撤销会话；8项认证/SQLite测试通过。

- `30a2dfc`：持久客户端隔离限流与认证审计已推送。
- 本提交 `feat: ship versioned editorial management and topic curation`：乐观并发、版本差异/回滚到待审核、工程案例与作者编辑、主题CRUD与循环保护、跨主题阅读路径、审计检索、来源同步间隔；8项数据库测试及真实Chromium编辑闭环通过。
