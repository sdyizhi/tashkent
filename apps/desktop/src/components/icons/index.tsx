import type { ReactElement } from 'react';

/** 图标尺寸档位（与 XP 桌面图标规格一致） */
export type IconSize = 16 | 32 | 48;

export interface IconProps {
  size?: IconSize;
  className?: string;
}

/**
 * XP 风格图标的统一配色。
 *
 * 风格约定：蓝色顶栏 + 米色主体 + 1.5px 深蓝描边 + 简化几何，
 * 所有图标共用同一 viewBox（0 0 32 32），按尺寸等比缩放。
 */
const XP_BLUE = '#245edb';
const XP_BLUE_LIGHT = '#3a8aeb';
const XP_SKY = '#5f9fe0';
const XP_FACE = '#ece9d8';
const XP_FACE_LIGHT = '#f6f4ec';
const XP_BORDER = '#003c74';
const XP_RULE = '#8fa2b8';

/** 对话：XP 风格的聊天气泡窗口 */
export function ChatIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="对话"
    >
      <path
        d="M8 21.5 L8 29.5 L14.5 22.5 Z"
        fill={XP_FACE_LIGHT}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect
        x="2.5"
        y="4.5"
        width="27"
        height="19"
        rx="2"
        fill={XP_FACE_LIGHT}
        stroke={XP_BORDER}
        strokeWidth="1.5"
      />
      <path
        d="M4.5 4.5 H27.5 A2 2 0 0 1 29.5 6.5 V10.5 H2.5 V6.5 A2 2 0 0 1 4.5 4.5 Z"
        fill={XP_BLUE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10.5" cy="16.5" r="1.7" fill={XP_BORDER} />
      <circle cx="16" cy="16.5" r="1.7" fill={XP_BORDER} />
      <circle cx="21.5" cy="16.5" r="1.7" fill={XP_BORDER} />
    </svg>
  );
}

