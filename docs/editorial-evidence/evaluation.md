# 评测与可靠执行内容核查记录

核查日期：2026-11-14。内容由当前 Codex 会话基于实际读取的公开资料整理，没有调用网站模型 API，也没有声称已经人工审核。下表只记录核查范围与文件摘要，不保存第三方全文。

| 来源 | 已核查位置 | 文件 SHA-256 |
| --- | --- | --- |
| [SWE-bench README](https://github.com/SWE-bench/SWE-bench/blob/02e7a74ffd0b707aab73d203fe87bdc7c76afc8e/README.md) | Overview / Set Up / Usage / Result Caching | `06841624d7b5130dfe3cc6714642e9a8fd2a608c95c66ae0180e409f12b73aaa` |
| [WebArena README](https://github.com/web-arena-x/webarena/blob/dce04686a56253aefba7b18a4fa0937cf1dc987b/README.md) | End-to-end Evaluation：自行部署评测网站及重置环境 | `081c826497f9b7da4952771ee128c2215ec3532379db0fe9f7fcbd899d9c9287` |
| [FastChat LLM Judge README](https://github.com/lm-sys/FastChat/blob/587d5cfa1609a43d192cedb8441cac3c17db105d/fastchat/llm_judge/README.md) | MT-Bench / Other grading options / Agreement Computation | `4104f9e877fe04a4a87a5b6618114adc8604f09ceca09be198f96189c4c2238e` |
| [LangGraph README](https://github.com/langchain-ai/langgraph/blob/08a2016953789a4f579b4d36bd1967941ec62012/README.md) | Why use LangGraph?：Durable execution / Human-in-the-loop / Comprehensive memory | `3a13e257af1216962d53d72414a7f44ac1fc5cea34d994bdff60ea2a3b045933` |
| [OpenAI Agents SDK — Running agents](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/running_agents.md) | Runner lifecycle and configuration / The agent loop / RunState input | `881e6986fde7e8143bbb722577a04ed169f49a5bdf3c64f29124a5ffc42fb7bf` |
| [OpenAI Agents SDK — Human-in-the-loop](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/human_in_the_loop.md) | How the approval flow works / Example: pause, approve, resume | `702808539e2143ad4e7d4a35f02e29ba00a83f7ca0cb912673ee6f869584ac01` |
| [OpenAI Agents SDK — Tracing](https://github.com/openai/openai-agents-python/blob/64fbde5d02b42ae5f9db668eb0184cdb3fc9d775/docs/tracing.md) | Traces and spans / Default tracing / Long-running workers and immediate exports | `32caacd2f435b2a2ea42a6c8f8916e64253b0915e56319e17f9e3e4bfe81dd9c` |

正文的来源描述限于上述实际读取部分。退款案例、评测工作流、幂等设计、审批参数与版本检查、故障演练属于明确标注的编辑建议，不是来源报告的实验结果。未复用原文性能数字，也未运行来源项目的模型评测。

核查期间发现 LangGraph 仓库旧路径 `docs/docs/concepts/durable_execution.md` 和 docs 仓库猜测路径 `src/oss/langgraph/durable-execution.mdx` 返回 404，已弃用这两条引用。最终引用都使用实际成功读取的 GitHub 提交固定链接；未访问或借道获取受网络策略阻止的网站。
