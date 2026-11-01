import { config } from './config.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export function createLogger(level: Level = config.logLevel): Logger {
  const threshold = ORDER[level];
  const emit = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < threshold) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      ...fields,
    });
    if (lvl === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
  };
}

export const logger = createLogger();
