import { create } from 'zustand';

export interface DesktopError {
  id: string;
  /** 可读的错误描述 */
  message: string;
  /** 记录时间戳 */
  at: number;
}

interface ErrorStore {
  /** 未捕获的异常列表（托盘红点的数据源） */
  errors: DesktopError[];
  pushError: (reason: unknown) => void;
  clearError: (id: string) => void;
  clearAll: () => void;
}

let errorSeq = 0;

/** 把任意 rejection 原因整理成可读文本 */
export function describeReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

/**
 * 未捕获异常的全局状态。
 *
 * 设计文档 5.6：全局 unhandledrejection 捕获 → 托盘区红点提示。
 */
export const useErrorStore = create<ErrorStore>((set) => ({
  errors: [],
  pushError: (reason) =>
    set((s) => {
      errorSeq += 1;
      return {
        errors: [
          ...s.errors,
          { id: `e_${errorSeq}`, message: describeReason(reason), at: Date.now() },
        ],
      };
    }),
  clearError: (id) => set((s) => ({ errors: s.errors.filter((e) => e.id !== id) })),
  clearAll: () => set({ errors: [] }),
}));
