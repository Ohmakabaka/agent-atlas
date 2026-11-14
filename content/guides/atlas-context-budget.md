# 让长任务可继续：上下文预算、证据引用与持久状态

把原始记录、任务状态和本轮模型输入分开管理，结合 Agents SDK 的历史限制与输入过滤接口，设计可衡量的上下文预算，并用中断恢复测试验证信息是否丢失。

作者：Agent Atlas · Codex 辅助整理

来源核查日期：2026-11-14

本篇为 Codex 会话辅助撰写的原创技术指南；已核对列出的来源，未标注为人工审核。工程建议与来源陈述应分开理解。

## 上下文窗口不是任务的唯一存储

做一个持续多轮的研究助手时，很容易把所有对话、网页摘录和工具日志一直追加到下一次请求。这样做实现简单，但检索结果会重复，已经推翻的猜测仍占据窗口，模型还可能找不到最初的交付要求。更大的上下文窗口只扩大可放入的空间，是否选择了正确证据仍需要另外判断。

建议先区分三层信息：原始记录保留发生过什么；任务状态记录目前确认什么、下一步是什么；本次模型输入只包含当前决策需要的信息。三者可以共享引用，但不必有相同长度。下面是一套教学方案，预算数字和组织方式都是示例，不是某个模型的最佳实践结论。

## 先写预算，再决定裁剪策略

把模型允许的上下文容量视为总额，先预留输出和工具结果可能占用的空间，再分配指令、任务状态、检索证据和近期对话。不同模型对推理、输出和输入的限额定义可能不同，应按所用接口核对，不能把字符数直接当成 token 数。

例如某轮业务主动限制为一万六千个 token，可以暂时给指令与工具说明三千、状态摘要两千、证据六千、近期交互三千，留下两千作余量。这个划分只用于说明预算账本；上线前要结合实际 tokenizer、工具返回大小和任务成功率调整。

当证据超预算时，优先按本轮问题筛选，再去重和截取相关段落。每段保存来源、定位信息和获取时间。完整原文可以留在允许保存的外部存储中，通过引用重新读取。不要把整篇网页压成一句结论后丢掉证据出处，也不要把工具返回中的指令提升为系统要求。

## 持久历史与当前输入可以分开管理

OpenAI Agents SDK 的 Sessions 文档介绍了历史存取：运行前取回历史，之后保存新项目；`SessionSettings(limit=N)` 按最近的项目数量限制取回范围。这里限制的是项目数，不是 token。一个大工具结果就可能超过多条短对话的长度，因此按条数取最近内容并不是完整的预算控制。

同一文档的 `session_input_callback` 可以改变历史与新输入的合并方式，而不把改写后的旧历史重新当作新项目保存。运行文档还描述了 `call_model_input_filter`，用于模型调用前的输入处理。这些接口提供实施位置，具体筛选规则仍需要应用设计。调用与返回必须保持接口要求的关联结构，不能简单切掉数组的一半。

文档也提供压缩会话的实现。压缩涉及额外模型工作，并可能影响本轮耗时和用量；它不是免费的无损存储。关键数字、用户约束和未解决分歧，应有可回查的原始记录。

## 把长任务状态写成可核验的对象

研究助手可以维护以下示意状态，每轮只更新发生变化的字段：

```json
{
  "goal": "比较两种检索方案",
  "constraints": ["只使用可公开引用的资料"],
  "confirmedEvidence": ["source-17#section-3"],
  "openQuestions": ["测试集是否与训练数据重叠"],
  "nextAction": "核查评估设置",
  "completedActions": ["read-source-17"]
}
```

这里把“已确认依据”和“待核实问题”分开，避免摘要把猜测升级为事实。状态还应关联版本、更新时间与执行记录。生成摘要时可以要求保留未完成任务和冲突，但仍需对重要字段做程序校验或编辑复核。

LangGraph README 将持久执行和记忆列为能力，适合作为研究运行基础设施的入口。不过，能恢复状态不代表外部动作可以安全重放。若助手已提交报告但在记录结果前中断，恢复时要核对目标系统和动作标识，再决定是否重试。

## 用恢复测试检验上下文设计

选一个能明确验收的小任务，分别在读完资料后、生成草稿后和外部动作后模拟中断。恢复时检查目标与限制是否仍在、引用是否可定位、已经完成的动作是否被重复执行。再把一条关键证据放到较早的历史中，检查裁剪后能否通过状态引用重新取回。

同时记录输入用量、摘要用量、证据找回率与最终答案的引用准确性。只有 token 变少，不能证明方案更好；若摘要遗漏关键限制，成本下降可能伴随任务失败。把这些失败样例加入回归集合，再调整预算。

## 原始资料

本文为 Codex 辅助整理的原创工程导读；示例未声称经过生产压测。资料核查日期为 2026 年 11 月 14 日，链接固定到对应提交。

- [OpenAI Agents SDK：Sessions](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/sessions/index.md)，查看历史合并、数量限制与压缩会话。
- [OpenAI Agents SDK：Running agents](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/running_agents.md)，查看输入过滤与恢复入口。
- [LangGraph README](https://github.com/langchain-ai/langgraph/blob/08a2016953789a4f579b4d36bd1967941ec62012/README.md)，查看持久执行和记忆的能力说明。

## 来源核查记录

- [OpenAI Agents SDK — Sessions](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/sessions/index.md)：Control how history and new input merge / Limiting retrieved history / OpenAI Responses compaction sessions
- [OpenAI Agents SDK — Running agents](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/running_agents.md)：Guardrails, handoffs, and model input shaping / The agent loop
- [LangGraph README](https://github.com/langchain-ai/langgraph/blob/08a2016953789a4f579b4d36bd1967941ec62012/README.md)：Why use LangGraph? / Durable execution / Comprehensive memory
