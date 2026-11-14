# 来源采集与适配器开发

## 入口与边界

后台 `/admin/import` 支持手动 URL 和粘贴 JSON/CSV。公众号链接只做链接与人工元数据处理，不依赖非官方采集组件。GitHub 根仓库地址读取公开网页元信息，不需要 GitHub API Token。

`/admin/sources` 可维护来源和订阅地址；`/admin/jobs` 可触发 RSS/Atom 同步并检查任务结果。命令行使用：

```bash
npm run ingest
```

CLI 从项目工作目录加载 `.env`；只同步 `enabled=true` 且 `feedUrl` 非空的来源。每个 feed 最多读取 50 条，错误记录到 `IngestionJob`；存在错误时 CLI 退出码非零。实际定时执行由 cron 等外部调度器负责，应用不会伪装一个持续运行的内置调度服务。

只采集标题、描述、作者、日期和链接等有限元数据，不保存网页全文。响应最大 2 MB、请求带超时、重定向重新检查目标、DNS 解析结果固定到本次请求；私网和保留地址被拒绝。不要关闭 TLS 验证或以放开私网作为修复手段。

## 批量数据

JSON 须为条目数组，每批最多 100 条、1 MB；CSV 首行为同名字段。`url` 必填，其余字段可省略。下面是格式示例，不是已核实的资料记录，导入后必须人工补全审核：

```json
[
  {
    "url": "https://example.org/agent-note",
    "title": "待审核的中文标题",
    "originalTitle": "Original article title",
    "summary": "由贡献者撰写并需要核实的中文导读。",
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

可选 `sourceId` 指向已有来源 ID。可选 `canonicalUrl` 仅在编辑确认原始出处或转载对应关系后填写，不要根据标题猜测。字段含逗号或换行时遵循标准 CSV 引号转义。

入库后仍为 `pending_review`；导入中文摘要也不等于审核发布。

## 规范化与去重

- 规范化 HTTP(S) URL，去除已知追踪参数与片段，保留识别文章必需的参数。
- 对规范链接和已记录的补充链接查重。同一内容保留多条 `ArticleLink`。
- 页面声明的同源 canonical 可用于规范地址；跨站 canonical 仅作为建议，避免来源页面任意劫持已有条目身份。
- 标题匹配仅在同来源、同发布日期和足够长的规范化完整标题一致时辅助去重；相似主题不是重复内容。
- 若链接和规范链接已属于不同条目，停止该条导入，要求编辑核对，不自动破坏已有关系。

批量导入逐条处理并返回成功、重复和失败计数。它不是全批事务：部分成功时，修正失败行后可以重试，已收录行会去重。

## 扩展适配器

接口定义在 `src/lib/ingestion/adapters.ts`：

```ts
interface SourceAdapter<Input = string> {
  name: string;
  discover(input: Input): Promise<DiscoveredItem[]>;
}
```

`DiscoveredItem` 至少包含 `url`、`adapter`，可携带标题、描述、作者、日期、来源等。新适配器只负责发现与元数据提取；通过 `ingestItem()` 进入统一去重、分类建议和待审流程，不直接设置 `published`。

实施步骤：

1. 确认源站公开接口、许可与访问条件，优先官方 RSS/Atom 或元数据接口。
2. 使用共享 `safeFetch`；不可另建跳过私网、TLS、重定向、大小与时间限制的抓取器。
3. 把缺失信息留空，不以猜测补作者、日期或工程指标。
4. 为正常格式、缺字段、无效 URL、超限、重定向和重复导入编写测试。
5. 将入口接入后台或 CLI，同时更新环境变量和文档。

WeRSS 可作为未来的外部 feed 适配来源；当前没有内置 WeRSS 服务、账号接入或微信登录态采集。

## 自动分类与 AI

规则分类根据标题、描述与主题名称提供标签建议，并建立 `suggested` 关系，不直接确认知识关联。LLM 接口见 `src/lib/ai/index.ts`：

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

默认实现兼容 `/chat/completions`，使用 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`。模型服务须为标准端口的公开 HTTPS 地址；当前共享安全访问策略不接受内网模型地址或任意端口。响应经过结构校验后只写入 `aiDraft`。无法从元数据支持的内容应留空或注明不足；编辑须查阅原文，不能把模型猜测发布成事实。

没有密钥时返回明确的降级状态；人工流程和规则分类继续可用。接入新模型提供方时实现同一接口，保留受限输入、输出校验与草稿隔离。

## 网络故障

本地 URL 格式有效不代表目标可访问。当前云环境中，部分主机的 DNS 和机构站点访问受限；手动 URL 导入会保留链接并提示填写元数据，RSS/AI 联网失败则显示任务或处理错误。请检查部署网络的目标域名、DNS 和访问条件。不要把零条新内容或一个空 feed 任务当作外部采集已通过端到端验收。
