import { Container, Graphics, type Application, type Ticker } from 'pixi.js';

const HEX_SIZE = 64;

/** Corner points of a pointy-top hexagon centered at the origin. */
function hexCorners(size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    points.push(size * Math.cos(angle), size * Math.sin(angle));
  }
  return points;
}

/**
 * M0 placeholder scene: a single slowly rotating hex, kept centered on resize.
 * Proves the Pixi render loop and resizing work. Replaced by the map renderer in M1.
 */
export function createScene(app: Application): () => void {
  const world = new Container();
  app.stage.addChild(world);

  const hex = new Graphics()
    .poly(hexCorners(HEX_SIZE))
    .fill('#d9a441')
    .stroke({ width: 4, color: '#f2e3c2' });
  world.addChild(hex);

  const center = () => {
    world.position.set(app.screen.width / 2, app.screen.height / 2);
  };
  center();
  app.renderer.on('resize', center);

  const spin = (ticker: Ticker) => {
    hex.rotation += 0.005 * ticker.deltaTime;
  };
  app.ticker.add(spin);

  return () => {
    app.ticker.remove(spin);
    app.renderer.off('resize', center);
  };
}
