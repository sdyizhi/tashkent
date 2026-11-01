import { useErrorStore } from './errorStore.js';

/**
 * 注册全局未捕获 Promise rejection 监听。
 *
 * 设计文档 5.6：全局 unhandledrejection 捕获 → 托盘区红点提示。
 *
 * @returns 注销监听器的函数
 */
export function setupUnhandledRejectionCapture(): () => void {
  const onUnhandledRejection = (e: PromiseRejectionEvent): void => {
    useErrorStore.getState().pushError(e.reason);
  };
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
}
