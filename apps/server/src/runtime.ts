import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './lib/config.js';
import { EventBus } from './lib/event-bus.js';
import { AgentRegistry } from './agent/registry.js';
import { ToolRegistry } from './agent/tool-registry.js';
import { ToolExecutor } from './agent/tool-executor.js';
import { AgentRunner } from './agent/runner.js';
import { createOpenAIProvider } from './agent/providers/openai.js';
import { AuthzService } from './services/authz-service.js';
import { createFsTools } from './tools/fs.js';
import { createDateTimeTools } from './tools/datetime.js';
import { createCalcTools } from './tools/calc.js';
import { BUILTIN_AGENTS } from './agent/builtin-agents.js';
import type { DB } from './db/index.js';
import { MessageRepository } from './db/repositories/messages.js';
import { SessionRepository } from './db/repositories/sessions.js';

export interface RuntimeDeps {
  db: DB;
  config: AppConfig;
}

export function createRuntime(deps: RuntimeDeps) {
  const { config } = deps;

  const bus = new EventBus();
  const registry = new AgentRegistry();
  registry.registerAll(BUILTIN_AGENTS);
  registry.loadFromDir(path.join(path.dirname(config.dbFile), 'agents'));

  const toolRegistry = new ToolRegistry();
  toolRegistry.registerAll(createFsTools(path.resolve(config.workspaceDir)));
  toolRegistry.registerAll(createDateTimeTools());
  toolRegistry.registerAll(createCalcTools());

  const authz = new AuthzService();
  const executor = new ToolExecutor(toolRegistry, {
    authorize: async (tool) => {
      const decision = await authz.request(tool);
      return decision.allowed;
    },
  });

  const provider = createOpenAIProvider({ apiKey: config.apiKey, baseUrl: config.baseUrl });

  const messages = new MessageRepository(deps.db);
  const sessions = new SessionRepository(deps.db);

  const runner = new AgentRunner({
    provider,
    registry: toolRegistry,
    executor,
    bus,
    loadHistory: async (sessionId) => messages.listBySession(sessionId),
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
    runner,
    authz,
    messages,
    sessions,
  };
}

export type Runtime = ReturnType<typeof createRuntime>;
