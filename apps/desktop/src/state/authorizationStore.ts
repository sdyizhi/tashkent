import { create } from 'zustand';
import type { AuthorizationRequest } from '../components/AuthorizationDialog.js';

interface AuthorizationStore {
  /** 当前等待用户决策的授权请求 */
  request: AuthorizationRequest | null;
  setRequest: (request: AuthorizationRequest | null) => void;
  clearRequest: (authorizationId: string) => void;
}

/**
 * 授权请求的全局状态。
 *
 * 服务端在 write / dangerous 工具执行前挂起，等待前端回传决策；
 * 该状态挂在桌面层，保证授权对话框在整个桌面上都可见（不依赖某个窗口）。
 */
export const useAuthorizationStore = create<AuthorizationStore>((set) => ({
  request: null,
  setRequest: (request) => set({ request }),
  clearRequest: (authorizationId) =>
    set((s) => (s.request?.authorizationId === authorizationId ? { request: null } : {})),
}));
