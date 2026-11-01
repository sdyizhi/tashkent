import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  /** 用户点击「关闭」时回调（一般用于关闭崩溃的窗口） */
  onClose?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * XP 风格错误边界。
 *
 * 设计文档 5.6：每个窗口应用包一层 ErrorBoundary，
 * 单窗口崩溃只影响该窗口，不会让整个桌面白屏。
 */
export default class XPErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 记录到控制台，方便开发期定位；生产环境不会因此崩溃
    console.error('[XPErrorBoundary] 窗口内容渲染失败', error, info.componentStack);
  }

  /** 用户点击「关闭」：清掉错误状态并通知上层 */
  private handleClose = (): void => {
    this.setState({ error: null });
    this.props.onClose?.();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="xp-error-boundary" data-testid="xp-error-boundary" role="alert">
        <div className="xp-dialog-title">
          <span className="xp-dialog-icon" aria-hidden="true">
            ❗
          </span>
          <span>错误</span>
        </div>
        <div className="xp-error-boundary-body">
          <div className="xp-error-boundary-message">此窗口遇到意外错误，已停止运行。</div>
          <pre className="xp-dialog-args" data-testid="xp-error-boundary-message">
            {error.message}
          </pre>
        </div>
        <div className="xp-dialog-buttons">
          <button
            type="button"
            className="xp-btn xp-dialog-btn default"
            data-testid="xp-error-boundary-close"
            onClick={this.handleClose}
          >
            关闭
          </button>
        </div>
      </div>
    );
  }
}
