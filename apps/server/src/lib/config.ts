export interface AppConfig {
  port: number;
  host: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  maxSteps: number;
  maxInputTokens: number;
  contextKeepTurns: number;
  /** 单个工具结果的最大字节数，超出即截断 */
  toolResultMaxBytes: number;
  toolTimeoutMs: number;
  maxConcurrentRuns: number;
  allowedDomains: string[];
  shellEnabled: boolean;
  shellAllowed: string[];
  workspaceDir: string;
  artifactsDir: string;
  dbFile: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  metricsEnabled: boolean;
  version: string;
}

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function list(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v.trim().toLowerCase() === 'true';
}

export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  return {
    port: num(env.PORT, 8080),
    host: env.HOST ?? '0.0.0.0',
    provider: env.LLM_PROVIDER ?? 'openai',
    apiKey: env.LLM_API_KEY ?? '',
    baseUrl: env.LLM_BASE_URL ?? '',
    model: env.LLM_MODEL ?? 'gpt-4o-mini',
    temperature: num(env.LLM_TEMPERATURE, 0.7),
    maxOutputTokens: num(env.LLM_MAX_OUTPUT_TOKENS, 4096),
    maxSteps: num(env.MAX_STEPS, 8),
    maxInputTokens: num(env.MAX_INPUT_TOKENS, 120000),
    contextKeepTurns: num(env.CONTEXT_KEEP_TURNS, 20),
    toolResultMaxBytes: num(env.TOOL_RESULT_MAX_BYTES, 8192),
    toolTimeoutMs: num(env.TOOL_TIMEOUT_MS, 30000),
    maxConcurrentRuns: num(env.MAX_CONCURRENT_RUNS, 4),
    allowedDomains: list(env.ALLOWED_DOMAINS),
    shellEnabled: bool(env.SHELL_ENABLED, false),
    shellAllowed: list(env.SHELL_ALLOWED),
    workspaceDir: env.WORKSPACE_DIR ?? 'data/workspace',
    artifactsDir: env.ARTIFACTS_DIR ?? 'data/artifacts',
    dbFile: env.DB_FILE ?? 'data/tashkent.db',
    logLevel: (env.LOG_LEVEL as AppConfig['logLevel']) ?? 'info',
    metricsEnabled: bool(env.METRICS_ENABLED, false),
    version: '1.0.0',
  };
}

export const config: AppConfig = loadConfig(process.env);
