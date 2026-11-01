import fs from 'node:fs';
import path from 'node:path';
import type { WindowState } from '@tashkent/shared';
import type { AppConfig } from './lib/config.js';
import { EventBus } from './lib/event-bus.js';
import { AgentRegistry } from './agent/registry.js';
import { ToolRegistry } from './agent/tool-registry.js';
import { ToolExecutor } from './agent/tool-executor.js';
import { AgentRunner } from './agent/runner.js';
import { createOpenAIProvider } from './agent/providers/openai.js';
import { createLlmHealthProbe } from './lib/llm-health.js';
import { logger } from './lib/logger.js';
import { WindowService } from './services/window-service.js';
import { AuthzService } from './services/authz-service.js';
import { createFsTools } from './tools/fs.js';
import { createDateTimeTools } from './tools/datetime.js';
import { createCalcTools } from './tools/calc.js';
import { createHttpTools } from './tools/http.js';
import { createShellTools } from './tools/shell.js';
import { createDesktopTools } from './tools/desktop.js';
import { BUILTIN_AGENTS } from './agent/builtin-agents.js';
import type { DB } from './db/index.js';
import { MessageRepository } from './db/repositories/messages.js';
import { SessionRepository } from './db/repositories/sessions.js';
import { DesktopStateRepository } from './db/repositories/desktop-state.js';

export interface RuntimeDeps {
  db: DB;
  config: AppConfig;
}

/** 窗口列表在 desktop_state 表里的键 */
const WINDOWS_STATE_KEY = 'windows';

/** 窗口布局写入存储的防抖间隔（毫秒） */
const WINDOWS_PERSIST_DEBOUNCE_MS = 200;

export function createRuntime(deps: RuntimeDeps) {
  const { config } = deps;

  const bus = new EventBus();
  const registry = new AgentRegistry();
  registry.registerAll(BUILTIN_AGENTS);
  registry.loadFromDir(path.join(path.dirname(config.dbFile), 'agents'));

  const desktopState = new DesktopStateRepository(deps.db);

  // 窗口布局持久化：窗口列表落 desktop_state 表，重启后可恢复（M4 验收标准）。
  // 保存走 200ms 防抖，避免拖拽时高频写 SQLite。
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingWindows: WindowState[] | null = null;
  const flushWindows = (): void => {
    persistTimer = null;
    if (pendingWindows === null) return;
    desktopState.set(WINDOWS_STATE_KEY, pendingWindows);
    pendingWindows = null;
  };

  const toolRegistry = new ToolRegistry();
  const windowService = new WindowService({
    apps: [
      { appId: 'chat', title: '对话', icon: '💬' },
      { appId: 'files', title: '我的文档', icon: '📁', width: 520, height: 400 },
    ],
    defaultWidth: 640,
    defaultHeight: 480,
    persistence: {
      load: () => desktopState.get<WindowState[]>(WINDOWS_STATE_KEY, []),
      save: (windows) => {
        pendingWindows = windows;
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = setTimeout(flushWindows, WINDOWS_PERSIST_DEBOUNCE_MS);
      },
    },
  });

  toolRegistry.registerAll(createFsTools(path.resolve(config.workspaceDir)));
  toolRegistry.registerAll(createDateTimeTools());
  toolRegistry.registerAll(createCalcTools());
  toolRegistry.registerAll(createHttpTools(config.allowedDomains));
  toolRegistry.registerAll(createShellTools({ enabled: config.shellEnabled, allowed: config.shellAllowed }));
  toolRegistry.registerAll(createDesktopTools(windowService));

  const authz = new AuthzService();
  const executor = new ToolExecutor(toolRegistry, {
    authorize: async (tool, info) => {
      const decision = await authz.request(tool, ({ authorizationId }) => {
        // 通知前端弹出授权对话框；工具在此挂起，直到用户作出决策
        info.emit({
          type: 'authorization_required',
          sessionId: info.sessionId,
          authorizationId,
          toolCallId: info.toolCallId,
          toolName: tool.name,
          args: info.args,
          reason:
            tool.permission === 'dangerous'
              ? `危险工具「${tool.name}」需要确认后才能执行`
              : `工具「${tool.name}」将修改文件或创建内容，需要确认`,
        });
      });
      return decision.allowed;
    },
    // 工具执行日志（设计文档 7.1）：通过依赖注入传入，不让执行器依赖全局单例
    logger,
  });

  const provider = createOpenAIProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    probeModel: config.model,
  });

  // 健康检查用的 LLM 探测：没密钥直接判失败；有密钥则做带超时的轻量真实探测并缓存结果
  const checkLlm = createLlmHealthProbe({
    apiKey: config.apiKey,
    probe: async () => {
      if (!provider.probe) throw new Error('provider 不支持探测');
      await provider.probe();
    },
  });

  const messages = new MessageRepository(deps.db);
  const sessions = new SessionRepository(deps.db);

  const runner = new AgentRunner({
    provider,
    registry: toolRegistry,
    executor,
    bus,
    loadHistory: async (sessionId) => messages.listBySession(sessionId),
    contextKeepTurns: config.contextKeepTurns,
    maxInputTokens: config.maxInputTokens,
    toolResultMaxBytes: config.toolResultMaxBytes,
    maxSteps: config.maxSteps,
  });

  fs.mkdirSync(path.resolve(config.workspaceDir), { recursive: true });
  fs.mkdirSync(path.resolve(config.artifactsDir), { recursive: true });

  return {
    db: deps.db,
    bus,
    registry,
    toolRegistry,
    executor,
    provider,
    checkLlm,
    runner,
    windowService,
    authz,
    messages,
    sessions,
    desktopState,
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
