# 用 Codex 会话维护网站内容

前期内容可以直接在当前 Codex 会话中撰写、核对来源并保存到仓库，使用当前账号的 Codex 用量，无需为网站配置 `AI_API_KEY`。内容随代码和数据库导入流程发布，读者打开页面时不会为了显示这些文章而调用模型。具体可用额度与限制以账号显示为准，主机和域名费用另计。

部署后的 Web 服务不能把 Codex 会话额度直接当作模型 API 余额。网站后台的“生成中文导读建议”是另一条可选路径，需要独立配置模型 API；前期保持 `AI_API_KEY` 为空即可。两条路径都不会把模型输出自动标记为人工审核。

## 已准备的六篇原创指南

以下是仓库中的 Markdown 内容存档，部署并完成初始化后，对应站内路径为 `/articles/<slug>`，例如 `/articles/atlas-context-budget`。这些链接不表示已有公网部署。

| 内容                       | Markdown 原稿                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------- |
| 工作流与 Agent Loop 的选型 | [atlas-workflow-agent-decision.md](../content/guides/atlas-workflow-agent-decision.md) |
| 上下文预算与持久状态       | [atlas-context-budget.md](../content/guides/atlas-context-budget.md)                   |
| MCP 工具接口与执行权限     | [atlas-mcp-tool-boundaries.md](../content/guides/atlas-mcp-tool-boundaries.md)         |
| 长期记忆的生命周期         | [atlas-memory-lifecycle.md](../content/guides/atlas-memory-lifecycle.md)               |
| Agent 评测与持续回归       | [atlas-evaluation-regression.md](../content/guides/atlas-evaluation-regression.md)     |
| 可靠执行与故障恢复         | [atlas-durable-agent-execution.md](../content/guides/atlas-durable-agent-execution.md) |

每篇保留至少三项原始依据、来源核查日期、适用读者和主题。首批来源使用实际读取的 GitHub 固定提交链接，核查范围见 [architecture.md](editorial-evidence/architecture.md)、[tools-memory.md](editorial-evidence/tools-memory.md) 与 [evaluation.md](editorial-evidence/evaluation.md)。正文区分资料描述、原创教学示例和工程建议，没有用虚构的性能数字填充案例。

这六个 slug 是本次“使用 Codex 生成网站内容”请求所选的启动内容白名单。`npm run db:seed` 或 `npm run db:init` 会将缺失的六篇新增为已发布，署名为 **Agent Atlas · Codex 辅助整理**，`reviewedAt` 保持 `null`。页面明确显示 Codex 辅助创作和尚未人工复核；来源核查日期不能替代人工审核日期。后续新增的内容不会因为放进同一目录就自动发布。

## 每次续写的实际流程

可以直接给 Codex 这样的任务：

> 为 Agent Atlas 新增两篇中文原创指南，主题是工具选择和浏览器 Agent 的任务验收。先读取已有内容，避免重复；实际核对至少三项原始资料，优先使用固定版本或提交链接。明确区分资料结论、教学例子与工程建议，不编造作者、日期或效果数据。按现有格式保存到 data/editorial 的新 JSON 文件，记录来源核查范围，生成 Markdown 并验证。每批完成后 commit / push 到 work。内容先导入待审核，保留 Codex 署名。

一次批次按以下步骤完成：

1. 选择已有主题，读取可访问的原始资料，写入 `data/editorial/批次名.json`。文件顶层为数组，字段格式见下节。无法读取的来源不能声称已核查。
2. 生成可在 GitHub 阅读的 Markdown，并检查内容包与数据库主题。首次本地开发需先完成 README 中的依赖安装和 `npm run db:init`；`content:check` 需要可连接、已初始化的数据库。

   ```bash
   npm run content:render
   npm run content:check
   ```

   `content:render` 只生成 `content/guides/*.md`，不写数据库。修改 JSON 后必须重新生成；`content:check` 检查字段、原稿一致性、主题和已有条目冲突，不调用模型、不写入内容，也不代替事实核查。输出的 `created` 表示拟新增项，`skipped` 表示已存在项。

3. 检查本批差异，将 JSON、生成的 Markdown 和来源核查笔记一起保存，再推送：

   ```bash
   git diff --check
   git status --short
   git add data/editorial content/guides docs/editorial-evidence
   git commit -m "content: add new Agent Atlas guides"
   git push origin work
   ```

