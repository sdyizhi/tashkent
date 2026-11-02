import { Hono } from 'hono';
import { healthRoutes } from './routes/health.js';
import { agentRoutes } from './routes/agents.js';
import { sessionRoutes } from './routes/sessions.js';
import { toolRoutes } from './routes/tools.js';
import { eventRoutes } from './routes/events.js';
import { desktopRoutes } from './routes/desktop.js';
import { desktopStateRoutes } from './routes/desktop-state.js';
import { appRoutes } from './routes/apps.js';
import { configRoutes } from './routes/config.js';
import { statsRoutes } from './routes/stats.js';
import { metricsRoutes } from './routes/metrics.js';
import { registerStaticAssets } from './lib/static-assets.js';
import { config as globalConfig } from './lib/config.js';
import { createAuth } from './middleware/auth.js';
import { createRateLimit } from './middleware/rate-limit.js';
import type { Runtime } from './runtime.js';
import type { AppConfig } from './lib/config.js';

/**
 * 免鉴权路径前缀。
 *
 * - `/api/health`：负载均衡 / 监控探针
 * - `/api/auth/login`：登录接口本身
 * - `/assets/`：前端构建产物（JS / CSS）
 *
 * 注意 `/api/config` **不在**白名单里：前端靠它做一次探测来判断
 * 「是否需要口令」（401 → 弹登录框）。它本身不含任何凭据，
 * 登录后凭 Cookie 正常访问。
 */
const PUBLIC_PATHS = ['/api/health', '/api/auth/login', '/assets/'];

export function createApp(rt: Runtime, config: AppConfig = globalConfig) {
  const app = new Hono();

  // 口令保护（设计文档 12.2）：未设置 AUTH_PASSWORD 时中间件直接放行，行为与加固前完全一致。
  app.use(
    '*',
    createAuth({
      password: config.authPassword,
      // 未配置签名密钥时随机生成：进程内有效，重启后旧 Cookie 失效
      cookieSecret: config.authCookieSecret || `ephemeral-${Date.now()}-${Math.random()}`,
      publicPaths: PUBLIC_PATHS,
      sessionTtlMs: config.authSessionTtlMs,
    }),
  );

  // 高频写接口限流：按 IP 限制（设计文档 12.2）
  app.use(
    '/api/sessions/:id/messages',
    createRateLimit({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }),
  );

  app.route(
    '/',
    healthRoutes({
      db: rt.db,
      sessions: rt.sessions,
      agentCount: rt.registry.list().length,
      checkLlm: rt.checkLlm,
    }),
  );
  app.route('/', agentRoutes(rt.registry));
  app.route('/', toolRoutes(rt.toolRegistry, rt.authz));
  app.route('/', eventRoutes(rt.bus));
  app.route(
    '/',
    sessionRoutes({
      sessions: rt.sessions,
      messages: rt.messages,
      dispatch: async (sessionId, text) => {
        const session = rt.sessions.get(sessionId);
        if (!session) return;
        const agent = rt.registry.get(session.agentId);
        if (!agent) return;
        const result = await rt.runner.run({ sessionId, agentId: agent.id, agent, userText: text });
        rt.messages.append({
          sessionId,
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        });
      },
    }),
  );
  app.route('/', desktopRoutes(rt.windowService, (event) => rt.bus.publish(event), rt.workspaceDir));
  app.route('/', desktopStateRoutes(rt.desktopState));
  app.route('/', appRoutes());
  app.route('/', configRoutes());
  app.route('/', statsRoutes(rt));
  // 指标端点仅在 METRICS_ENABLED=true 时挂载（设计文档 7.3：可选，零额外依赖）
  if (config.metricsEnabled) {
    app.route('/', metricsRoutes(rt.metrics));
  }

  // 静态托管放在所有 API 路由之后：API 先匹配，未命中的路径才落到前端产物
  registerStaticAssets(app);

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: '资源不存在' } }, 404));
  app.onError((err, c) => {
    return c.json({ error: { code: 'INTERNAL', message: err.message } }, 500);
  });
  return app;
}
