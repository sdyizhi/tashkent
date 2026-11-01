export interface AltTabCandidate {
  /** 窗口 id */
  id: string;
  /** 窗口标题 */
  title: string;
  /** 窗口图标 */
  icon: string;
}

interface Props {
  /** 候选窗口列表 */
  candidates: AltTabCandidate[];
  /** 当前高亮选中的窗口 id */
  activeId: string | null;
  /** 激活选中的窗口 */
  onActivate: (id: string) => void;
  /** 取消切换（松开 Alt 而未按下 Tab） */
  onCancel: () => void;
}

/**
 * XP 风格 Alt+Tab 窗口切换对话框。
 *
 * XP 原版显示窗口缩略图；本阶段先显示图标 + 标题文字，
 * 缩略图渲染留到 M6 视觉打磨阶段。
 */
export default function AltTabSwitcher({ candidates, activeId, onActivate, onCancel }: Props) {
  if (candidates.length === 0) return null;

  return (
    <div className="xp-modal-mask" data-testid="alt-tab-switcher">
      <div className="xp-alt-tab" role="dialog" aria-label="切换窗口">
        <div className="xp-alt-tab-items">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="xp-alt-tab-item"
              data-testid={`alt-tab-item-${c.id}`}
              data-active={c.id === activeId ? 'true' : 'false'}
              onClick={() => onActivate(c.id)}
              onDoubleClick={() => onActivate(c.id)}
            >
              <span className="xp-alt-tab-icon" aria-hidden="true">
                {c.icon}
              </span>
              <span className="xp-alt-tab-title">{c.title}</span>
            </div>
          ))}
        </div>
        <div className="xp-dialog-buttons">
          <button
            type="button"
            className="xp-btn xp-dialog-btn"
            data-testid="alt-tab-cancel"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
