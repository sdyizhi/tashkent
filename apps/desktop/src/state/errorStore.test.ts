import { beforeEach, describe, expect, it } from 'vitest';
import { useErrorStore } from './errorStore.js';

describe('errorStore 未捕获异常', () => {
  beforeEach(() => {
    useErrorStore.setState({ errors: [] });
  });

  it('记录一条未捕获异常', () => {
    useErrorStore.getState().pushError('Promise 炸了');
    const errors = useErrorStore.getState().errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe('Promise 炸了');
  });

  it('托盘红点数量等于未处理异常数量', () => {
    useErrorStore.getState().pushError('一');
    useErrorStore.getState().pushError('二');
    expect(useErrorStore.getState().errors).toHaveLength(2);
  });

  it('清除异常后红点消失', () => {
    useErrorStore.getState().pushError('一');
    const id = useErrorStore.getState().errors[0]!.id;
    useErrorStore.getState().clearError(id);
    expect(useErrorStore.getState().errors).toHaveLength(0);
  });

  it('一次性清空所有异常', () => {
    useErrorStore.getState().pushError('一');
    useErrorStore.getState().pushError('二');
    useErrorStore.getState().clearAll();
    expect(useErrorStore.getState().errors).toHaveLength(0);
  });

  it('每条异常有唯一 id', () => {
    useErrorStore.getState().pushError('一');
    useErrorStore.getState().pushError('一');
    const ids = useErrorStore.getState().errors.map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('错误信息为对象时也能转成可读文本', () => {
    useErrorStore.getState().pushError(new Error('对象错误'));
    expect(useErrorStore.getState().errors[0]?.message).toContain('对象错误');
  });
});
