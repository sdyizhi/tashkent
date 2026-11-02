# Tashkent

WinXP 风格 AgentOS 工作台。外观与交互复刻 Windows XP 经典桌面，底层是 Agent + LLM + Harness + Tools。

每个「应用程序」本质上是一个 Agent：双击桌面图标打开窗口，窗口背后运行着 `Agent + LLM + 工具集` 的执行链路；Agent 对桌面的所有影响都通过 SSE 事件流回写，前端只是服务端权威状态的镜像。

## 快速开始

```bash
cp .env.example .env    # 填入 LLM_API_KEY
docker compose up -d
```

打开 http://localhost:8080 —— 后端在所有 `/api` 路由之后托管 `apps/desktop/dist`，根路径直接返回 XP 桌面。

未配置 `LLM_API_KEY` 时服务仍可启动，界面正常渲染，仅对话不可用（`/api/health` 返回 `degraded`）。配置了密钥时，健康检查会做一次带 3 秒超时的轻量真实探测（结果缓存 30 秒），探测失败同样返回 `degraded`。

## 本地开发

```bash
pnpm install
pnpm dev:server     # 后端 :8080
pnpm dev:desktop    # 前端 :5173（代理 /api 到 8080）
```

开发态前端跑在 Vite dev server 上；生产态后端直接托管 `apps/desktop/dist`，两者共用同一套 API。

## 测试

```bash
pnpm -r typecheck                     # 类型检查（shared / server / desktop）
pnpm -r test                          # 单元 + 集成测试
pnpm --filter @tashkent/desktop test:e2e   # 端到端（需先起后端 :8080）
powershell -ExecutionPolicy Bypass -File scripts\smoke.ps1   # 冒烟（需先起后端 :8080）
```

当前测试规模：后端 **247** 个用例、前端 **246** 个单元用例、**37** 个 Playwright E2E 用例。

### 冒烟脚本

`scripts/smoke.ps1` 依次验证：健康检查（DB 可用）→ Agent 列表非空 → 工具列表与权限分级 → 创建会话 → SSE 事件流可建立并收到事件 → 桌面窗口 API → 前端静态资源托管。全部通过时输出 `SMOKE PASSED`。

无 Docker 的环境可用 `scripts/simulate-runtime.ps1` 走等价路径验证运行期：它按 Dockerfile 的 runtime 阶段复刻目录结构与生产依赖安装，启动 `node apps/server/dist/index.js` 后跑同一个冒烟脚本。

## 授权确认流程

工具权限分三级，决策**始终在服务端做出**：

| 级别 | 行为 |
|---|---|
| `safe` | 直接执行，不打扰用户 |
| `write` | 首次执行前弹窗确认；用户勾选「记住此工具的授权」后本次运行内不再询问 |
| `dangerous` | **每次**执行都弹窗确认，不记忆 |

闭环流程：

1. 服务端执行 `write` / `dangerous` 工具前生成 `authorizationId`，把该次调用挂起（默认超时 5 分钟，超时按拒绝处理）；
2. 服务端广播 `authorization_required` 事件（携带 `authorizationId` / `toolName` / `args` / `reason`）；
3. 前端弹出 XP 风格「授权确认」对话框，展示工具名与参数；
4. 用户点「同意」或「拒绝」，前端调用 `POST /api/tools/:name/authorize`，携带 `authorizationId` + `approved` + `remember`；
5. 服务端校验 `authorizationId` 与工具名一致后放行或拒绝，解除挂起。

服务端只认自己发出的 `authorizationId`，不接受前端自述的「已授权」标记。

`http.get` / `http.post` / `shell.exec` 为 `dangerous` 权限；`shell.exec` 另有总开关 `SHELL_ENABLED`（默认关闭）与命令白名单 `SHELL_ALLOWED`。

## 运维加固（M7）

### 口令保护

设置 `AUTH_PASSWORD` 后启用口令 + 会话 Cookie；**不设置时保持完全开放**（本地开发便利）。

