# 来源采集与适配器开发

## 收录入口

后台 `/admin/import` 支持 URL、公众号链接和粘贴 JSON/CSV。普通网页或 GitHub 根仓库地址提取公开元信息，不需要 GitHub API Token；抓取失败仍可保留链接供人工编辑。公众号采用链接与人工元数据流程，不依赖非官方登录态组件。

来源管理维护订阅地址、启用状态和检查间隔；任务页显示来源健康、成功/失败记录、状态筛选和分页，并支持单来源检查与任务重试。自动收录仅创建待审核内容，不自动发布。

## 单次检查与持续调度

```bash
npm run ingest
npm run ingest -- --source source-mcp-sdk --force
npm run worker
```

命令从项目根目录加载 `.env`。`--source` 接受数据库来源 ID，不是 slug；默认只处理启用、有 feed 且已到期的来源。`--force` 忽略到期时间，但不绕过禁用状态或租约。CLI 输出新增、重复、跳过、未变更和错误汇总；存在错误返回退出码 1。

worker 完成一轮后再等待，默认 60 秒，可用 `INGESTION_POLL_SECONDS` 在 5–3600 秒之间调整。来源自身 `syncIntervalMinutes` 在后台设置，范围 1–10080 分钟。无需容器内 cron；也可由外部调度器运行单次 CLI，但应保持数据库租约与进程管理。

每个来源使用数据库持久租约，租约会续期，避免同源并行。进程异常退出后的过期 `running` 任务由后续检查标为 `interrupted`。SIGTERM/SIGINT 停止后续工作、取消可取消的网络请求并释放租约。失败单独记录，不阻断后面的来源；当前不做立即无限重试或指数退避，重试由下一次到期检查或编辑主动触发。

ETag 和 Last-Modified 用于条件 GET；HTTP 304 记录为 `not_modified`，不重新解析正文。修改 feed URL 时清空旧地址状态；采集过程若发现地址已变更，不将旧请求的 validators 写回新来源。

## 网络与安全传输

共享 `safeFetch` 默认只处理公开 HTTP(S) 地址和标准端口。响应上限 2 MiB，请求超时 12 秒、DNS 解析 5 秒，最多 3 次重定向。每次目标均检查；HTTPS 不降级到 HTTP，带凭证请求不允许重定向，跨源重定向移除旧条件请求头。

直连解析检查所有返回地址并固定本次连接 IP，拒绝私网、回环、链路本地、保留地址及编码绕过形式。源站响应不可信，不能据其 HTML 或 canonical 声明执行命令、扩大权限或任意合并已有内容。

在 DNS 由出口代理解析的部署环境中：

1. 保留正常的 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 或小写同名配置。
2. 只把明确受信的公开来源域名写入 `INGESTION_PROXY_HOSTS`，例如 `github.com,raw.githubusercontent.com`。它是精确域名列表，不接受 IP 或通配放行。
3. 上游代理必须实施目的地策略并阻止私网/保留地址；该列表不是绕过平台网络许可的方法。
4. 未列入名单的目标继续使用直连 DNS 校验。不要因为解析失败就扩大到任意主机。

