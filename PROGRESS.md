# 开发进度

开发分支：`work`，远端：`origin/work`。提交标题可用于 `git log --oneline --all` 定位；“本提交”的 SHA 在后续阶段补录。

| 阶段 | 状态 | 提交 | 验证 |
|---|---|---|---|
| 01 初始化与基础页面 | 已推送 | `62facd6` | 类型检查、生产构建 |
| 02 Prisma/SQLite、标准迁移、种子库 | 已完成，随本提交推送 | `feat: add core schema and curated seed data` | 迁移成功；51主题、27资料、12来源；重复seed无重复 |
| 03 技术地图、主题/文章、搜索 | 开发完成，正在浏览器验收 | 待提交 | 类型检查通过 |
| 04 编辑与审核发布闭环 | 开发完成，正在浏览器验收 | 待提交 | 鉴权单测通过 |
| 05 采集、AI草稿、时间线与文档 | 待验收 | 待提交 | 采集与AI模块10项测试通过 |

## 实现与限制

- 数据模型包含 Topic、Article、Source、Organization、Person、EngineeringCase、Relation、IngestionJob，另设多对多与来源链接表。
- Prisma 6 使用官方 JavaScript Schema Engine 与 libSQL adapter，无需被本环境拦截的原生引擎下载。保留数据库迁移与安装校验。
- 真实外网元数据采集受当前环境 DNS 限制；手工元数据与批量导入可用。RSS parser已验证，实时公网同步尚未验证。
- 部分资料域名被环境策略拦截，种子条目采用已知公开链接和原创中文导读；无法逐条现场核对发布日期。源码和内容版权分离。

下一步：完成浏览器编辑闭环与响应式验收，继续按模块提交推送。