```bash
AUTH_PASSWORD=你的口令
AUTH_COOKIE_SECRET=任意长随机串   # 签名 Cookie 用；不设置则进程内随机生成（重启后旧会话失效）
```

- 登录接口：`POST /api/auth/login`，body `{ "password": "..." }`
- 成功后下发 `tashkent_session` Cookie（`HttpOnly` + `SameSite=Lax`，默认 7 天有效）
- 口令与 Cookie 签名都用 `timingSafeEqual` 比较，防时序攻击
- 未登录访问受保护接口返回 401；前端检测到 401 会弹出 XP 风格登录框，登录成功后自动进入桌面
- 免鉴权路径：`/api/health`、`/api/auth/login`、`/assets/`（前端产物必须能加载，否则看不到登录框）

### 限流

`POST /api/sessions/:id/messages` 按 IP 限流，默认 **10 次/分钟**（`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` 可调）。
超限返回 429 + `Retry-After` 头。计数表按固定周期清理过期记录，长时间运行不会无限增长。

### Prometheus 指标

设置 `METRICS_ENABLED=true` 后暴露 `GET /api/metrics`（Prometheus 文本格式，零额外依赖）：

| 指标 | 标签 | 含义 |
|---|---|---|
| `tashkent_runs_total` | `status` | Agent 运行总数（ok / error） |
| `tashkent_tool_calls_total` | `tool`, `ok` | 工具调用总数 |
| `tashkent_tool_duration_seconds` | `tool` | 工具执行累计耗时 |
| `tashkent_llm_tokens_total` | `direction` | LLM token 用量（input / output） |
| `tashkent_active_sessions` | — | 当前活跃会话数 |

