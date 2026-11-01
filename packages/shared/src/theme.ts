/** WinXP 设计令牌 —— 全项目唯一样式来源，禁止在别处硬编码颜色 */
export const XP_TOKENS = {
  'xp-blue-start': '#245EDB',
  'xp-blue-end': '#3A8AEB',
  'xp-blue-inactive-start': '#7B9AD1',
  'xp-blue-inactive-end': '#B5C7E7',
  'xp-close-start': '#E8837C',
  'xp-close-end': '#E0554B',
  'xp-taskbar': '#245EDB',
  'xp-taskbar-edge': '#1941A5',
  'xp-face': '#ECE9D8',
  'xp-face-light': '#F6F4EC',
  'xp-shadow-hard': '2px 2px 0 rgba(0,0,0,.35)',
  'xp-border-out': '#003C74',
  'xp-border-in': '#FFFFFF',
  'xp-font': '"Tahoma", "Microsoft Sans Serif", sans-serif',
  'xp-font-size': '11px',
} as const;

export type XpToken = keyof typeof XP_TOKENS;
