# 在 Render 发布完整网站

仓库的 [render.yaml](../render.yaml) 为完整 Next.js 应用准备了一个 Docker Web 服务和持久 SQLite 磁盘。读者页面、搜索、知识图谱、阅读库和编辑后台都由这个服务提供。当前文件是可部署配置，不代表 Render 账户中已经创建服务或已有公网网址。

## 首次发布

1. 登录 [Render Dashboard](https://dashboard.render.com/)，连接可以访问 `Ohmakabaka/agent-atlas` 的 GitHub 账号。如果仓库为私有，在 GitHub 授权中包含这个仓库即可。
2. 选择 **New → Blueprint**，选择仓库、`work` 分支和根目录的 `render.yaml`。本轮代码在 `work`；不要使用尚未包含这些改动的 `main`。
3. 检查预览：一个 `agent-atlas` Docker Web 服务、Starter 规格、1 GB 持久磁盘和 `/api/health` 健康检查。服务和磁盘均可能计费，以 Render 创建页面显示的当前报价为准；这是需要账户所有者确认的实际收费步骤。选好区域后创建，等待部署变为 Live。
4. 使用控制台展示的真实 `https://…onrender.com` 地址打开网站。在服务的 **Environment** 中查看私密的 `ADMIN_PASSWORD`，用它登录 `/admin`。`SESSION_SECRET` 也由 Render 自动生成，无需手工填写或发到聊天中。保存好管理员口令，首次登录后可以在 Environment 中更换；更换会使旧登录失效。

镜像在运行时执行 `npm run db:init`：应用数据库迁移并追加仓库中的初始化内容，再启动服务。构建和运行不需要模型 API 密钥，也不会上传开发环境的 `.env` 或本地数据库。已有数据库条目不会被 seed 覆盖。

Render 提供 `RENDER_EXTERNAL_URL`，应用在未显式配置 `SITE_URL` 时将其用于 canonical、站点地图和 RSS，因此首个分配域名即可正常使用。平台服务名可能被占用，以控制台实际分配的网址为准。

## 配置与费用边界

| 配置                               | 蓝图默认值与用途                                                      |
| ---------------------------------- | --------------------------------------------------------------------- |
| `plan: starter`                    | 支持持久磁盘的入门付费实例；创建前确认平台当前规格与价格              |
| `numInstances: 1`                  | 单实例 SQLite；不要直接扩为多个 Web 实例                              |
| `/app/storage`                     | 持久磁盘挂载点，数据库为 `atlas.db`；应用的 `/app/data` 另存种子 JSON |
| `ADMIN_PASSWORD`、`SESSION_SECRET` | 由 Render `generateValue` 创建的私密环境值；不写入 Git                |
| `AI_API_KEY`                       | 空值；网站不自动调用付费模型服务                                      |
| `ALLOW_INSECURE_ADMIN_COOKIE`      | `false`；通过平台 HTTPS 访问后台                                      |
| `TRUST_PROXY`                      | `false`；不假设 Render 转发头是已验证的单一客户端 IP                  |
| `autoDeploy: false`                | 推送代码后由控制台手动部署，便于先备份与核对内容                      |

现阶段通过 Codex 会话整理内容，再随代码发布；这使用当前 Codex 会话额度。部署后的 Web 服务无法把 Codex 登录额度当成模型 API Key。若将来需要网站自行生成导读，再单独配置模型提供商、API 凭证和费用限额。

此蓝图不创建独立采集 worker：Render 的不同服务不能共享同一个持久磁盘。前期可在后台手动同步来源，或在该 Web 服务 Shell 中运行已有的 `npm run ingest -- --source source-mcp-sdk --force`。需要持续调度时，应在同一实例内管理工作进程，或先迁移为支持多服务的共享数据库，再设计独立 worker；不能直接给第二个服务挂同名新盘来假装共享 SQLite。

## 发布验收

使用控制台中的真实地址检查：

- 首页、任一主题、资料、探索、图谱和阅读库均能访问。
- `/api/health` 返回 HTTP 200 与 `{"status":"ok","database":"ready","schema":"current"}`。
- `/sitemap.xml` 和 `/feed.xml` 使用实际 Render 地址，没有 localhost 或示例域名。
- `/admin` 需要登录；能新建一条待审核资料、编辑并发布，然后在前台找到它。
- 在控制台重启一次服务，确认该条资料和编辑历史仍在。

保留验收资料或在后台归档即可。不要对正式数据库运行仓库的自动 E2E 脚本，因为这些脚本会建立和清理测试记录。

## 绑定自己的域名

在 Render 的服务设置中添加 Custom Domain，按控制台提示配置 DNS，等待 HTTPS 证书就绪。随后在 Environment 设置 `SITE_URL=https://你的实际域名` 并重新部署；显式 `SITE_URL` 优先于平台域名。再次核对 canonical、RSS 和 sitemap。不要提前填入尚未归属或尚未完成配置的域名。

## 后续更新与备份

每个完成的模块继续 commit / push 到 `work`。网站升级前，在 Render 服务 Shell 的 `/app` 下执行在线一致性备份，例如：

```bash
mkdir -p /app/storage/backups
npm run db:backup -- "/app/storage/backups/atlas-$(date -u +%Y%m%dT%H%M%SZ).db"
```

通过自己控制的受保护通道把备份另存到独立存储。与主数据库在同一磁盘的副本只方便短期恢复，删除服务或磁盘时也可能一起丢失。备份文件包含后台内容与审计记录，不要提交 Git、放进公开目录或公开下载地址。

备份后在服务控制台选择 **Manual Deploy → Deploy latest commit**，确认部署分支仍为 `work`。启动时会应用已提交的迁移并保留现有编辑。更改现有初始化条目不会覆盖线上数据，需要通过后台修订或使用专门的数据迁移。升级完成再检查健康、最新内容和登录。

有持久磁盘的单实例升级可能短暂不可用；不要承诺无停机切换。应用代码回滚也不会自动回滚数据库。数据库恢复须先停止全部写入进程，并按 [运维指南](operations.md#离线恢复)执行离线恢复；不要在仍运行 Web 的普通 Shell 中直接加 `--offline` 参数替换数据库。

## 当前验证范围

本仓库已有 Docker 容器的启动、持久数据、健康检查和编辑流程验证。此次新增的 Render 域名回退有独立测试，蓝图可在本地解析并检查必要字段。

开发环境尚未连接 Render 账户，且当前网络策略阻止访问 `render.com` 的官方文档和 Blueprint 校验接口。因此没有在 Render 创建资源、取得真实网址、验证磁盘挂载权限或完成云端部署。最终蓝图接受情况、实例价格、磁盘权限和公网行为，以 Render 控制台的预览与上述实际验收为准；遇到错误保留脱敏日志即可继续排查，不要关闭 TLS 或把密钥发到聊天中。

官方参考：[Blueprint 规范](https://render.com/docs/blueprint-spec)、[持久磁盘](https://render.com/docs/disks)、[Docker 部署](https://render.com/docs/docker)、[环境变量](https://render.com/docs/configure-environment-variables)。
