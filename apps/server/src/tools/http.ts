import { z } from 'zod';
import type { ToolDefinition } from '@tashkent/shared';

export function isDomainAllowed(host: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  const h = host.toLowerCase();
  for (const rule of allowed) {
    const r = rule.toLowerCase().trim();
    if (!r) continue;
    if (r.startsWith('*.')) {
      const suffix = r.slice(1);
      if (h.endsWith(suffix) && h.length > suffix.length) return true;
    } else if (h === r) {
      return true;
    }
  }
  return false;
}

/** 拒绝内网地址，防止 SSRF */
function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (host.startsWith('169.254.')) return true;
  if (host.startsWith('[')) return true;
  return false;
}

export function createHttpTools(allowedDomains: string[]): ToolDefinition[] {
  const guard = async (url: string): Promise<{ ok: true; host: string } | { ok: false; error: string }> => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: 'URL 格式非法' };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { ok: false, error: '仅支持 http/https' };
    }
    if (isPrivateHost(parsed.hostname)) {
      return { ok: false, error: '禁止访问内网地址' };
    }
    if (!isDomainAllowed(parsed.hostname, allowedDomains)) {
      return { ok: false, error: `域名 ${parsed.hostname} 不在白名单` };
    }
    return { ok: true, host: parsed.hostname };
  };

  const getTool: ToolDefinition = {
    name: 'http.get',
    description: '发起 HTTP GET 请求（域名需在白名单内）',
    inputSchema: z.object({
      url: z.string().describe('完整 URL'),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    permission: 'dangerous',
    timeoutMs: 20000,
    execute: async (input: { url: string; headers?: Record<string, string> }) => {
      const check = await guard(input.url);
      if (!check.ok) return { ok: false, error: check.error };
      try {
        const res = await fetch(input.url, { method: 'GET', headers: input.headers });
        const text = (await res.text()).slice(0, 100000);
        return {
          ok: true,
          data: { status: res.status, body: text },
          summary: `GET ${input.url} → ${res.status}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };

  const postTool: ToolDefinition = {
    name: 'http.post',
    description: '发起 HTTP POST 请求（域名需在白名单内）',
    inputSchema: z.object({
      url: z.string(),
      body: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    permission: 'dangerous',
    timeoutMs: 20000,
    execute: async (input: { url: string; body?: string; headers?: Record<string, string> }) => {
      const check = await guard(input.url);
      if (!check.ok) return { ok: false, error: check.error };
      try {
        const res = await fetch(input.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(input.headers ?? {}) },
          body: input.body,
        });
        const text = (await res.text()).slice(0, 100000);
        return {
          ok: true,
          data: { status: res.status, body: text },
          summary: `POST ${input.url} → ${res.status}`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: message };
      }
    },
  };

  return [getTool, postTool];
}
