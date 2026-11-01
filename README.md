# Tashkent

WinXP 风格 AgentOS 工作台。外观与交互复刻 Windows XP 经典桌面，底层是 Agent + LLM + Harness + Tools。

每个「应用程序」本质上是一个 Agent：双击桌面图标打开窗口，窗口背后运行着 `Agent + LLM + 工具集` 的执行链路；Agent 对桌面的所有影响都通过 SSE 事件流回写，前端只是服务端权威状态的镜像。

## 快速开始

```bash
cp .env.example .env    # 填入 LLM_API_KEY
docker compose up -d
```

打开 http://localhost:8080 —— 后端在所有 `/api` 路由之后托管 `apps/desktop/dist`，根路径直接返回 XP 桌面。

未配置 `LLM_API_KEY` 时服务仍可启动，界面正常渲染，仅对话不可用（`/api/health` 返回 `degraded`）。

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

当前测试规模：后端 **103** 个用例、前端 **62** 个单元用例、**14** 个 Playwright E2E 用例。

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

## 目录

- `apps/server` — Hono + AI SDK v7 + SQLite 单进程运行时
  - `src/agent/` — Agent 注册表、Runner、Provider 适配层、工具注册表与执行器
  - `src/tools/` — 内置工具（fs / datetime / calc / http / shell / desktop）
  - `src/services/` — 窗口服务、授权服务
  - `src/routes/` — HTTP 路由
- `apps/desktop` — React + Vite 桌面 Shell
  - `src/shell/` — 桌面外壳、任务栏、开始菜单
  - `src/windows/` — 窗口状态机
  - `src/state/` — 桌面 store、SSE 接入、授权状态
- `packages/shared` — 前后端共享类型与设计令牌

## 配置

全部配置项见 `.env.example`，均带默认值。关键项：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` / `HOST` | `8080` / `0.0.0.0` | HTTP 监听地址 |
| `LLM_API_KEY` | 空 | 模型服务密钥，填入才能对话 |
| `LLM_BASE_URL` | 空 | 自定义模型端点（兼容 OpenAI 协议的服务） |
| `LLM_MODEL` | `gpt-4o-mini` | 默认模型 id |
| `ALLOWED_DOMAINS` | 空 | `http.*` 工具的域名白名单，支持 `*.` 前缀 |
| `SHELL_ENABLED` | `false` | `shell.exec` 总开关 |
| `WORKSPACE_DIR` | `data/workspace` | Agent 可读写的沙箱根目录 |
| `DB_FILE` | `data/tashkent.db` | SQLite 文件路径 |

## 容器镜像

`Dockerfile` 为两阶段构建：

- **build**：`node:22-bookworm-slim` + `python3 make g++`，装全量依赖后构建 shared / desktop / server；
- **runtime**：同为 `node:22-bookworm-slim`，装 `libstdc++6`（`better-sqlite3` 原生二进制的运行时依赖）与 `tini`，只装 `@tashkent/server` 的生产依赖并拷贝编译产物。

用 glibc 而非 alpine：`better-sqlite3` 的 prebuilt 二进制链接 `libstdc++` 与 `GLIBCXX_3.4.29`，musl libc 无法加载。

## 已知状态

- 容器镜像构建**未经实机验证**（开发环境无 Docker）。运行期逻辑通过 `scripts/simulate-runtime.ps1` 的等价路径验证；glibc 侧的系统库依赖只做了静态审查。
- M5 之后的功能（应用集、视觉打磨、加固）另立计划。

详细架构见 `docs/superpowers/specs/2026-10-27-winxp-agentos-architecture-design.md`，实施计划见 `docs/superpowers/plans/2026-10-28-tashkent-m0-m4-core.md`。
