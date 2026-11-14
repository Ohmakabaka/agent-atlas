# 从固定工作流到 Agent Loop：把自主决策放在需要它的地方

以客服工单为例，区分提示链、路由和 Agent Loop 的适用条件，给出有界调查循环、外部动作核验与对比评估的实施方法。示例是工程设计建议，不冒充生产案例。

作者：Agent Atlas · Codex 辅助整理

来源核查日期：2026-11-14

本篇为 Codex 会话辅助撰写的原创技术指南；已核对列出的来源，未标注为人工审核。工程建议与来源陈述应分开理解。

## 先找出任务中真正不确定的一步

假设你要做一个客服助手：读取工单，查订单，查退货规则，给出建议。四个步骤都需要语言理解，并不意味着它们都需要自主决策。若业务要求每张工单都走同样的检查，程序固定顺序、模型负责提取字段和解释结果，通常已经能覆盖需求。只有当下一步取决于刚发现的证据，例如先判断缺少订单还是缺少政策，才需要考虑让模型在允许的动作之间选择。

这个判断是本站的工程建议，不能代替真实任务评测。先整理几类有代表性的请求和失败案例，明确“完成”的业务条件，再选择编排方式。不要用组件数量衡量智能程度。

## 三种组织方式分别解决什么问题

Anthropic 的 cookbook 列出了提示链、路由、并行、协调者与子任务、评估者与优化者等示例。这份目录说明可选模式，并没有证明某个模式对所有任务更好。提示链适合前一步产物就是后一步输入；路由适合类别明确、不同类别走不同流程；并行适合子任务可以独立计算、随后合并。

Agent loop 则反复执行“观察当前状态—选择动作—执行—接收结果”。OpenAI Agents SDK 的运行文档给出了具体行为：工具调用结果加入输入后继续循环；交接会更换当前 Agent；识别到最终输出后结束。文档还提供 `max_turns` 限制。这里的“最终输出”是 SDK 的终止判定，不能直接等同于工单已经解决或外部系统已经更新成功。

长时间任务还需要运行基础设施。LangGraph README 把持久执行、人工介入和记忆列为能力方向。它们解决任务中断、状态检查与跨步骤信息保留的问题；采用框架本身不会自动获得正确的业务判定。

## 一个可以逐步升级的客服设计

第一版把流程写清楚：校验工单编号，读取订单，检索相关规则，生成附来源的处理建议。缺信息就返回明确的待补充项。模型输出结构化字段，由程序检查订单归属、规则版本和必要字段。此时每一步失败都容易定位。

如果真实请求常常需要不同的查询次序，可以只把“信息调查”改为有界循环：允许查询订单、查规则和提出澄清；每轮保存选择、参数和结果；信息足够后输出建议。创建退款或改地址仍由明确的业务步骤承接，根据业务规则验证和确认。这样可以分别测量调查质量和实际执行结果。

```text
输入工单 → 校验范围 → 调查循环 → 生成建议
                         ↓           ↓
                      请求补充    业务校验 → 执行动作 → 核验结果
```

这是一份教学设计，不是已经验证过的生产案例。具体工具数量、轮数和人工介入点，应由你的权限模型、延迟预算和历史工单决定。

## 给自主决策设置可观测的边界

轮数只是一个上限。长耗时工具可能一轮就耗尽时间，多次检索也可能消耗大量费用。建议同时记录墙钟时间、模型用量、工具耗时和失败次数，并定义何时降级为“需要人工处理”。错误信息应帮助下一轮修正参数，而不是只返回模糊的“失败”。

有副作用的动作要有独立执行记录。比如同一退款请求在网络超时后重试，应先查询原请求状态，或使用业务幂等键；不能因为模型说“上次可能失败”就再次发起。恢复工作流与避免重复扣款是两个需要分别验证的能力。

评估时对比同一任务集上的固定流程和循环方案：看正确完成数、错误动作数、人工接管原因、延迟与费用分布。保存失败轨迹，区分知识缺失、工具契约不清和决策失误。若循环增加了成本却没有解决明确的失败类型，就保留较简单的流程。

## 实施前的检查清单

- 为每类任务写出可执行的完成条件，外部动作以系统状态为准。
- 标出必须固定的业务步骤，以及确实需要动态选择的调查步骤。
- 定义工具输入、错误分类、权限和重复执行规则。
- 为循环设置轮数、时间和费用上限，并提供可解释的退出状态。
- 用同一组任务验证收益；框架示例与演示不能替代你的业务验收。

## 原始资料

本文由 Codex 辅助整理，资料行为与工程建议已在正文中区分；未报告未经执行的实验数据。以下链接固定到核查时的提交，API 使用前仍应核对项目当前版本。

- [Anthropic：Building Effective Agents Cookbook](https://github.com/anthropics/anthropic-cookbook/blob/ce8b2629efe8b24048b127b4c79af1e9cbab93d4/patterns/agents/README.md)，查看模式目录。
- [OpenAI Agents SDK：Running agents](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/running_agents.md)，查看 The agent loop 与运行配置。
- [LangGraph README](https://github.com/langchain-ai/langgraph/blob/08a2016953789a4f579b4d36bd1967941ec62012/README.md)，查看 Why use LangGraph。

## 来源核查记录

- [Building Effective Agents Cookbook](https://github.com/anthropics/anthropic-cookbook/blob/ce8b2629efe8b24048b127b4c79af1e9cbab93d4/patterns/agents/README.md)：模式目录 Basic Building Blocks / Advanced Workflows
- [OpenAI Agents SDK — Running agents](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/running_agents.md)：Runner lifecycle and configuration / The agent loop
- [LangGraph README](https://github.com/langchain-ai/langgraph/blob/08a2016953789a4f579b4d36bd1967941ec62012/README.md)：Why use LangGraph?
