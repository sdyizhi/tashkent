import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WindowState } from '@tashkent/shared';
import type { AltTabCandidate } from './AltTabSwitcher.js';

export interface UseAltTabOptions {
  /** 桌面上的窗口列表 */
  windows: WindowState[];
  /** 当前聚焦的窗口 id */
  focusedId: string | null;
  /** 激活选中的窗口 */
  onActivate: (id: string) => void;
}

export interface UseAltTabResult {
  /** 切换对话框是否可见 */
  visible: boolean;
  /** 候选窗口（按最近使用排序） */
  candidates: AltTabCandidate[];
  /** 当前高亮的窗口 id */
  activeId: string | null;
  /** 手动激活某个窗口 */
  activate: (id: string) => void;
  /** 取消切换 */
  cancel: () => void;
}

/**
 * Alt+Tab 窗口切换（XP 风格切换对话框）。
 *
 * 交互：按住 Alt 按 Tab 在窗口间循环，松开 Alt 激活选中窗口。
 * 没有窗口时 Alt+Tab 不做任何事。
 */
export function useAltTab({ windows, focusedId, onActivate }: UseAltTabOptions): UseAltTabResult {
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  // 候选窗口按 zIndex 倒序（最近使用的在前）
  const candidates = useMemo<AltTabCandidate[]>(
    () =>
      [...windows]
        .sort((a, b) => b.zIndex - a.zIndex)
        .map((w) => ({ id: w.id, title: w.title, icon: w.icon })),
    [windows],
  );

  // 事件回调里读到最新的值，避免因依赖变化反复注册监听
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const focusedIdRef = useRef(focusedId);
  focusedIdRef.current = focusedId;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const indexRef = useRef(0);
  const visibleRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const list = candidatesRef.current;

      if (e.key === 'Alt') {
        // 没有窗口时 Alt+Tab 不做任何事
        if (list.length === 0) return;
        e.preventDefault();
        // 初始高亮当前聚焦窗口；第一次 Tab 时前进到下一个
        const focusIdx = list.findIndex((c) => c.id === focusedIdRef.current);
        const start = focusIdx >= 0 ? focusIdx : list.length - 1;
        indexRef.current = start;
        visibleRef.current = true;
        setIndex(start);
        setVisible(true);
        return;
      }

      if (e.key === 'Tab' && visibleRef.current) {
        // 阻止浏览器默认的焦点切换
        e.preventDefault();
        const next = (indexRef.current + 1) % list.length;
        indexRef.current = next;
        setIndex(next);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Alt' || !visibleRef.current) return;
      e.preventDefault();
      visibleRef.current = false;
      setVisible(false);
      const target = candidatesRef.current[indexRef.current];
      if (target) onActivateRef.current(target.id);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const activate = useCallback((id: string) => {
    visibleRef.current = false;
    setVisible(false);
    onActivate(id);
  }, [onActivate]);

  const cancel = useCallback(() => {
    visibleRef.current = false;
    setVisible(false);
  }, []);

  const activeId = candidates[index]?.id ?? null;

  return { visible, candidates, activeId, activate, cancel };
}