/** 我的文档：文件夹 + 后面露出的文档 */
export function FilesIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="我的文档"
    >
      <rect
        x="10"
        y="3.5"
        width="17.5"
        height="15"
        rx="1.5"
        fill="#ffffff"
        stroke={XP_BORDER}
        strokeWidth="1.5"
      />
      <path
        d="M11.5 3.5 H26 A1.5 1.5 0 0 1 27.5 5 V9 H10 V5 A1.5 1.5 0 0 1 11.5 3.5 Z"
        fill={XP_BLUE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 12.5 A1.5 1.5 0 0 1 5 11 H13 L15.5 14 H27 A1.5 1.5 0 0 1 28.5 15.5 V25 A1.5 1.5 0 0 1 27 26.5 H5 A1.5 1.5 0 0 1 3.5 25 Z"
        fill={XP_FACE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5 11 H13 L15.5 14 H8 Z"
        fill={XP_BLUE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 记事本：带蓝色页眉与横线的便笺 */
export function NotesIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="记事本"
    >
      <rect
        x="4.5"
        y="3.5"
        width="23"
        height="25"
        rx="2"
        fill="#ffffff"
        stroke={XP_BORDER}
        strokeWidth="1.5"
      />
      <path
        d="M6.5 3.5 H25.5 A2 2 0 0 1 27.5 5.5 V9 H4.5 V5.5 A2 2 0 0 1 6.5 3.5 Z"
        fill={XP_BLUE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 13.5 H24 M8 17.5 H24 M8 21.5 H24 M8 25.5 H18"
        stroke={XP_RULE}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 浏览器：地球仪 */
export function BrowserIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="浏览器"
    >
      <circle cx="16" cy="16" r="12.5" fill={XP_SKY} stroke={XP_BORDER} strokeWidth="1.5" />
      <path
        d="M9.5 12 C11 10 13.5 9.6 15 11 C16.5 12.4 15.6 14 14 14.6 C12 15.2 12.4 16.8 11.4 18.4 C10.4 20 8.4 19.4 7.9 17.8 C7.4 16.2 8.4 13.4 9.5 12 Z"
        fill={XP_FACE}
        stroke={XP_BORDER}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M18.2 18.6 C19.6 17.2 22 17.2 23 18.6 C24 20 23 21.6 21.5 22.1 C20 22.6 18.4 21.6 18 20.4 C17.7 19.8 17.8 19.1 18.2 18.6 Z"
        fill={XP_FACE}
        stroke={XP_BORDER}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 13.5 H27.5 M4.5 18.5 H27.5 M16 3.5 V28.5"
        stroke={XP_BORDER}
        strokeWidth="1"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}

/** 命令提示符：黑色控制台窗口 */
export function TerminalIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="命令提示符"
    >
      <rect
        x="2.5"
        y="5.5"
        width="27"
        height="21"
        rx="2"
        fill="#101010"
        stroke={XP_BORDER}
        strokeWidth="1.5"
      />
      <path
        d="M4.5 5.5 H27.5 A2 2 0 0 1 29.5 7.5 V11 H2.5 V7.5 A2 2 0 0 1 4.5 5.5 Z"
        fill={XP_BLUE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 15 L10.5 18.5 L7 22"
        fill="none"
        stroke="#e8e8e8"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13 22 H21" stroke="#e8e8e8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 控制面板：带滑块的设置面板 */
export function SettingsIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="控制面板"
    >
      <rect
        x="2.5"
        y="4.5"
        width="27"
        height="23"
        rx="2"
        fill={XP_FACE_LIGHT}
        stroke={XP_BORDER}
        strokeWidth="1.5"
      />
      <path
        d="M4.5 4.5 H27.5 A2 2 0 0 1 29.5 6.5 V10 H2.5 V6.5 A2 2 0 0 1 4.5 4.5 Z"
        fill={XP_BLUE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7 15.5 H25 M7 21.5 H25"
        stroke={XP_RULE}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="11" y="13" width="4.5" height="5" rx="1" fill={XP_BLUE_LIGHT} stroke={XP_BORDER} strokeWidth="1.3" />
      <rect x="19" y="19" width="4.5" height="5" rx="1" fill={XP_BLUE_LIGHT} stroke={XP_BORDER} strokeWidth="1.3" />
    </svg>
  );
}

/** 任务管理器：带柱状图的监控窗口 */
export function TasksIcon({ size = 32, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="任务管理器"
    >
      <rect
        x="2.5"
        y="4.5"
        width="27"
        height="23"
        rx="2"
        fill={XP_FACE_LIGHT}
        stroke={XP_BORDER}
        strokeWidth="1.5"
      />
      <path
        d="M4.5 4.5 H27.5 A2 2 0 0 1 29.5 6.5 V10 H2.5 V6.5 A2 2 0 0 1 4.5 4.5 Z"
        fill={XP_BLUE}
        stroke={XP_BORDER}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6 23.5 H26" stroke={XP_BORDER} strokeWidth="1.3" strokeLinecap="round" />
      <rect x="8" y="17" width="4" height="6.5" fill={XP_BLUE_LIGHT} stroke={XP_BORDER} strokeWidth="1.3" />
      <rect x="14" y="12.5" width="4" height="11" fill={XP_BLUE} stroke={XP_BORDER} strokeWidth="1.3" />
      <rect x="20" y="15" width="4" height="8.5" fill={XP_BLUE_LIGHT} stroke={XP_BORDER} strokeWidth="1.3" />
    </svg>
  );
}

/**
 * 应用 id → 图标组件。
 *
 * 前端优先使用这里的 SVG 图标；注册表中没有对应图标的 appId
 * 由调用方回退到 emoji 字段（服务端窗口标题栏仍在用 emoji）。
 */
export const APP_ICONS: Record<string, (p: IconProps) => ReactElement> = {
  chat: ChatIcon,
  files: FilesIcon,
  notes: NotesIcon,
  browser: BrowserIcon,
  terminal: TerminalIcon,
  settings: SettingsIcon,
  tasks: TasksIcon,
};

/** 是否为某个 appId 画了专属 SVG 图标 */
export function hasAppIcon(appId: string): boolean {
  return Object.prototype.hasOwnProperty.call(APP_ICONS, appId);
}

export interface AppIconProps {
  appId: string;
  /** 回退图标（注册表里的 emoji） */
  emoji: string;
  size?: IconSize;
  className?: string;
}

/**
 * 渲染应用图标：有 SVG 用 SVG，没有则回退到 emoji。
 *
 * 回退是必需的：应用注册表允许新增应用，而图标集未必同步更新，
 * 此时桌面不能出现空白图标。
 */
export function AppIcon({ appId, emoji, size = 32, className }: AppIconProps) {
  const Icon = APP_ICONS[appId];
  if (!Icon) {
    return (
      <span className={className} aria-hidden="true" data-testid="app-icon-fallback">
        {emoji}
      </span>
    );
  }
  return <Icon size={size} className={className} />;
}
