/**
 * LLM 可达性探测。
 *
 * 健康检查必须反映真实可用性：
 * - 没有 apiKey 直接判定不可用（不发请求）；
 * - 有 apiKey 时做一次轻量真实探测，带超时；
 * - 探测结果缓存一段时间，避免每次健康检查都打外网。
 */

/** 探测函数：返回 { ok } 或抛错表示不可用 */
export type LlmProbe = () => Promise<{ ok: boolean } | void>;

export interface LlmHealthOptions {
  /** 模型服务密钥；为空直接判定不可用 */
  apiKey: string;
  /** 实际探测实现 */
  probe: LlmProbe;
  /** 探测超时（毫秒） */
  timeoutMs?: number;
  /** 探测结果缓存时长（毫秒） */
  cacheMs?: number;
  /** 时钟注入，便于测试 */
  now?: () => number;
}

export interface LlmHealthResult {
  ok: boolean;
  latencyMs: number | null;
}

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_CACHE_MS = 30000;

/**
 * 构造带缓存与超时的 LLM 健康探测。
 */
export function createLlmHealthProbe(options: LlmHealthOptions): () => Promise<LlmHealthResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  const now = options.now ?? (() => Date.now());

  let cached: { result: LlmHealthResult; at: number } | null = null;

  return async function check(): Promise<LlmHealthResult> {
    // 没有密钥：直接判定不可用，不发任何请求
    if (!options.apiKey || options.apiKey.trim() === '') {
      return { ok: false, latencyMs: null };
    }

    // 命中缓存：不重复打外网
    if (cached && now() - cached.at < cacheMs) {
      return cached.result;
    }

    const started = now();
    let result: LlmHealthResult;
    try {
      const outcome = await withTimeout(options.probe(), timeoutMs);
      result = { ok: outcome?.ok === true, latencyMs: now() - started };
    } catch {
      // 探测失败或超时：降级为不可用，不向外抛出
      result = { ok: false, latencyMs: null };
    }

    cached = { result, at: now() };
    return result;
  };
}

/**
 * 给探测加超时保护：超时后立即返回失败，探测本身继续在后台结束。
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(undefined);
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
