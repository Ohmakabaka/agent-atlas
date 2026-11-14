# 架构与上下文导读的资料核查

核查日期：2026-11-14。编写方式：当前 Codex 会话辅助原创整理，未调用网站的模型 API，未进行生产效果实验。正文区分项目文档所述行为与本站教学设计建议；这份记录不表示人工专家审核。

对应内容：`atlas-workflow-agent-decision`、`atlas-context-budget`。正文分别约 1,335 和 1,341 个汉字，另含接口名、教学示例和资料链接。

## 实际读取的依据

使用继承网络代理与正常 TLS 校验，先读取公开 GitHub 原始 Markdown，再通过 `git ls-remote` 获得提交号，并重取固定提交文件，确认内容一致。正文和结构化 references 使用固定提交链接，避免把后续文档变化混入本次依据。

| 资料 | 固定提交 | 实际核对位置 | 使用范围 |
| --- | --- | --- | --- |
| anthropics/anthropic-cookbook / patterns/agents/README.md | `ce8b2629efe8b24048b127b4c79af1e9cbab93d4` | Basic Building Blocks、Advanced Workflows | 模式列表；未声称示例证明普遍优势 |
| langchain-ai/langgraph / README.md | `08a2016953789a4f579b4d36bd1967941ec62012` | Why use LangGraph? | 框架对持久执行、人工介入和记忆的能力说明；没有把说明转成本站实测保证 |
| openai/openai-agents-python / docs/running_agents.md | `64fbde5d02b42ae5f9db668eb0184cdb3fc9d775` | The agent loop、Run config | 工具结果后续循环、handoff、max_turns、最终输出判定、输入过滤与恢复入口 |
| openai/openai-agents-python / docs/sessions/index.md | `64fbde5d02b42ae5f9db668eb0184cdb3fc9d775` | 历史合并、数量限制、压缩会话 | 按项目数限制历史、存储与本轮输入的区别、压缩用量与延迟影响 |

文件 SHA-256：

- Cookbook README：`2425d60f34e1b071ac958d187a54e76b126bbd08517ba9f4377ec3304191c3db`
- LangGraph README：`3a13e257af1216962d53d72414a7f44ac1fc5cea34d994bdff60ea2a3b045933`
- Running agents：`881e6986fde7e8143bbb722577a04ed169f49a5bdf3c64f29124a5ffc42fb7bf`
- Sessions：`ca09eca46c0f55621fe97389c3a37a3be205b6876a3c9f0c68ab80afefef6506`

## 明确的边界

- 客服工单流程、上下文分配数字、状态对象与检查清单均为本站原创教学示例，不代表 SDK 官方推荐的固定配置，不报告未经执行的成功率或成本收益。
- 没有转载第三方全文；仓库只保留原创正文、引用与核查笔记。下载的核查材料仅位于临时目录。
- LangGraph 旧路径 `docs/docs/concepts/persistence.md` 返回 404，未纳入参考资料。没有绕过网络限制寻找私有来源。
- API 文档固定在上述提交；读者在实施时仍需对齐自己安装的 SDK 版本。
