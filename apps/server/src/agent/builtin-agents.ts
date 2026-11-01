import type { AgentDefinition } from '@tashkent/shared';

/**
 * 内置 Agent 定义。
 * toolIds 只列出当前阶段（M2）已实现并注册的工具；
 * 桌面控制与 http/shell 工具在对应里程碑落地后再补进来。
 */
export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    id: 'chat',
    name: '对话',
    icon: '💬',
    description: '通用对话助手',
    systemPrompt: '你是一个运行在 WinXP 风格工作台中的助手。回答简洁、务实。',
    toolIds: ['datetime.now', 'calc.eval', 'fs.read', 'fs.list', 'fs.write'],
    maxSteps: 8,
  },
  {
    id: 'file-manager',
    name: '我的文档',
    icon: '📁',
    description: '文件浏览与管理',
    systemPrompt: '你负责管理工作区文件。列目录时给出清晰的层级结构。',
    toolIds: ['fs.read', 'fs.list', 'fs.write', 'datetime.now'],
    maxSteps: 6,
  },
];
