export interface AppDefinition {
  appId: string;
  title: string;
  icon: string;
  /** 绑定的 Agent id */
  agentId: string;
  /** 默认窗口尺寸 */
  width: number;
  height: number;
  /** 所属开始菜单分组 */
  group: 'accessories' | 'system';
  description: string;
}

/**
 * 桌面应用注册表 —— 前后端唯一来源。
 * 新增应用 = 在此加一条 + 在前端实现同名视图组件。
 */
export const APP_REGISTRY: AppDefinition[] = [
  {
    appId: 'chat',
    title: '对话',
    icon: '💬',
    agentId: 'chat',
    width: 640,
    height: 480,
    group: 'accessories',
    description: '通用对话助手',
  },
  {
    appId: 'files',
    title: '我的文档',
    icon: '📁',
    agentId: 'file-manager',
    width: 520,
    height: 400,
    group: 'system',
    description: '浏览与管理工作区文件',
  },
  {
    appId: 'notes',
    title: '记事本',
    icon: '📝',
    agentId: 'notepad',
    width: 560,
    height: 440,
    group: 'accessories',
    description: '编辑纯文本文件',
  },
  {
    appId: 'browser',
    title: '浏览器',
    icon: '🌐',
    agentId: 'web-research',
    width: 720,
    height: 520,
    group: 'accessories',
    description: '联网检索与资料整理',
  },
  {
    appId: 'terminal',
    title: '命令提示符',
    icon: '⌨️',
    agentId: 'shell-agent',
    width: 640,
    height: 400,
    group: 'system',
    description: '受限命令执行',
  },
  {
    appId: 'settings',
    title: '控制面板',
    icon: '⚙️',
    agentId: 'system-config',
    width: 560,
    height: 420,
    group: 'system',
    description: '模型、工具授权与主题设置',
  },
  {
    appId: 'tasks',
    title: '任务管理器',
    icon: '📊',
    agentId: 'task-monitor',
    width: 520,
    height: 380,
    group: 'system',
    description: '查看运行中的 Agent 与资源占用',
  },
];

export function findApp(appId: string): AppDefinition | undefined {
  return APP_REGISTRY.find((a) => a.appId === appId);
}
