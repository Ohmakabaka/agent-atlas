# 生产部署、健康检查与数据恢复

Agent Atlas 面向单实例、小团队内容编辑运行。Web 与可选采集 worker 共享一个持久 SQLite 文件；不要求云数据库、模型密钥或外部身份服务。多实例部署前，需要迁移共享数据库并重新验证锁、限流和备份策略。

## Docker Compose

需要 Docker Engine 与 Compose v2。首次部署：

```bash
cp .env.example .env
# 编辑 .env：设置 ADMIN_PASSWORD、SESSION_SECRET、SITE_URL
# ADMIN_PASSWORD 至少12字符，SESSION_SECRET 至少32字符。
docker compose up -d --build
```

`.env` 只由 Compose 读取运行配置，不会被复制进镜像；数据库挂载到命名卷 `atlas-data`。镜像以非 root 用户运行，启动时执行幂等数据库初始化和迁移，随后启动 Web。镜像保留 Prisma CLI 与 tsx，以支持迁移、备份和可选 worker。

默认只将 Web 暴露到主机 `127.0.0.1:3000`。正式访问应通过主机上的 HTTPS 反向代理，保留默认 Secure Cookie；`ALLOW_INSECURE_ADMIN_COOKIE=true` 仅限本机 HTTP 验收。默认按签名的匿名 HttpOnly 客户端 cookie 区分登录来源，不信任转发 IP。仅同时设置 `TRUST_PROXY=true` 和 `TRUSTED_CLIENT_IP_HEADER=x-real-ip` 才接受反向代理写入的单一 IP；不接受逗号链。入口代理必须删除客户端自带的该头并覆盖，且用户不能绕过代理直接访问应用。不要把未校验的转发头当成可信用户身份。

登录限流持久存储于数据库：每客户端十分钟最多十次，另有全局十分钟三百次上限。公网部署仍建议保护 `/admin` 入口。更换 `ADMIN_PASSWORD` 或 `SESSION_SECRET` 都会使已有会话失效。登录成功、失败、限流和登出会记入审计，不记录明文口令、IP 或 cookie。

开启持续采集：

```bash
docker compose --profile sync up -d
```

worker 等待 Web 健康后启动，共享数据库与持久租约，按来源间隔检查 RSS/Atom。`INGESTION_POLL_SECONDS` 控制循环间隔（默认60秒），完整一轮结束后再等待，不重叠启动。每来源的 `syncIntervalMinutes` 控制到期时间；SIGTERM/SIGINT会停止后续工作并在当前有限时长请求完成后释放租约。首次启用前在后台维护真实 feed 地址；发现的内容进入审核队列，不自动发布。它不依赖容器内部 cron。

查看状态：

```bash
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
docker compose logs --tail=100 web worker
```

`/api/health` 成功返回 `{"status":"ok","database":"ready","schema":"current"}`。数据库不可读、迁移失败或存在未应用迁移时返回 HTTP 503；响应不包含路径、凭证或内部错误。不要将该检查替代编辑流程验收。

升级：先备份，再拉取代码、执行 `docker compose up -d --build`，确认健康、公开页面与编辑流程。发布前应在隔离环境验证数据库迁移；自动迁移不会自动为你创建跨版本回滚方案。

## 普通 Node.js 服务

使用 Node.js 24 LTS；备份工具使用 Node 的 SQLite online backup API。以项目根目录作为工作目录，数据库路径应放在持久磁盘。

```bash
npm ci
npm run db:init
npm run build
npm start
# 另一个受进程管理器管理的进程：
npm run worker
```

使用 systemd 等进程管理器自动重启。不要并行启动多个不受协调的迁移进程。停止服务时给 Web 与 worker 留出完成当前事务、释放租约的时间。

## 在线一致性备份

数据库备份是用户数据操作，不是 Git 备份。编辑内容、审核历史、任务和来源配置都在 SQLite 中；`data/` 只是初始化内容。

