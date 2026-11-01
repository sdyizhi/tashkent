import type { AgentDefinition } from '@tashkent/shared';

/**
 * 内置 Agent 定义。
 * toolIds 只列出已实现并注册的工具；
 * http / shell 为 dangerous 权限，实际执行仍由服务端 ToolExecutor 强制校验授权。
 */
export const BUILTIN_AGENTS: AgentDefinition[] = [
  {
    id: 'chat',
    name: '对话',
    icon: '💬',
    description: '通用对话助手',
    systemPrompt: '你是一个运行在 WinXP 风格工作台中的助手。回答简洁、务实。',
    toolIds: [
      'datetime.now',
      'calc.eval',
      'fs.read',
      'fs.list',
      'fs.write',
      'desktop.open_app',
      'desktop.close_window',
      'desktop.notify',
      'http.get',
      'http.post',
      'shell.exec',
    ],
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
