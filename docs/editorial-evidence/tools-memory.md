# MCP 与长期记忆教程的来源核查

核查日期：2026-11-14。内容由当前 Codex 会话辅助整理，未调用网站配置的模型 API，未进行人工审核。教程中的示例、实现清单和选型建议为原创整理，研究结果没有被改写为未经验证的生产效果。

本次读取 GitHub 官方或作者仓库中的文件，并通过 `git ls-remote` 取得主分支修订号。之后重新请求对应修订号的原始文件，确认与已阅读内容逐字节一致；正文引用使用固定修订链接，便于复核。下列 SHA-256 是来源文件校验值，不是教程校验值。第三方全文仅用于阅读，未收录到仓库。

| 来源 | 已读取内容与支持的表述 | 文件 SHA-256 |
| --- | --- | --- |
| MCP 2025-06-18 `server/tools.mdx` | `tools/list`、`tools/call`、输入与输出结构、协议错误与工具执行错误、服务端校验与访问控制、注解可信度边界 | `43dbcfa261e70462c635ec9884bc6e86bd54bb4f43eea440922211e0ad542e81` |
| MCP 2025-06-18 `basic/authorization.mdx` | 令牌受众验证、禁止把收到的令牌直接透传给下游、下游使用独立凭证 | `1cc695ec866e2f5638e02b184939ad720084b4c5b11585c61044caa5bb9153b0` |
| MCP TypeScript SDK `README.md` | 客户端、服务端、传输与授权辅助能力；版本对应文档入口。教程没有把 2025-06-18 规范称为最新版 | `d776beb7f1d0194da22e7d82cc84d869bd4ae805ba5d8283b69f57dec5b64dd6` |
| Generative Agents `retrieve.py` | `new_retrieve` 组合近期性、重要性、相关性并排序；未将其中的参数描述为通用推荐值 | `a609d9ba431dd8cb0f3ec804d128ff9d1755719221127b45a248d20c51dc7120` |
| Generative Agents `reflect.py` | `generate_insights_and_evidence` 返回想法与证据节点，`run_reflect` 写入包含证据的想法 | `5e2658a90f658ce4f42f6a7c3859fe47fd08925eb77c179a4c38e9233d1c205c` |
| Reflexion `README.md` | 无反馈、上次轨迹、反思及组合策略；决策任务的持久反思记忆开关；实验运行与日志说明 | `5209db116381e7c067dd0ee4085da26b7d00fd19cbe66b6367051a2f95ef9024` |

固定修订：

- `modelcontextprotocol/modelcontextprotocol`: `0175d20f8b2c49e0402c37c37ed39ae2be47277e`
- `modelcontextprotocol/typescript-sdk`: `919bb8ea88b6e10e72c2f8b6218fad4cfdc40b2c`
- `joonspk-research/generative_agents`: `fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4`
- `noahshinn/reflexion`: `218cf0ef1df84b05ce379dd4a8e47f17766733a0`

初次尝试的 MCP `basic/security_best_practices.mdx` 路径返回 404，未作为依据。所需授权边界直接由可访问的 `authorization.mdx` 支持。Letta 当前 README 也已读取，但没有将其作为旧 MemGPT 架构依据，因此未加入教程参考资料。此次引用的六个固定修订文件均可读取，没有用不可访问页面冒充已核查证据。

成品数据见 [tools-memory.json](../../data/editorial/tools-memory.json)，两篇正文分别约 1,167 与 1,327 个汉字，每篇包含三项固定修订引用。
