import { describe, expect, it } from 'vitest';
import { createMetricsRegistry } from './metrics.js';

describe('指标收集器', () => {
  it('renders 全部五个设计文档规定的指标名', () => {
    const m = createMetricsRegistry();
    const out = m.render();
    expect(out).toContain('tashkent_runs_total');
    expect(out).toContain('tashkent_tool_calls_total');
    expect(out).toContain('tashkent_tool_duration_seconds');
    expect(out).toContain('tashkent_llm_tokens_total');
    expect(out).toContain('tashkent_active_sessions');
  });

  it('runs_total 按 status 分别计数', () => {
    const m = createMetricsRegistry();
    m.runsTotal('ok');
    m.runsTotal('ok');
    m.runsTotal('error');
    const out = m.render();
    expect(out).toContain('tashkent_runs_total{status="ok"} 2');
    expect(out).toContain('tashkent_runs_total{status="error"} 1');
  });

  it('tool_calls_total 带 tool 与 ok 标签', () => {
    const m = createMetricsRegistry();
    m.toolCalls('fs.read', true);
    m.toolCalls('fs.read', false);
    m.toolCalls('calc.eval', true);
    const out = m.render();
    expect(out).toContain('tashkent_tool_calls_total{tool="fs.read",ok="true"} 1');
    expect(out).toContain('tashkent_tool_calls_total{tool="fs.read",ok="false"} 1');
    expect(out).toContain('tashkent_tool_calls_total{tool="calc.eval",ok="true"} 1');
  });

  it('tool_duration_seconds 累计耗时并转为秒', () => {
    const m = createMetricsRegistry();
    m.toolDuration('fs.read', 500);
    m.toolDuration('fs.read', 250);
    const out = m.render();
    expect(out).toContain('tashkent_tool_duration_seconds{tool="fs.read"} 0.75');
  });

  it('llm_tokens_total 按 direction 分别累计', () => {
    const m = createMetricsRegistry();
    m.llmTokens('input', 100);
    m.llmTokens('input', 50);
    m.llmTokens('output', 30);
    const out = m.render();
    expect(out).toContain('tashkent_llm_tokens_total{direction="input"} 150');
    expect(out).toContain('tashkent_llm_tokens_total{direction="output"} 30');
  });

  it('active_sessions 为 Gauge，取最后一次设置值', () => {
    const m = createMetricsRegistry();
    m.activeSessions(3);
    m.activeSessions(7);
    expect(m.render()).toContain('tashkent_active_sessions 7');
  });

  it('active_sessions 不会变成负数', () => {
    const m = createMetricsRegistry();
    m.activeSessions(-5);
    expect(m.render()).toContain('tashkent_active_sessions 0');
  });

  it('输出含 HELP 与 TYPE 行', () => {
    const m = createMetricsRegistry();
    const out = m.render();
    expect(out).toContain('# HELP tashkent_runs_total');
    expect(out).toContain('# TYPE tashkent_runs_total counter');
    expect(out).toContain('# TYPE tashkent_active_sessions gauge');
  });

  it('标签值里的特殊字符被转义', () => {
    const m = createMetricsRegistry();
    m.toolCalls('weird"tool', true);
    const out = m.render();
    expect(out).toContain('tool="weird\\"tool"');
  });

  it('没有任何记录时也能渲染出全部指标（值为 0）', () => {
    const out = createMetricsRegistry().render();
    expect(out).toContain('tashkent_runs_total{status="ok"} 0');
    expect(out).toContain('tashkent_active_sessions 0');
  });

  it('渲染结果以换行结尾', () => {
    expect(createMetricsRegistry().render().endsWith('\n')).toBe(true);
  });
});
