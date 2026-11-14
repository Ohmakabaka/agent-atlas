# 让 Agent 能恢复：状态、工具副作用与故障演练

长任务的可靠性取决于进程重启后能否辨认已完成动作、未完成动作和待确认结果。结合 LangGraph 与 OpenAI Agents SDK 的公开文档，梳理持久状态、幂等工具、暂停恢复和可观测性。

作者：Agent Atlas · Codex 辅助整理

来源核查日期：2026-11-14

本篇为 Codex 会话辅助撰写的原创技术指南；已核对列出的来源，未标注为人工审核。工程建议与来源陈述应分开理解。

## 恢复之前，先知道哪里停了

一个调研 Agent 已抓取资料、整理结论并准备发布文章，此时进程退出。重启后直接把原始问题再交给模型，可能重复抓取、生成不同草稿，甚至重复发布。可靠执行需要保存可恢复的任务状态，而不是只保留聊天记录。

LangGraph 的 README 将持久执行、人在回路和记忆列为基础能力。OpenAI Agents SDK 的运行文档描述模型调用、工具执行、交接与结束条件，并允许通过 RunState 恢复暂停的任务。这些是框架提供的机制；业务动作是否已经对外生效，仍需要应用自己确认。下文的文章发布流程是编辑设计的例子，不代表两个项目给出了完全相同的执行保证。

## 把任务状态与对话分开

建议保存任务标识、当前阶段、输入版本、已选资料、草稿版本、待处理动作及外部结果标识。对话历史用于帮助模型理解上下文，任务状态则用于决定下一步允许执行什么。两者可以关联，但不要把模型上一句“已经发布”当成数据库状态。

以发布流程为例，可区分准备中、待审阅、执行中、已确认和失败。状态更新应附带版本检查，防止两个执行器同时推进同一个任务。若采用租约，要定义到期后的接管规则，并让旧执行器失去写入资格；一个时间戳本身不会自动解决并发冲突。

## 最难的是外部动作已成功但本地未记录

假设发布接口已接受请求，网络却在返回文章 ID 前中断。直接重试可能生成第二篇文章。编辑建议为同一个业务动作生成稳定幂等键，并由接收方记录结果；重试时复用该键，而不是每次随机生成。若接口不支持幂等，应先按任务标识查询既有结果，再决定重试或交给人工核对。普通查询未找到结果，不代表可以安全重试：旧请求可能仍在执行。应通过权威状态核对；结果仍未知时，不自动重放写操作。

因此，恢复设计要明确三个状态：确定未执行、确定已执行、执行结果未知。网络超时通常只能说明调用方没有得到结果，不能推出服务端没有执行。对结果未知的写操作，盲目自动重试比暂停更容易扩大影响。对于只读查询，可以采用更积极的重试；仍应限制总次数、等待时间和整体预算。

## 暂停点必须可以真正恢复

OpenAI Agents SDK 的人在回路文档介绍了 interruptions、RunState 序列化以及批准或拒绝后的恢复。可以借此把“待发布草稿”作为一个明确暂停点，保存待执行参数，待决策后继续。文档也区分单次调用批准和持续批准，因此应用应选择符合自身权限边界的规则。

编辑建议审批界面展示具体目标、内容版本与动作参数，恢复时重新核对这些条件。如果草稿在等待期间被修改，旧版本的同意不应自动覆盖新内容。状态序列化文件也可能包含敏感上下文，应限制访问、保留期限与日志输出。框架能暂停，不等于存储、权限和审批展示已经替你完成。

## 为排障留下足够的执行证据

OpenAI Agents SDK 的 tracing 文档描述了模型调用、工具调用、交接等事件与 trace/span 的组织方式。实际项目可以沿用一次任务一个关联标识的思路，把状态变化、工具耗时、重试和外部对象标识串起来。记录应足够定位问题，同时避免把访问令牌、完整用户资料和未经筛选的工具输出全部写进日志。

还要区分“最后一个可见日志”和“最后一个已持久化状态”。日志可能批量导出；进程被终止时，最末尾事件未必已经送达。恢复逻辑应读取权威存储，日志帮助解释过程，不能单独承担业务提交记录。

## 用故障演练检验承诺

上线前可以按以下编辑建议演练：

- 在只读工具返回后终止进程，重启后检查任务能否继续。
- 在写请求发送后、收到响应前模拟断网，确认不会重复发布。
- 同时启动两个执行器，检查同一动作是否只被有效执行一次。
- 暂停审批后修改草稿，确认恢复时检查版本与授权范围。
- 制造持续超时，确认任务会在预算耗尽后停止，并保留可诊断原因。

这些检查验证的是你实际接入的存储和工具链。只有演练通过，才有依据描述自己的恢复能力；仅选择了一个支持持久执行的框架，不足以宣称整个系统具备“恰好一次”语义。

## 原始资料

1. [LangGraph README：持久执行、人在回路与记忆](https://github.com/langchain-ai/langgraph/blob/08a2016953789a4f579b4d36bd1967941ec62012/README.md)。
2. [OpenAI Agents SDK：运行循环与恢复输入](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/running_agents.md)。
3. [OpenAI Agents SDK：暂停、序列化和人工决策](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/human_in_the_loop.md)。
4. [OpenAI Agents SDK：Tracing 与批量导出](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/tracing.md)。

本文为原创教学整理。幂等键、状态设计及故障演练清单是编辑建议，未声称任何项目已经完成这些演练或提供未核实的性能结果。

## 来源核查记录

- [LangGraph README](https://github.com/langchain-ai/langgraph/blob/08a2016953789a4f579b4d36bd1967941ec62012/README.md)：Why use LangGraph?：Durable execution / Human-in-the-loop / Comprehensive memory
- [OpenAI Agents SDK — Running agents](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/running_agents.md)：Runner lifecycle and configuration / The agent loop / RunState input
- [OpenAI Agents SDK — Human-in-the-loop](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/human_in_the_loop.md)：How the approval flow works / Example: pause, approve, resume
- [OpenAI Agents SDK — Tracing](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/tracing.md)：Traces and spans / Default tracing / Long-running workers and immediate exports
