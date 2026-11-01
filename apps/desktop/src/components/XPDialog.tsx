import type { ReactNode } from 'react';

interface Props {
  /** 对话框标题（XP 风格蓝色标题栏上的文字） */
  title: string;
  /** 主体信息，通常是错误描述 */
  message: string;
  /** 标题栏图标，默认黄色感叹号 */
  icon?: string;
  /** 关闭按钮回调 */
  onClose: () => void;
  /** 额外的正文内容 */
  children?: ReactNode;
}

/**
 * XP 风格模态对话框。
 *
 * 设计文档 5.6：工具执行失败等错误以 XP 风格对话框呈现，
 * 而不是浏览器默认的 alert 弹窗。
 */
export default function XPDialog({ title, message, icon = '❗', onClose, children }: Props) {
  return (
    <div className="xp-modal-mask" data-testid="xp-dialog">
      <div className="xp-dialog" role="alertdialog" aria-label={title}>
        <div className="xp-dialog-title">
          <span className="xp-dialog-icon" aria-hidden="true">
            {icon}
          </span>
          <span>{title}</span>
        </div>
        <div className="xp-dialog-body">
          <div className="xp-dialog-message">{message}</div>
          {children}
        </div>
        <div className="xp-dialog-buttons">
          <button
            type="button"
            className="xp-btn xp-dialog-btn default"
            data-testid="xp-dialog-close"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
