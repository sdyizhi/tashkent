import fs from 'node:fs';
import path from 'node:path';
import type { AgentDefinition } from '@tashkent/shared';

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition>();

  register(agent: AgentDefinition): void {
    this.agents.set(agent.id, agent);
  }

  registerAll(list: AgentDefinition[]): void {
    for (const a of list) this.register(a);
  }

  get(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  list(): AgentDefinition[] {
    return [...this.agents.values()];
  }

  /** 从目录热加载 JSON 声明；单个文件解析失败不影响其它文件 */
  loadFromDir(dir: string): number {
    if (!fs.existsSync(dir)) return 0;
    let loaded = 0;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const parsed = JSON.parse(raw) as AgentDefinition;
        if (parsed && typeof parsed.id === 'string' && Array.isArray(parsed.toolIds)) {
          this.register(parsed);
          loaded += 1;
        }
      } catch {
        // 忽略坏文件
      }
    }
    return loaded;
  }
}
