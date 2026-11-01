export default function Wallpaper() {
  return (
    <div
      data-testid="wallpaper"
      style={{
        position: 'absolute',
        inset: '0 0 30px 0',
        background:
          'radial-gradient(ellipse at 30% 20%, #8fb4e8 0%, #4b7bc4 45%, #1e3f6b 100%)',
      }}
    />
  );
}
