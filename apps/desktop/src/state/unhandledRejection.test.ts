import { beforeEach, describe, expect, it } from 'vitest';
import { useErrorStore } from './errorStore.js';
import { setupUnhandledRejectionCapture } from './unhandledRejection.js';

/**
 * 派发一个 unhandledrejection 事件。
 *
 * jsdom 没有实现 PromiseRejectionEvent，这里用普通 Event 带上 reason 属性，
 * 事件的语义与浏览器一致。
 */
function dispatchRejection(reason: unknown): void {
  const event = new Event('unhandledrejection');
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);
}

describe('全局 unhandledrejection 捕获', () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: [] });
  });

  it('未捕获的 Promise rejection 被记录到错误状态', () => {
    const dispose = setupUnhandledRejectionCapture();

    dispatchRejection(new Error('网络炸了'));

    const errors = useErrorStore.getState().errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('网络炸了');
    dispose();
  });

  it('字符串原因也能记录', () => {
    const dispose = setupUnhandledRejectionCapture();

    dispatchRejection('字符串错误');

    expect(useErrorStore.getState().errors[0]?.message).toBe('字符串错误');
    dispose();
  });

  it('注销后不再捕获', () => {
    const dispose = setupUnhandledRejectionCapture();
    dispose();

    dispatchRejection(new Error('迟到的错误'));

    expect(useErrorStore.getState().errors).toHaveLength(0);
  });
});