### 备份与恢复

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1                    # 打包 data 目录到 backups/
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -Backup backups\tashkent-backup-2026-11-02-120000.tar.gz
```

备份内容为整个 `data` 目录（SQLite 主库 + WAL 文件、workspace、artifacts）。恢复脚本会先把现有 `data` 另存为 `data.bak-<时间戳>`，解压失败会自动回退。

### 压测

```powershell
node scripts\loadtest.mjs --base http://127.0.0.1:8080
```

三个阶段（健康检查 → 建会话 + 发消息 → 开窗口 + 关窗口），输出 P50 / P95 / P99 延迟与错误率。只用 Node 内置 `fetch`，不引新依赖。

## 性能数据

2026-11-02 在 Windows 11 / Node 24.14 / 单进程本地环境实测（`node scripts/loadtest.mjs`，并发 20）：

| 阶段 | 请求数 | 错误率 | P50 | P95 | P99 |
|---|---|---|---|---|---|
| 健康检查 | 100 | 0.00% | 15 ms | 35 ms | 36 ms |
| 会话 + 消息 | 30 | 0.00% | 18 ms | 90 ms | 96 ms |
| 窗口开关 | 21 | 0.00% | 8 ms | 10 ms | 11 ms |

整体错误率 0.00%。注意：这些数字测的是 API 层的往返延迟，**不含 LLM 响应时间**（环境无有效 API key，Agent 链路未纳入压测）。

## 目录

- `apps/server` — Hono + AI SDK v7 + SQLite 单进程运行时
  - `src/agent/` — Agent 注册表、Runner、Provider 适配层、工具注册表与执行器
  - `src/tools/` — 内置工具（fs / datetime / calc / http / shell / desktop）
  - `src/services/` — 窗口服务、授权服务
  - `src/middleware/` — 口令保护、限流
  - `src/routes/` — HTTP 路由
  - `src/lib/` — 配置、日志、事件总线、指标收集器
- `apps/desktop` — React + Vite 桌面 Shell
  - `src/shell/` — 桌面外壳、任务栏、开始菜单
  - `src/apps/` — 七个应用视图（对话 / 我的文档 / 记事本 / 浏览器 / 命令提示符 / 控制面板 / 任务管理器）
  - `src/components/` — 通用 XP 控件（对话框、授权框、登录框、自绘图标）
  - `src/windows/` — 窗口状态机
  - `src/state/` — 桌面 store、SSE 接入、授权状态
- `packages/shared` — 前后端共享类型与设计令牌
- `scripts/` — 冒烟、备份 / 恢复、压测、运行期模拟

## 配置

全部配置项见 `.env.example`，均带默认值。关键项：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | HTTP 监听地址 |
| `LLM_API_KEY` | 空 | 模型服务密钥，填入才能对话 |
| `LLM_BASE_URL` | 空 | 自定义模型端点（兼容 OpenAI 协议的服务） |
| `LLM_MODEL` | `gpt-4o-mini` | 默认模型 id |
| `MAX_STEPS` | `8` | 单次运行的工具调用轮数上限（agent 可用 `maxSteps` 覆盖） |
| `MAX_INPUT_TOKENS` | `120000` | 上下文窗口预算（裁剪计算用，预留 25% 给输出） |
| `CONTEXT_KEEP_TURNS` | `20` | 保留的最近完整对话轮数 |
| `TOOL_RESULT_MAX_BYTES` | `8192` | 单个工具结果的截断阈值 |
| `ALLOWED_DOMAINS` | 空 | `http.*` 工具的域名白名单，支持 `*.` 前缀 |
| `SHELL_ENABLED` | `false` | `shell.exec` 总开关 |
| `WORKSPACE_DIR` | `data/workspace` | Agent 可读写的沙箱根目录 |
| `DB_FILE` | `data/tashkent.db` | SQLite 文件路径 |
| `METRICS_ENABLED` | `false` | 是否暴露 `/api/metrics` |
| `AUTH_PASSWORD` | 空 | 设置后启用口令保护；不设置则完全开放 |
| `AUTH_COOKIE_SECRET` | 空 | 会话 Cookie 签名密钥；不设置则进程内随机生成（重启后旧会话失效） |
| `AUTH_SESSION_TTL_MS` | `604800000`（7 天） | 会话有效期 |
| `RATE_LIMIT_WINDOW_MS` | `60000` | 限流窗口长度 |
| `RATE_LIMIT_MAX` | `10` | 限流窗口内允许的最大请求数 |

## 容器镜像

`Dockerfile` 为两阶段构建：

- **build**：`node:22-bookworm-slim` + `python3 make g++`，装全量依赖后构建 shared / desktop / server；
- **runtime**：同为 `node:22-bookworm-slim`，装 `libstdc++6`（`better-sqlite3` 原生二进制的运行时依赖）与 `tini`，只装 `@tashkent/server` 的生产依赖并拷贝编译产物。

用 glibc 而非 alpine：`better-sqlite3` 的 prebuilt 二进制链接 `libstdc++` 与 `GLIBCXX_3.4.29`，musl libc 无法加载。

## 已知状态

- 容器镜像构建**未经实机验证**（开发环境无 Docker）。运行期逻辑通过 `scripts/simulate-runtime.ps1` 的等价路径验证；glibc 侧的系统库依赖只做了静态审查。
- **没有可用的 LLM key**：真实 Agent 链路（模型响应 → 工具调用 → 授权弹窗）未经端到端验证。相关 E2E 用例改为拦截 `/api/events` 注入真实 SSE 帧来验证链路本身。
- 浏览器应用的 iframe 预览受目标站点 `X-Frame-Options` 限制，多数站点拒绝嵌入 —— UI 会如实提示并提供「在新窗口打开」。
- 命令提示符依赖 `SHELL_ENABLED=true` 与 `SHELL_ALLOWED` 白名单，默认关闭时 UI 如实提示「shell 工具未启用」。
- 压测数据只覆盖 API 层往返延迟，不含 LLM 响应时间（原因同上）。
- 口令保护是**单口令**模型：没有用户体系、没有多租户、没有审计日志。

详细架构见 `docs/superpowers/specs/2026-10-27-winxp-agentos-architecture-design.md`，实施计划见 `docs/superpowers/plans/2026-10-28-tashkent-m0-m4-core.md` 与 `docs/superpowers/plans/2026-11-02-tashkent-m5-m7.md`。
