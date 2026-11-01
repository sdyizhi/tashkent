/**
 * Bliss 壁纸。
 *
 * 不引用外部图片（避免网络依赖与版权风险），用多层 CSS 渐变模拟 XP 经典壁纸：
 * 蓝天 + 白云 + 远近两层起伏绿丘。
 */
export default function Wallpaper() {
  return (
    <div className="xp-wallpaper" data-testid="wallpaper">
      <div className="xp-wallpaper-sky" data-testid="wallpaper-sky" />
      <div className="xp-wallpaper-cloud" data-testid="wallpaper-cloud" />
      <div className="xp-wallpaper-hill far" data-testid="wallpaper-hill-far" />
      <div className="xp-wallpaper-hill" data-testid="wallpaper-hill" />
    </div>
  );
}