4. 按 [Render 发布指南](render.md) 部署已推送的代码。蓝图关闭自动部署，需在控制台选择 **Manual Deploy → Deploy latest commit**。部署会保留既有数据库；新增指南没有自动加入首批白名单。
5. 部署完成后，在该 Web 服务 Shell 的 `/app` 下验证并导入新条目：

   ```bash
   npm run content:check
   npm run content:import
   ```

   默认状态为 `pending_review`，公开页面和搜索不会显示这些待审条目。然后登录 `/admin`，核对正文、参考资料与主题，编辑并发布。网站不需要为这次导入配置模型 API。

Render 首次分配的 HTTPS 地址会通过 `RENDER_EXTERNAL_URL` 提供给应用；未设置 `SITE_URL` 时使用它生成站点链接、RSS 和 sitemap。绑定自己的域名后，再设置真实的 `SITE_URL`。该配置决定访问地址，不负责把待审核内容改为已发布。

## 内容包字段

严格字段定义见 [schema.ts](../src/lib/editorial/schema.ts)。不要在 JSON 中添加 `status`、`reviewedAt` 或自定义作者字段；发布状态由导入命令决定，Codex 署名由程序统一设置。

| 字段           | 要求与用途                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `slug`         | 唯一的小写字母、数字和短横线标识，最长 120 字符；同时用于站内路径和 Markdown 文件名                                  |
| `title`        | 中文标题，5–160 字符，准确表达范围                                                                                   |
| `summary`      | 30–1,200 字符的导读，用于列表与阅读引导                                                                              |
| `bodyMarkdown` | 500–40,000 字符的完整原创正文；从二级标题开始，写出依据、例子、取舍与原始资料链接                                    |
| `takeaways`    | 3–8 项技术要点，每项 5–500 字符                                                                                      |
| `audience`     | 3–500 字符，说明适合的读者                                                                                           |
| `topics`       | 1–15 个已存在的主题 slug，不可重复；参考 [topics.json](../data/topics.json)                                          |
| `references`   | 3–20 项不重复的来源，每项包含 `url`、`title`、`locator`；URL 必须是无凭据的 HTTPS 地址，`locator` 说明核对章节或函数 |
| `verifiedAt`   | 实际核查日期，格式 `YYYY-MM-DD`，不能晚于今天；不是原始资料发布日期或人工审核时间                                    |

可参照现有 [architecture.json](../data/editorial/architecture.json)、[tools-memory.json](../data/editorial/tools-memory.json) 和 [evaluation.json](../data/editorial/evaluation.json) 续写。正文、引用和核查记录都应使用独立表达，只保留必要摘录与出处，不复制未授权全文。

## 显式发布与既有内容修订

若某一新批次已经按本次任务要求完成核对，并明确要直接发布，可以使用：

```bash
npm run content:import -- --publish
```

`--publish` 仅改变本次**新建**文章的初始状态；仍保留 Codex 署名，`reviewedAt` 为 `null`，不会冒充人工审核。导入命令始终追加缺失内容，不覆盖既有正文、审核状态、主题或编辑历史。已经待审核、已发布或归档的条目都会跳过，重复导入也不会把它们重新发布。

因此，修订已导入文章应在后台编辑；只改 JSON 并重新推送，不会自动覆盖数据库中的内容。数据库的后台修订也不会自动回写仓库 Markdown；需要同步存档时，更新 JSON、运行 `content:render` 并提交。已有 slug 或原稿地址属于不同内容时，导入会报告冲突，不能靠覆盖解决。

## 与网站运行时 AI 草稿的区别

| 路径                   | 用量来源            | 保存位置与发布行为                                                                           |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------- |
| Codex 会话整理内容     | 当前 Codex 会话额度 | JSON 与 Markdown 入库前保存在 Git；默认导入待审核，显式发布仍保留 Codex 标记                 |
| 后台“生成中文导读建议” | 独立模型 API 账户   | 读取条目元数据，将建议保存到私有 `aiDraft`；公开标题、导读、正文与发布状态不因生成草稿而改变 |
| 手工编辑与发布         | 无模型调用          | 后台保存编辑字段、版本和审计，发布时记录编辑复核时间                                         |

运行时 AI 使用 OpenAI 兼容接口，配置为 `AI_API_KEY`、`AI_BASE_URL` 和 `AI_MODEL`。当前实现只向模型提供标题、原始标题、来源地址和有限的描述元数据，不会因“生成导读”自动读取完整原文。未配置 API 时手工编辑、Codex 内容导入和整站阅读都可正常工作。未来启用时再按所选服务验证网络、模型、费用和输出质量；本次内容生成没有使用该 API 路径。
