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
  {
    id: 'notepad',
    name: '记事本',
    icon: '📝',
    description: '编辑纯文本文件',
    systemPrompt:
      '你负责编辑工作区内的纯文本文件。读写文件时使用相对工作区根目录的路径，保持内容原样，不要擅自改写格式。',
    toolIds: ['fs.read', 'fs.list', 'fs.write', 'datetime.now'],
    maxSteps: 6,
  },
  {
    id: 'web-research',
    name: '浏览器',
    icon: '🌐',
    description: '联网检索与资料整理',
    systemPrompt:
      '你负责联网检索与资料整理。抓取网页时优先获取正文内容，输出时给出要点摘要并保留来源链接。',
    toolIds: ['http.get', 'http.post', 'datetime.now', 'calc.eval'],
    maxSteps: 8,
  },
  {
    id: 'shell-agent',
    name: '命令提示符',
    icon: '⌨️',
    description: '受限命令执行',
    systemPrompt:
      '你负责在工作区中执行受限命令。命令需在允许列表内，执行前先说明该命令的作用。',
    toolIds: ['shell.exec', 'fs.list', 'datetime.now'],
    maxSteps: 4,
  },
  {
    id: 'system-config',
    name: '控制面板',
    icon: '⚙️',
    description: '模型、工具授权与主题设置',
    systemPrompt: '你负责解释工作台的模型配置、工具权限级别与桌面设置。回答要说明各项的实际含义。',
    toolIds: ['datetime.now', 'desktop.open_app', 'desktop.notify'],
    maxSteps: 4,
  },
  {
    id: 'task-monitor',
    name: '任务管理器',
    icon: '📊',
    description: '查看运行中的 Agent 与资源占用',
    systemPrompt: '你负责汇报运行中的 Agent、会话数量与资源占用情况。数据不足时如实说明，不要编造。',
    toolIds: ['datetime.now', 'desktop.open_app', 'desktop.close_window', 'desktop.notify'],
    maxSteps: 4,
  },
];
