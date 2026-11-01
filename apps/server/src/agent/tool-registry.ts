import type { ToolDefinition } from '@tashkent/shared';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const t of tools) this.register(t);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** 按白名单取工具；白名单中的未知名字被忽略 */
  pick(names: string[]): ToolDefinition[] {
    const out: ToolDefinition[] = [];
    for (const n of names) {
      const t = this.tools.get(n);
      if (t) out.push(t);
    }
    return out;
  }
}
