# 部署与发布

Agent Atlas 支持 Node.js 24+ 单实例服务或 Docker Compose。Web 和可选采集 worker 共享一个持久 SQLite 数据库。本文描述部署步骤；不代表项目已部署到某个公网域名。健康、备份、恢复的详细操作见 [operations.md](operations.md)。

## 先准备配置

首次复制 `.env.example` 到 `.env`，已有配置不要覆盖。设置至少 12 字符的 `ADMIN_PASSWORD`、至少 32 字符的 `SESSION_SECRET`，以及实际站点根地址 `SITE_URL`。凭证在运行时注入，构建不要求编辑口令，也不应把 `.env` 放进镜像。

正式站点使用 HTTPS；保留 Secure Cookie。`ALLOW_INSECURE_ADMIN_COOKIE=true` 只用于本机 HTTP 的生产构建验收。`SITE_URL` 未设置时，不生成虚假站点 canonical，RSS 返回不可用，sitemap 为空；不要把示例域名作为真实地址提交。

## Node.js 服务

以项目根目录为工作目录：

```bash
npm ci
npm run db:init
npm run typecheck
npm test
npm run build
npm start
```

默认端口为 3000，可用 `PORT` 调整。生产 `DATABASE_URL` 使用可写持久磁盘的绝对路径，例如 `file:/var/lib/agent-atlas/atlas.db`。用 systemd 等进程管理器维护 Web，并可另起 `npm run worker`。停止 worker 会停止后续任务、取消可取消的请求并释放租约。

`db:init` 是幂等初始化，不是重置：已应用迁移不重复执行，seed 不覆盖已有编辑。应用升级前先备份；不要对线上库执行未经审查的 reset。

## Docker Compose

Docker Engine 与 Compose v2 可用后：

```bash
docker compose up -d --build
curl --fail http://127.0.0.1:3000/api/health
# 可选：开启持续采集
docker compose --profile sync up -d
```

镜像使用 Node.js 24，以非 root 用户运行；默认端口只绑定主机回环地址，通过主机 HTTPS 反向代理提供公网访问。命名卷挂载到 `/app/storage`，不会遮蔽 `/app/data` 的种子 JSON。容器启动应用迁移与 seed 后再提供 Web。

反向代理应保留正确主机头。默认不信任转发 IP；只有入口代理删除并覆盖指定客户端 IP 头，且应用不能绕过代理访问时，才设置 `TRUST_PROXY=true` 与 `TRUSTED_CLIENT_IP_HEADER=x-real-ip`。客户端标识和限流规则详见运维指南。

升级前备份，拉取目标代码后执行 `docker compose up -d --build`。确认健康、最近内容、登录和编辑发布流程；使用持续采集时再检查 worker。不要用 `docker compose down -v` 重启，`-v` 会删除持久卷。

## 采集调度与出口

在后台维护来源 feed、启用状态与检查间隔。先单次验证：

```bash
npm run ingest -- --source source-mcp-sdk --force
```

成功后使用 `npm run worker` 或 Compose 的 `sync` profile 持续运行。worker 默认每轮完成后等待 60 秒，可用 `INGESTION_POLL_SECONDS` 调整；每个来源仍按自身间隔到期执行。手动“强制”检查忽略到期时间，但不会绕过来源租约。若使用外部 cron，应避免与多个迁移进程同时启动，并保留锁协调。

普通公网环境需要可用 DNS 和 HTTPS 出口。受控代理环境仅对 `INGESTION_PROXY_HOSTS` 精确允许的可信公开域名使用继承代理解析；代理必须阻止私网和保留地址。配置不会突破平台网络策略。企业 CA 必须通过受支持证书文件并在容器只读挂载，不能关闭 TLS 验证。代理构建的 BuildKit secret 用法见运维指南。

当前开发环境已经验证 GitHub MCP SDK Atom 的首次收录与后续 304；OpenAI feed 仍受域名策略限制。部署时应逐个验证所需来源；无新资料、空 feed 或本地 fixture 测试不等于公网源端到端成功。

## 发布前验收

```bash
npm run typecheck
npm test
npm audit
npm run build
```

按 [README 的隔离验收命令](../README.md#命令与验证)在独立测试数据库启动生产服务，执行 `npm run test:e2e`；服务与测试进程必须使用相同的 `DATABASE_URL`。该脚本会写入并清理测试内容，不应连接真实生产库。它覆盖公开探索、编辑、历史恢复、图谱、阅读库、站点索引和边界检查；以实际执行输出为准。

正式发布还应检查自己的 HTTPS、域名、持久磁盘、重启恢复、备份保留策略与来源出口。模型功能可选；接入真实模型后另外验证草稿请求、费用和人工审核，不能用协议测试代替真实服务验证。

## 故障定位

| 现象                    | 检查                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| `/api/health` 返回 503  | 数据库可读性、当前代码迁移是否已完成；检查服务日志而非公开响应寻找细节 |
| 后台无法登录            | 运行时凭证长度、HTTPS/Cookie、客户端与全局限流、受信代理设置           |
| 保存提示版本冲突        | 另一窗口已修改；保留当前输入，核对最新版本后重新编辑，不强行覆盖       |
| URL 只有链接            | 网络出口、DNS、源站策略；仍可手工编辑元数据                            |
| 采集没有运行            | 来源启用/feed/间隔、是否到期、是否有有效租约、worker是否运行           |
| feed地址变更后状态异常  | 检查任务记录；新地址需重新验证，不复用旧地址条件缓存                   |
| AI 不可用               | 可选凭证、公开 HTTPS 服务、模型名称及响应格式；人工流程不受影响        |
| seed 修订未覆盖已有内容 | 这是保护编辑的幂等行为，通过后台或审阅的数据迁移修改已有记录           |

公开 issue 前清除口令、Cookie、令牌、带凭据 URL 和个人信息。不得通过关闭验证或放开私网抓取消除报错。
