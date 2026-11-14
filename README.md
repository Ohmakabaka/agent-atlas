# Agent Atlas · Agent 技术图谱

**以问题为起点，连接 AI Agent 的原始研究、中文解读与工程实践。**

Agent Atlas 是面向中文 AI 工程师的开源知识库。首页以技术主题组织资料，主题页提供阅读路径，文章页保留原始标题、出处和独立中文导读。编辑可以收录链接、校订内容与知识关系，再审核发布。

![Agent Atlas 技术地图首页](docs/screenshots/home.png)

截图与复现页面说明见 [界面说明](docs/screenshots/README.md)。

## 已实现的 MVP

- 技术地图：7 个主要方向、44 个细分主题；3 个编辑阅读专题。
- 初始资料：27 条真实公开资料记录，覆盖论文、官方文章、文档、开源项目与中文资料；保留来源链接。
- 知识探索：主题与文章详情、组合筛选、中文关键词搜索、来源目录和发布时间线。
- 编辑闭环：密码登录、URL/公众号链接收录、JSON/CSV 批量导入、编辑导读与标签、审核发布、归档。
- 知识关联：文章和主题间的八种关系；机器建议和人工确认分开，仅公开已确认且关联内容已发布的关系。
- 采集：统一适配器接口、RSS/Atom 同步、GitHub 仓库网页元数据、规范链接去重、采集任务记录。
- 可选 AI：OpenAI 兼容接口生成中文标题、导读、关键词及工程案例草稿；无 API Key 也能完成收录、编辑与发布。
- 中文优先、响应式、浅色/深色模式、空状态与错误页面。

公开页面不默认重新发布第三方全文。时间线按原始发布日期组织，不把时间先后解释为技术继承。

## 本地启动

要求 Node.js 22+、npm，以及可写的本地磁盘。建议使用当前 Node.js LTS。

```bash
git clone https://github.com/Ohmakabaka/agent-atlas.git
cd agent-atlas
git checkout work
npm ci
cp .env.example .env
```

在 `.env` 中设置自己的 `ADMIN_PASSWORD`（至少 12 个字符）和 `SESSION_SECRET`（至少 32 个字符）。没有内置默认密码；未设置时不能登录后台。可在本机生成随机值，并只写入 `.env`，不要提交或粘贴到 issue：

```bash
openssl rand -base64 24
openssl rand -hex 32
```

然后初始化数据库并启动：

```bash
npm run db:init
npm run dev
```

浏览器打开 `http://localhost:3000`，编辑入口为 `/admin`。`DATABASE_URL="file:./dev.db"` 对应 `prisma/dev.db`。数据库和 `.env` 已被 Git 忽略。

`db:init` 依次生成 Prisma 客户端、应用版本化迁移并导入种子。可以重复运行：迁移只执行未应用的版本，种子不覆盖已有编辑。它不是重置数据库命令。

## 编辑第一篇资料

1. 登录 `/admin`，进入“收录内容”。填写公开 URL，可补充标题和导读。
2. 系统尝试提取元信息；无法联网时保留链接，进入人工编辑。公众号链接采用人工元信息流程。
3. 补齐中文标题、原始标题、作者/来源、日期、中文导读、技术要点和技术主题。
4. 核对机器建议。若使用 AI，草稿单独保存，需要人工核实后采纳。
5. 将状态设为“已发布”并保存。发布需要中文标题、至少 20 字中文导读和至少一个主题；前台随后可检索。
6. 若发现资料失效，改为“已归档”。来源与知识关系可在后台单独维护。

批量导入字段、规范链接与转载处理见 [采集适配器指南](docs/ingestion.md)。

## 开发命令

| 命令                  | 用途                                     |
| --------------------- | ---------------------------------------- |
| `npm run dev`         | 开发服务器                               |
| `npm run db:generate` | 按 Prisma 模型生成客户端                 |
| `npm run db:migrate`  | 应用已提交的数据库迁移                   |
| `npm run db:seed`     | 追加缺失种子，不覆盖现有内容             |
| `npm run db:init`     | 一键初始化数据库                         |
| `npm run typecheck`   | TypeScript 检查                          |
| `npm test`            | 单元与隔离数据库集成测试                 |
| `npm run test:e2e`    | 对已启动服务运行公开页面与后台浏览器闭环 |
| `npm run build`       | 生产构建                                 |
| `npm start`           | 启动已构建的生产服务                     |
| `npm run ingest`      | 同步启用且配置了 feed URL 的来源         |