代理模式需要额外可信根时，CA 文件优先级为 `INGESTION_CA_FILE`、`NODE_EXTRA_CA_CERTS`、`SSL_CERT_FILE`、`REQUESTS_CA_BUNDLE`，与 Node 信任根共同使用。容器中需要相应只读文件挂载；不能仅传入一个宿主机路径。不得使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`、`strict-ssl=false` 或取消私网检查排错。

当前开发环境已通过继承代理读取真实 GitHub HTML/Atom，MCP SDK feed 首次收录 10 条待审核资料，随后返回 304、未产生重复。OpenAI feed 仍被环境域名策略拒绝；这是出口限制，不应伪装为采集成功。

## JSON / CSV 批量格式

JSON 为条目数组，CSV 首行为字段名。每批最多 100 条、1 MiB；CSV 单记录另有 16 KiB 限制。`url` 必填，可选字段如下：

`title`、`originalTitle`、`summary`、`authorName`、`sourceId`、`publishedAt`、`language`、`type`、`layer`、`canonicalUrl`。

未知字段不保存为批量元数据。输入摘要最多 20,000 字符，其他可选字符串最多 2,000 字符，入库标题另有限制；需要长篇内容时应编辑原创导读，而不是导入第三方全文。

以下仅演示格式，不是已核实资料，导入后仍需人工审核：

```json
[
  {
    "url": "https://example.org/agent-note",
    "title": "待审核的中文标题",
    "originalTitle": "Original article title",
    "summary": "贡献者撰写且需要核对的中文导读。",
    "authorName": "原文署名",
    "publishedAt": "2025-01-15",
    "language": "zh",
    "type": "article",
    "layer": "community"
  }
]
```

```csv
url,title,originalTitle,language,type,layer
https://example.org/agent-note,待审核的中文标题,Original article title,zh,article,community
```

`sourceId` 指向已有来源 ID。`canonicalUrl` 仅在编辑确认原始出处或转载对应关系后填写；不要由相似标题推断。字段含逗号或换行时使用标准 CSV 引号转义。

批量导入逐条执行，不是全批事务。结果显示新增、重复及失败行；修正失败行后重试，已收录行会去重。中文摘要出现在导入数据中不等于已通过审核。

## 规范化、来源归属与去重

- URL 去除已知追踪参数与片段，保留识别内容必需的查询参数和路径语义。
- 同时检查规范地址和已记录补充链接，使用 `ArticleLink` 保留多来源入口。
- 页面同源 canonical 可作为规范地址；跨站 canonical 仅作为待核对建议，防止页面声明劫持其他条目身份。
- 来源按主机及最长匹配路径边界识别，可区分同一机构的栏目或 GitHub 下的组织/仓库；不会把 `/news` 当作 `/newsletter` 的前缀命中。
- 同来源、同发布日期、足够长且完全一致的规范化标题可辅助去重；仅主题相似不合并。
- 若导入链接与规范链接分别属于不同条目，停止该条并要求人工处理，不破坏已发布内容。
- 重复采集不覆盖已审核导读；规则建议和 AI 草稿不直接写入公开知识关系。

## 开发适配器

接口定义在 `src/lib/ingestion/adapters.ts`：

```ts
interface SourceAdapter<Input = string> {
  name: string;
  discover(input: Input): Promise<DiscoveredItem[]>;
}
```

`DiscoveredItem` 至少包含 `url` 与 `adapter`，可携带有限元信息。适配器负责发现与解析，通过 `ingestItem()` 进入统一去重、分类和待审流程。RSS/Atom 每个 feed 最多处理 50 条；定时采集由 `scheduler.ts` 负责条件请求和租约，不在适配器内另起后台循环。

新增适配器步骤：

1. 核实公开接口、使用条件和内容许可，优先官方 feed 或元数据接口。
2. 使用共享安全传输，不另建取消 TLS、私网、重定向或大小限制的抓取器。
3. 缺失信息留空，不推测作者、日期、工程效果。
4. 为正常与缺字段格式、无效地址、超限、重定向、重复身份和审核边界增加测试。
5. 将入口接到明确后台或 CLI，并同步配置文档。

WeRSS 可以作为外部 feed 来源或新增适配器接入；项目没有内置 WeRSS 服务、账号接入或公众号登录态采集。

## AI 草稿接口

规则分类依据标题、描述和主题名称生成标签建议，并建立 `suggested` 关系。可替换模型接口位于 `src/lib/ai/index.ts`：

```ts
interface LLMProvider {
  name: string;
  generate(metadata: {
    title: string;
    originalTitle: string;
    sourceUrl: string;
    description: string;
  }): Promise<ContentDraft>;
}
```

默认实现使用 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 调用 OpenAI 兼容 `/chat/completions`。服务必须是公开、标准端口的 HTTPS 地址；当前策略不接受内网模型地址。有限元数据作为待处理数据传入，输出经结构校验后仅保存在 `aiDraft`，保留已有规则建议和已审核正文。

没有 Key 时明确降级为人工编辑，不影响收录、搜索或发布。测试可注入传输验证请求协议和草稿保存边界；这不等于真实付费模型已联网验收。接入服务后应另外核对目标、费用、模型输出和人工审核流程。模型不能用元数据未提供的信息补造工程结果。
