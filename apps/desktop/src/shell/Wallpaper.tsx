/**
 * Bliss 壁纸。
 *
 * 不引用外部图片（避免网络依赖与版权风险），用多层 CSS 渐变模拟 XP 经典壁纸：
 * 蓝天 + 白云 + 远近两层起伏绿丘。
 *
 * 云层刻意避开「一团羽化过度的径向渐变」——那种画法在 100% 缩放下只会糊成灰白污渍。
 * 现在的做法是多个椭圆团簇叠加：
 *  - 每个团块是一个 border-radius:50% 的元素，轮廓由圆角硬切，边缘锐利；
 *  - 团块是纯白的，靠很轻的投影与环境遮蔽暗示球面，而不是各画各的渐变
 *    （那样相邻团块之间会出现生硬的色调边界，整朵云像一摞白球）；
 *  - 真正的灰在云底 —— 积云背光的那一面，也是 XP Bliss 最标志性的平底。
 *
 * 团块的几何（位置/尺寸）用索引修饰类描述，材质（渐变/投影）用语义修饰类描述。
 *
 * 数组顺序即绘制顺序：后排先画、被前排压住。
 * 'base' 是压在最下面的平底灰白底盘，'body' 是白色主体，
 * 'crown' 是最高最白的云冠。
 */
const LARGE_PUFFS = [
  'base',
  'body', 'body', 'body', 'body', 'body', 'body', 'body', 'body', 'body',
  'crown', 'crown',
] as const;
const SMALL_PUFFS = [
  'base',
  'body', 'body', 'body', 'body', 'body', 'body', 'body',
  'crown',
] as const;

export default function Wallpaper() {
  return (
    <div className="xp-wallpaper" data-testid="wallpaper">
      <div className="xp-wallpaper-sky" data-testid="wallpaper-sky" />
      <div className="xp-wallpaper-cloud" data-testid="wallpaper-cloud">
        {/* 左上方的大朵积云（XP 原图的主云） */}
        <div className="xp-cloud xp-cloud--large" data-testid="wallpaper-cloud-large">
          {LARGE_PUFFS.map((kind, i) => (
            <span key={i} className={`xp-puff xp-puff--${kind} xp-puff--l${i}`} />
          ))}
        </div>
        {/* 右侧的中等云 */}
        <div className="xp-cloud xp-cloud--small" data-testid="wallpaper-cloud-small">
          {SMALL_PUFFS.map((kind, i) => (
            <span key={i} className={`xp-puff xp-puff--${kind} xp-puff--s${i}`} />
          ))}
        </div>
      </div>
      <div className="xp-wallpaper-hill far" data-testid="wallpaper-hill-far" />
      <div className="xp-wallpaper-hill" data-testid="wallpaper-hill" />
    </div>
  );
}