浏览器测试使用 Chromium。未安装浏览器时先执行 `npx playwright install chromium`（Linux CI 可加 `--with-deps`）。在一个终端运行 `ALLOW_INSECURE_ADMIN_COOKIE=true npm start`，另一个终端运行 `npm run test:e2e`；本机开发服务器也可用于测试。测试需要 `.env` 中有效的编辑凭证，测试内容会自动清理。可用 `BASE_URL` 指向本机其他端口、`CHROMIUM_PATH` 指定浏览器。不要对真实生产数据库运行编辑闭环测试。

GitHub Actions 配置会检查初始化、类型、单元/数据库测试、生产构建和浏览器流程。远端 CI 的实时结果以 GitHub Actions 页面为准。

当前验证记录和分阶段提交见 [PROGRESS.md](PROGRESS.md)。自动化测试不等同于第三方站点或模型服务的实时可用性检查。

## 环境变量

| 变量                          | 必需     | 说明                                                                  |
| ----------------------------- | -------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                | 是       | 默认 `file:./dev.db`，相对 `prisma/`；生产环境使用持久目录的绝对路径  |
| `ADMIN_PASSWORD`              | 编辑功能 | 至少 12 个字符，服务端验证，无默认密码                                |
| `SESSION_SECRET`              | 编辑功能 | 至少 32 个字符，用于签名会话 cookie                                   |
| `ALLOW_INSECURE_ADMIN_COOKIE` | 否       | 仅本机 HTTP 生产构建验收时设为 `true`；正式部署保持未设置，使用 HTTPS |
| `AI_API_KEY`                  | 否       | 未设置时不调用模型，人工流程和规则分类仍可用                          |
| `AI_BASE_URL`                 | 否       | 默认 `https://api.openai.com/v1`，必须为 HTTPS 的 OpenAI 兼容服务     |
| `AI_MODEL`                    | 否       | 默认 `gpt-4o-mini`，应按服务提供方设置                                |

AI 请求只发送已保存的标题、来源 URL 和有限元数据，不自动抓取或发送文章全文。外部内容被当作数据处理，生成结果始终是待审草稿。

## 架构与贡献

使用 Next.js App Router、React、TypeScript、Tailwind CSS、Prisma 和 SQLite。Prisma 采用 JavaScript 查询引擎与 libSQL 适配器，避免应用依赖原生 Prisma 查询引擎。没有微服务、队列、向量库或外部身份服务的必要依赖。

```text
src/app/                 公开页面、后台页面与服务端操作
src/components/          导航、主题切换和文章卡片
src/lib/queries.ts       公开数据查询与组合搜索
src/lib/ingestion/       来源适配器、规范化、去重与分类建议
src/lib/ai/              LLMProvider 接口与 OpenAI 兼容实现
src/lib/auth.ts          编辑会话与访问控制
prisma/                  数据模型、迁移与种子导入程序
data/                    可独立维护的主题、资料、来源、人物与关系 JSON
scripts/                 来源同步等运维入口
tests/                   自动化验证
docs/                    架构、部署、采集和贡献说明
```

- [架构与数据模型](docs/architecture.md)
- [本地与生产部署](docs/deployment.md)
- [来源适配器开发](docs/ingestion.md)
- [内容与主题数据格式](docs/content.md)
- [贡献指南](CONTRIBUTING.md)

欢迎贡献可核实的资料、技术主题、工程案例、纠错和采集适配器。`data/` 中的变更可通过 GitHub PR 审阅；后台修改写入数据库，不会自动生成 Git 提交。

## 当前边界

- 搜索使用 SQLite 字符串匹配和关系过滤，支持中文子串与组合条件；尚未使用中文分词、语义检索或向量索引。
- RSS/Atom 与 AI 联网依赖部署环境的 DNS、网络出口和目标站点。当前云环境的外部 DNS/网络策略限制了部分实时验证；手工导入仍可工作，失败会记录在采集任务中。
- 种子来源采用真实公开链接，但部分机构站点在开发环境返回访问限制，无法现场逐条核实标题、日期与页面变更。发现不准确的信息请提交原始依据进行纠正。
- 不提供公众号登录态采集、反爬绕过、WeRSS 内置服务、自动全文翻译或未经审核的自动发布。
- 当前为单实例、小团队编辑系统：无多角色权限、分布式任务队列、完整编辑版本历史或外部计划任务托管。定时同步由部署方的 cron 等调度器执行。

## 许可证与第三方内容

仓库自有代码遵循 [MIT License](LICENSE)。第三方文章、论文、图片、商标、源站摘录及所链接项目仍受各自权利人和许可证约束，收录链接不意味着它们采用 MIT。默认保存元信息、原文链接、原创导读及关联数据，不批量复制全文。

提交原创导读或代码时，请确保你有权按项目许可贡献；引用或引入第三方材料时明确署名、出处、许可及必要限制。详见 [内容贡献要求](docs/content.md)。
