#!/usr/bin/env node
/**
 * Tashkent 压测脚本。
 *
 * 只用 Node 内置 fetch，不引任何新依赖。
 * 三个阶段分别打不同类型的接口，输出 P50 / P95 / P99 延迟与错误率。
 *
 * 用法：
 *   node scripts/loadtest.mjs                       # 打默认地址 http://localhost:8080
 *   node scripts/loadtest.mjs --base http://host:8080
 *   node scripts/loadtest.mjs --concurrency 30 --message-burst 10
 *
 * 退出码：全部阶段错误率为 0 时为 0，否则为 1。
 */

const args = process.argv.slice(2);

/** 读命令行参数：--key value */
function arg(key, fallback) {
  const i = args.indexOf(`--${key}`);
  if (i < 0 || i + 1 >= args.length) return fallback;
  return args[i + 1];
}

const BASE = String(arg('base', process.env.LOADTEST_BASE ?? 'http://localhost:8080')).replace(
  /\/$/,
  '',
);
const CONCURRENCY = Number(arg('concurrency', 20));
/**
 * 阶段 2 的写请求条数上限。
 * 服务端对 `POST /api/sessions/:id/messages` 按 IP 限流（默认 10 次/分钟），
 * 压测时不能把 429 当成服务错误，因此这里默认取限流阈值。
 */
const MESSAGE_BURST = Number(arg('message-burst', 10));

/** 单个请求的采样结果 */
function ok(ms) {
  return { ms, error: false };
}
function failed(ms) {
  return { ms, error: true };
}

/** 按分位数取延迟（输入需已排序） */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

/**
 * 并发跑一批任务，收集每个任务的耗时与成败。
 *
 * @param {number} count 任务总数
 * @param {(index: number) => Promise<any>} task 单个任务，参数是本次任务的序号
 */
async function runConcurrent(count, task) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(count, CONCURRENCY) }, async () => {
    while (cursor < count) {
      const index = cursor;
      cursor += 1;
      const started = Date.now();
      try {
        await task(index);
        results.push(ok(Date.now() - started));
      } catch {
        results.push(failed(Date.now() - started));
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/** 统计并打印一个阶段的结果 */
function report(name, results) {
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const errors = results.filter((r) => r.error).length;
  const errorRate = results.length === 0 ? 0 : (errors / results.length) * 100;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  console.log(`\n[${name}]`);
  console.log(`  请求数     : ${results.length}`);
  console.log(`  错误数     : ${errors}`);
  console.log(`  错误率     : ${errorRate.toFixed(2)}%`);
  console.log(`  P50 延迟   : ${p50} ms`);
  console.log(`  P95 延迟   : ${p95} ms`);
  console.log(`  P99 延迟   : ${p99} ms`);
  console.log(`  最大延迟   : ${latencies[latencies.length - 1] ?? 0} ms`);
  console.log(
    `  平均延迟   : ${latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0} ms`,
  );

  return { name, total: results.length, errors, errorRate, p50, p95, p99 };
}

/**
 * 带超时的 fetch。
 *
 * 统一在这里消费掉响应体（否则连接不会释放）并解析 JSON，
 * 返回解析后的数据；非 2xx 直接抛错，由调用方统计为失败。
 */
async function timedFetch(path, init = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (text === '') return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } finally {
    clearTimeout(timer);
  }
}

/** 阶段 1：健康检查（只读、轻量） */
async function phaseHealth() {
  const results = await runConcurrent(CONCURRENCY * 5, () => timedFetch('/api/health'));
  return report('阶段 1 · 健康检查', results);
}

/** 阶段 2：建会话 + 发消息（写路径） */
async function phaseSession() {
  const created = [];
  const createResults = await runConcurrent(CONCURRENCY, async () => {
    const body = await timedFetch('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'chat' }),
    });
    created.push(body.id);
  });

  // 每个会话发一条消息：限流按 IP 计（默认 10 次/分钟），
  // 因此这里刻意让并发数不超过限流阈值，否则会把 429 当成错误统计进去。
  const messageResults = await runConcurrent(Math.min(created.length, MESSAGE_BURST), async (i) => {
    const id = created[i % created.length];
    await timedFetch(`/api/sessions/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `压测消息 ${i}` }),
    });
  });

  return report('阶段 2 · 会话 + 消息', [...createResults, ...messageResults]);
}

/** 阶段 3：开窗口 + 关窗口 */
async function phaseWindow() {
  const opened = [];
  const openResults = await runConcurrent(CONCURRENCY, async () => {
    const body = await timedFetch('/api/desktop/windows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: 'chat' }),
    });
    opened.push(body.id);
  });

  // 服务端是幂等打开：同一个 appId 永远返回同一个窗口 id。
  // 因此这里按 id 去重后再关，否则第二次 DELETE 会拿到 404（那是压测脚本的 bug，不是服务的）。
  const uniqueIds = [...new Set(opened)];
  const closeResults = await runConcurrent(uniqueIds.length, async (i) => {
    await timedFetch(`/api/desktop/windows/${uniqueIds[i]}`, { method: 'DELETE' });
  });

  return report('阶段 3 · 窗口开关', [...openResults, ...closeResults]);
}

async function main() {
  console.log('Tashkent 压测');
  console.log(`  目标地址 : ${BASE}`);
  console.log(`  并发数   : ${CONCURRENCY}`);
  console.log(`  写请求上限: ${MESSAGE_BURST}（受服务端限流阈值约束）`);

  // 先确认服务可达，否则后续阶段全报错没有意义
  try {
    await timedFetch('/api/health', {}, 5000);
  } catch (err) {
    console.error(`\n无法连接后端 ${BASE}：${err.message}`);
    console.error('请先启动服务（node apps/server/dist/index.js）再运行压测。');
    process.exit(1);
  }

  const summaries = [];
  summaries.push(await phaseHealth());
  summaries.push(await phaseSession());
  summaries.push(await phaseWindow());

  console.log('\n================ 汇总 ================');
  console.log('阶段'.padEnd(24) + '请求数'.padStart(8) + '错误率'.padStart(10) + 'P50'.padStart(8) + 'P95'.padStart(8) + 'P99'.padStart(8));
  for (const s of summaries) {
    console.log(
      s.name
        .padEnd(24) +
        String(s.total).padStart(8) +
        `${s.errorRate.toFixed(2)}%`.padStart(10) +
        `${s.p50}ms`.padStart(8) +
        `${s.p95}ms`.padStart(8) +
        `${s.p99}ms`.padStart(8),
    );
  }

  const totalErrors = summaries.reduce((sum, s) => sum + s.errors, 0);
  const totalRequests = summaries.reduce((sum, s) => sum + s.total, 0);
  const overallRate = totalRequests === 0 ? 0 : (totalErrors / totalRequests) * 100;
  console.log(`\n总请求 ${totalRequests}，总错误 ${totalErrors}，整体错误率 ${overallRate.toFixed(2)}%`);

  process.exit(overallRate === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
