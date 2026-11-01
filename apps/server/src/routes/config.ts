import { Hono } from 'hono';
import type { PublicConfig } from '@tashkent/shared';
import { config } from '../lib/config.js';

/**
 * 对外暴露的运行时配置。
 *
 * 只包含非敏感项：绝不返回 apiKey / baseUrl 凭据。
 */
export function configRoutes() {
  const app = new Hono();

  app.get('/api/config', (c) => {
    const body: PublicConfig = {
      provider: config.provider,
      model: config.model,
      temperature: config.temperature,
      maxSteps: config.maxSteps,
      maxOutputTokens: config.maxOutputTokens,
      contextKeepTurns: config.contextKeepTurns,
      shellEnabled: config.shellEnabled,
      shellAllowed: config.shellAllowed,
      allowedDomains: config.allowedDomains,
      version: config.version,
    };
    return c.json(body);
  });

  return app;
}
