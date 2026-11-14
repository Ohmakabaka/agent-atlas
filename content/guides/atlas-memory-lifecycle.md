# 长期记忆不是聊天记录备份：设计可更新、可检验的记忆生命周期

从生成式智能体的检索与反思实现、Reflexion 的反馈策略出发，用项目助手的例子区分任务状态、事实和推断，建立写入、检索、纠错、删除与评估的闭环。

作者：Agent Atlas · Codex 辅助整理

来源核查日期：2026-11-14

本篇为 Codex 会话辅助撰写的原创技术指南；已核对列出的来源，未标注为人工审核。工程建议与来源陈述应分开理解。

## 从“存下来”转向“何时再次使用”

长期记忆的价值取决于下一次任务能否取回正确的信息。把每轮聊天全部保存，解决了持久化，却没有解决事实冲突、陈旧内容和上下文预算。一个项目助手即使记得全部讨论，也可能仍把已经撤销的上线日期当作最新计划。

本文借两组公开实现说明思路：Generative Agents 的代码组合近期性、重要性与相关性进行检索，并把反思和证据节点关联；Reflexion 的仓库提供不使用反馈、使用上次轨迹、使用自我反思以及组合使用的实验策略。这些研究给出了可以比较的机制，不构成任意业务场景的效果保证。下述项目助手设计是本文的工程建议。

## 先给记忆分工，再决定写入

项目助手可以把内容分成三类。**任务状态**记录当前阶段、已完成动作和下一步，用数据库或显式状态文件保存。**可复用事实**记录用户明确给出的偏好、项目约束与确认过的决定。**推断与经验**保存模型对失败原因的分析，保留“待验证”属性，不能自动升级成事实。

例如，“暂定周五上线”应带有暂定状态和来源消息；后续“审批未过，改为下周二”建立新记录并取代旧计划。检索结果应优先返回当前有效决定，同时允许在追溯时找到历史。单纯更新一段自由文本虽然省事，却容易丢掉谁改了什么、为什么改。

每条候选记忆至少需要内容、来源引用、作用范围、记录时间、有效状态和版本。涉及时间的内容还应区分事件发生时间与写入时间；两者并不总相同。只有对后续任务有明确用途的信息才进入长期存储，临时工具日志可以使用更短的保留期。

## 检索先限定范围，再做排序

Generative Agents 的 `new_retrieve` 对记忆节点计算近期性、重要性和语义相关性，归一化后合成排序分数。值得学习的是多种信号的组合，不是照搬代码中的权重；该实现服务于特定的角色模拟环境。

业务系统可以先按用户、项目和权限限定候选集，再剔除撤销或过期内容，最后按当前问题排序。询问“项目现在何时上线”时，最新确认决定通常比多次重复的旧讨论更有价值；询问“为何改期”时，则需要变化记录与依据。两种任务不应强行共用相同的召回目标。

给模型的结果应附上来源与适用范围，并在预算内选择少量互补证据。若没有足够信息，应返回缺失状态并继续检索或询问用户。把低相关记录塞满上下文，会增加模型采纳错误信息的机会，不能仅凭召回条数判断质量。

## 整合、纠错和删除一起设计

原始事件积累后，可以生成较短的阶段总结，但要保留总结引用的原始记录。Generative Agents 的反思实现会把生成的想法关联到证据节点，这提供了追溯的具体例子。应用中的摘要同样应该允许展开依据，避免下一次摘要只引用上一次摘要而逐渐失真。

当用户纠正计划时，先更新事实记录，再使相关检索索引和摘要失效或重建。删除也要覆盖派生表示：仅删原始消息而保留向量、缓存与总结，仍可能在下一次回答里重现该内容。必要的操作审计可保留不含正文的标识与时间，具体保留规则由产品场景确定。

Reflexion 的不同反馈策略还提醒我们，保存“经验”并非越多越好。错误反思会把偶然失败概括为长期规则，因此应保留任务条件和失败证据，并允许经验被后续验证推翻。

## 用小型回归集验证闭环

为项目助手固定一组跨会话任务：恢复项目约束、识别已变更日期、回答同名不同项目的问题、拒用已删除记忆，以及在信息不足时承认缺失。分别运行无记忆、仅最近对话和检索记忆三种方案，保持模型与任务条件一致。

除了最终答案，记录相关证据是否进入上下文、是否采用了过期事实、是否串用另一项目资料，以及每次任务的时延与上下文用量。这样才能区分“没有找到”“找到了却没用对”和“记忆本身错误”。先修正具体失败，再决定是否增加反思步骤或更复杂的索引。

## 原始资料

- [Generative Agents：多信号记忆检索实现](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/retrieve.py)。
- [Generative Agents：反思生成与证据关联实现](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/reflect.py)。
- [Reflexion：反馈策略、任务设置与实验运行说明](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/README.md)。

## 来源核查记录

- [Generative Agents · Retrieve module](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/retrieve.py)：extract_recency；extract_importance；extract_relevance；new_retrieve
- [Generative Agents · Reflect module](https://github.com/joonspk-research/generative_agents/blob/fe05a71d3e4ed7d10bf68aa4eda6dd995ec070f4/reverie/backend_server/persona/cognitive_modules/reflect.py)：generate_insights_and_evidence；run_reflect
- [Reflexion README](https://github.com/noahshinn/reflexion/blob/218cf0ef1df84b05ce379dd4a8e47f17766733a0/README.md)：Reflexion Strategies；To Run: decision-making (AlfWorld)；Another Note