```bash
mkdir -p /srv/atlas-backups
npm run db:backup -- /srv/atlas-backups/atlas-2026-11-14.db
```

备份使用 SQLite online backup API，包含已提交 WAL 数据，允许 Web 正常运行。目标不能已存在，文件权限设为 `0600`。发布备份前验证数据库完整性、外键及版本化迁移校验和，不采用运行时简单复制单个 `.db` 文件的方法。

当前工具仅支持本地 SQLite `file:` URL。迁移到其他数据库后，应使用该数据库的官方备份工具。应将成功备份复制到独立存储，并按运营策略轮换、加密和测试恢复。

Compose 中可导出到主机：

```bash
# 容器 /app/storage 备份路径必须唯一，避免覆盖。
docker compose exec web npm run db:backup -- /app/storage/export-backup.db
docker compose cp web:/app/storage/export-backup.db ./atlas-backup.db
# 确认主机副本保存成功后，可单独删除容器内这份导出副本。
```

## 离线恢复

恢复会替换当前数据库，因此工具强制要求 `--confirm --offline`。`--offline` 是操作员确认所有 Web、worker、CLI 写入进程已停止；工具不会自动停止服务，也无法可靠识别机器外的所有连接。

```bash
# 先停止自己管理的全部 Web/worker 进程
npm run db:restore -- /srv/atlas-backups/atlas-2026-11-14.db --confirm --offline
npm run db:migrate
npm start
```

恢复前验证备份为 Agent Atlas 数据库，迁移必须是当前代码已知、连续且校验和一致的版本。未知新版本、失败迁移、损坏文件、目录、符号链接和同源目标会被拒绝。

原数据库及其 WAL/SHM 文件先保存到旁边的 `*.before-restore-*` 私有目录，并逐文件比较 SHA-256。即使当前数据库已经损坏，也保留原始文件供排查。该保留目录标注为未验证原始状态；不能把它当成通过一致性检查的在线备份。

备份快照写入临时文件并校验后，原子替换目标数据库。恢复完执行 `npm run db:migrate`，再启动服务，检查 `/api/health`、资料数量、最近编辑、登录与发布流程。旧版本备份允许有待应用的已知迁移，但应用必须在启动前补齐。

Compose 恢复示例：

```bash
docker compose --profile sync stop web worker
# 将备份以只读方式挂载到一次性容器，执行离线恢复。
docker compose run --rm --no-deps -v "$PWD/atlas-backup.db:/restore/backup.db:ro" web \
  npm run db:restore -- /restore/backup.db --confirm --offline
docker compose up -d
# 如使用持续采集：
docker compose --profile sync up -d
```

不要执行 `docker compose down -v` 来重启服务；`-v` 会删除持久数据卷。

## 网络出口与模型服务

公网采集需要正常 DNS 与 HTTPS 出口。受控代理环境遵循采集模块的显式受信主机配置，不通过关闭 TLS、允许私网地址或取消重定向检查来修复网络错误。Compose 支持显式环境配置中的代理变量；普通部署留空即可。需要代理时请用受保护的环境配置或 Compose override 传入 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 与精确主机白名单 `INGESTION_PROXY_HOSTS`。需要增补可信根证书时使用 `INGESTION_CA_FILE` 或受支持的 Node/系统证书变量，并以只读方式挂载证书，保留正常 TLS 验证。

构建经过企业代理且需要增补根证书时，Dockerfile 支持临时 BuildKit secret，证书不会复制到镜像层：

```bash
docker build --secret id=proxy_ca,src=/可信路径/proxy-ca.pem -t agent-atlas:local .
docker compose up -d --no-build
```

只从可信环境管理方获取该证书，不使用 `strict-ssl=false` 或 `NODE_TLS_REJECT_UNAUTHORIZED=0`。构建期证书不代替运行期只读证书挂载。

无 `AI_API_KEY` 时，收录、编辑、搜索和发布均可使用。接入模型后还应在部署环境实际测试一个草稿请求，并核对请求目标、费用和人工审核流程。
